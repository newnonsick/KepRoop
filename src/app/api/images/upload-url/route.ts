
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { generateUploadUrl } from "@/lib/s3";
import { nanoid } from "nanoid";
import { getExtensionFromMime } from "@/lib/image-processing"; // Reusing this helper

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

/**
 * @swagger
 * /api/images/upload-url:
 *   post:
 *     tags:
 *       - Images
 *     summary: Get upload URL
 *     description: Generate presigned S3 URLs for client-side upload.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - filename
 *               - contentType
 *               - albumId
 *             properties:
 *               filename:
 *                 type: string
 *               contentType:
 *                 type: string
 *               albumId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Presigned URLs generated
 */
export async function POST(request: Request) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { filename, contentType, albumId } = await request.json();

        if (!filename || !contentType || !albumId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Check if user has edit permission for the album
        const canUpload = await checkAlbumPermission(userId, albumId, "editor");
        if (!canUpload) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const ext = getExtensionFromMime(contentType);
        const imageId = nanoid();
        const baseKey = `albums/${albumId}/${imageId}`;

        // Define keys for all 3 variants
        // Note: Client will be responsible for converting to WebP, so we enforce .webp extension for display/thumb
        const keyOriginal = `${baseKey}/original.${ext}`;
        const keyDisplay = `${baseKey}/display.webp`;
        const keyThumb = `${baseKey}/thumb.webp`;

        // Generate 3 presigned URLs
        // Original uses original content type (e.g. image/jpeg)
        // Display/Thumb will be image/webp
        const [originalUrl, displayUrl, thumbUrl] = await Promise.all([
            generateUploadUrl(keyOriginal, contentType),
            generateUploadUrl(keyDisplay, "image/webp"),
            generateUploadUrl(keyThumb, "image/webp"),
        ]);

        return NextResponse.json({
            urls: {
                original: originalUrl,
                display: displayUrl,
                thumb: thumbUrl
            },
            keys: {
                original: keyOriginal,
                display: keyDisplay,
                thumb: keyThumb
            },
            imageId,
            baseKey
        });

    } catch (error) {
        console.error("Presigned URL error:", error);
        return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
    }
}
