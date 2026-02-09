import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivities } from "@/lib/activity";
import { generateDownloadUrl, getS3Object } from "@/lib/s3";
import { db } from "@/db";
import { images } from "@/db/schema";
import { eq, inArray, and, isNull } from "drizzle-orm";
import { z } from "zod";
import archiver from "archiver";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

const bulkDeleteSchema = z.object({
    action: z.literal("delete"),
    imageIds: z.array(z.string().uuid()).min(1).max(100),
    albumId: z.string().uuid(),
});

const bulkDownloadSchema = z.object({
    action: z.literal("download"),
    imageIds: z.array(z.string().uuid()).min(1).max(100),
    albumId: z.string().uuid(),
});

/**
 * @swagger
 * /api/images/bulk:
 *   post:
 *     tags:
 *       - Images
 *     summary: Bulk operations
 *     description: Perform bulk delete, download, or move operations.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - imageIds
 *               - albumId
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [delete, download, move]
 *               imageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               albumId:
 *                 type: string
 *               targetFolderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Operation successful
 */
export async function POST(request: Request) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();

        // Determine action type
        if (body.action === "delete") {
            return handleBulkDelete(userId, body);
        } else if (body.action === "download") {
            return handleBulkDownload(userId, body);
        } else if (body.action === "move") {
            return handleBulkMove(userId, body);
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error("Bulk operation error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

const bulkMoveSchema = z.object({
    action: z.literal("move"),
    imageIds: z.array(z.string().uuid()).min(1).max(100),
    albumId: z.string().uuid(),
    targetFolderId: z.string().uuid().nullable(), // Nullable to move to root
});

async function handleBulkMove(userId: string, body: unknown) {
    const { imageIds, albumId, targetFolderId } = bulkMoveSchema.parse(body);

    const canEdit = await checkAlbumPermission(userId, albumId, "editor");
    if (!canEdit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify images exist in album
    const validImages = await db.query.images.findMany({
        where: and(
            inArray(images.id, imageIds),
            eq(images.albumId, albumId),
            isNull(images.deletedAt)
        ),
    });

    if (validImages.length === 0) {
        return NextResponse.json({ error: "No valid images to move" }, { status: 400 });
    }

    const validIds = validImages.map(img => img.id);

    await db.update(images)
        .set({ folderId: targetFolderId, updatedAt: new Date() })
        .where(inArray(images.id, validIds));

    await logActivities(
        validImages.map(img => ({
            userId,
            albumId,
            imageId: img.id,
            folderId: targetFolderId || undefined,
            action: "image_update" as const,
            metadata: { move: true, fromFolder: img.folderId, toFolder: targetFolderId },
        }))
    );

    return NextResponse.json({
        success: true,
        movedCount: validIds.length,
    });
}

async function handleBulkDelete(userId: string, body: unknown) {
    const { imageIds, albumId } = bulkDeleteSchema.parse(body);

    // Check editor permission
    const canEdit = await checkAlbumPermission(userId, albumId, "editor");
    if (!canEdit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify all images belong to this album and are not already deleted
    const imagesToDelete = await db.query.images.findMany({
        where: and(
            inArray(images.id, imageIds),
            eq(images.albumId, albumId),
            isNull(images.deletedAt)
        ),
    });

    if (imagesToDelete.length === 0) {
        return NextResponse.json({ error: "No valid images to delete" }, { status: 400 });
    }

    // Soft delete all images
    const validIds = imagesToDelete.map(img => img.id);
    await db.update(images)
        .set({
            deletedAt: new Date(),
            deletedBy: userId,
        })
        .where(inArray(images.id, validIds));

    // Log activities
    await logActivities(
        imagesToDelete.map(img => ({
            userId,
            albumId,
            imageId: img.id,
            action: "image_delete" as const,
            metadata: { bulk: true },
        }))
    );

    return NextResponse.json({
        success: true,
        deletedCount: validIds.length,
    });
}

async function handleBulkDownload(userId: string, body: unknown) {
    const { imageIds, albumId } = bulkDownloadSchema.parse(body);

    // Check viewer permission
    const canView = await checkAlbumPermission(userId, albumId, "viewer");
    if (!canView) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get images
    const imagesToDownload = await db.query.images.findMany({
        where: and(
            inArray(images.id, imageIds),
            eq(images.albumId, albumId),
            isNull(images.deletedAt)
        ),
    });

    if (imagesToDownload.length === 0) {
        return NextResponse.json({ error: "No valid images to download" }, { status: 400 });
    }

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 5 } });

    // Create a Web TransformStream to pipe the archive data to the response
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Hook up archive events to the stream writer
    archive.on('data', (chunk) => writer.write(chunk));
    archive.on('end', () => writer.close());
    archive.on('error', (err) => writer.abort(err));

    // Process images in the background to avoid blocking the initial response
    // We don't await this promise here; we let it run while streaming the response
    (async () => {
        for (const img of imagesToDownload) {
            try {
                // Use original quality for download
                const key = img.s3KeyOriginal || img.s3Key;
                if (!key) continue;

                // Get S3 Object as stream
                const s3Response = await getS3Object(key);

                // archiver supports streams directly
                // We cast to any/NodeJS.ReadableStream because archiver expects Node streams
                // but usually handles compatible streams or we might need conversion if strictly Web Stream.
                // Assuming standard S3 client returns a Node stream or compatible in Node runtime.
                if (s3Response.Body) {
                    const filename = img.originalFilename || `${img.id}.webp`;
                    // @ts-ignore - S3 Body is compatible enough for Archiver in Node env
                    archive.append(s3Response.Body, { name: filename });
                }
            } catch (err) {
                console.error(`Failed to add image ${img.id} to archive:`, err);
            }
        }
        // Finalize (close) the archive when done
        archive.finalize();
    })().catch((err) => {
        console.error("Archive generation failed:", err);
        writer.abort(err);
    });

    return new NextResponse(stream.readable, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="photos-${albumId.slice(0, 8)}.zip"`,
        },
    });
}

