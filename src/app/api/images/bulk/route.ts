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

    // Create a promise to collect all data
    const chunks: Buffer[] = [];

    const archivePromise = new Promise<Buffer>((resolve, reject) => {
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
    });

    // Add files to archive
    for (const img of imagesToDownload) {
        try {
            // Use original quality for download
            const key = img.s3KeyOriginal || img.s3Key;
            if (!key) continue;

            const s3Response = await getS3Object(key);
            if (s3Response.Body) {
                const bodyBytes = await s3Response.Body.transformToByteArray();
                const filename = img.originalFilename || `${img.id}.webp`;
                archive.append(Buffer.from(bodyBytes), { name: filename });
            }
        } catch (err) {
            console.error(`Failed to add image ${img.id} to archive:`, err);
        }
    }

    // Finalize the archive (this signals no more files will be added)
    archive.finalize();

    // Wait for all data to be collected
    const zipBuffer = await archivePromise;

    return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="photos-${albumId.slice(0, 8)}.zip"`,
        },
    });
}

