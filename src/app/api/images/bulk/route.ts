import { NextResponse } from "next/server";
import { z } from "zod";
import archiver from "archiver";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
import { ImageService } from "@/lib/services/image.service";
import { getS3Object } from "@/lib/s3";

const bulkSchema = z.object({
    action: z.enum(["delete", "download", "move"]),
    imageIds: z.array(z.string().uuid()).min(1).max(100),
    albumId: z.string().uuid(),
    targetFolderId: z.string().uuid().nullable().optional(),
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
 *     responses:
 *       200:
 *         description: Operation successful
 */
export async function POST(request: Request) {
    const { userId, apiKey } = await getAuthContext();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (apiKey) {
        const limitCheck = await checkRateLimits(apiKey.id, apiKey.rateLimit, apiKey.rateLimitPerDay, request);
        if (!limitCheck.ok) {
            return NextResponse.json(limitCheck.error, { status: limitCheck.status });
        }
    }

    try {
        const body = await request.json();
        const { action, imageIds, albumId, targetFolderId } = bulkSchema.parse(body);

        if (action === "delete") {
            const count = await ImageService.bulkDelete(userId, albumId, imageIds);
            if (apiKey) await logApiKeyUsage(apiKey.id, request, 200);
            return NextResponse.json({ success: true, deletedCount: count });

        } else if (action === "move") {
            const count = await ImageService.bulkMove(userId, albumId, imageIds, targetFolderId || null);
            if (apiKey) await logApiKeyUsage(apiKey.id, request, 200);
            return NextResponse.json({ success: true, movedCount: count });

        } else if (action === "download") {
            const imagesToDownload = await ImageService.getImagesForDownload(userId, albumId, imageIds);

            if (imagesToDownload.length === 0) {
                return NextResponse.json({ error: "No valid images to download" }, { status: 400 });
            }

            const archive = archiver('zip', { zlib: { level: 5 } });
            const stream = new TransformStream();
            const writer = stream.writable.getWriter();

            archive.on('data', (chunk) => writer.write(chunk));
            archive.on('end', () => writer.close());
            archive.on('error', (err) => writer.abort(err));

            (async () => {
                for (const img of imagesToDownload) {
                    try {
                        const key = img.s3KeyOriginal || img.s3Key;
                        if (!key) continue;
                        const s3Response = await getS3Object(key);
                        if (s3Response.Body) {
                            const filename = img.originalFilename || `${img.id}.webp`;
                            // @ts-ignore
                            archive.append(s3Response.Body, { name: filename });
                        }
                    } catch (err) {
                        console.error(`Failed to add image ${img.id}`, err);
                    }
                }
                archive.finalize();
            })().catch((err) => {
                console.error("Archive failed", err);
                writer.abort(err);
            });

            if (apiKey) await logApiKeyUsage(apiKey.id, request, 200);

            return new NextResponse(stream.readable, {
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': `attachment; filename="photos-${albumId.slice(0, 8)}.zip"`,
                },
            });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        if (error instanceof Error && error.message === "Forbidden") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        console.error("Bulk error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
