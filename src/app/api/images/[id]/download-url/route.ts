import { NextResponse } from "next/server";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { generateDownloadUrl } from "@/lib/s3";
import { db } from "@/db";
import { images } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";

/**
 * @swagger
 * /api/images/{id}/download-url:
 *   get:
 *     tags:
 *       - Images
 *     summary: Get download URL
 *     description: Get a signed URL for downloading an image.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Download URL
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId, apiKey } = await getAuthContext();
    const resolvedParams = await params;
    const imageId = resolvedParams.id;

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
        // 1. Get image details to find albumId
        const image = await db.query.images.findFirst({
            where: eq(images.id, imageId),
            columns: {
                id: true,
                albumId: true,
                s3Key: true,
                s3KeyOriginal: true,
                originalFilename: true,
            }
        });

        if (!image) {
            return NextResponse.json({ error: "Image not found" }, { status: 404 });
        }

        // 2. Check viewer permission
        const canView = await checkAlbumPermission(userId, image.albumId, "viewer");
        if (!canView) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 3. Generate fresh URL
        // 3. Generate fresh URL
        // Prefer original key, fallback to standard key
        const key = image.s3KeyOriginal || image.s3Key;

        if (!key) {
            return NextResponse.json({ error: "Image key not found" }, { status: 404 });
        }

        const url = await generateDownloadUrl(key);

        // Use original filename or fallback
        const filename = image.originalFilename || `photo-${image.id}.webp`;

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return NextResponse.json({ url, filename });

    } catch (error) {
        console.error("Download URL error:", error);
        return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }
}
