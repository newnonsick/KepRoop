
import { NextResponse } from "next/server";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { images } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/auth/session";

/**
 * @swagger
 * /api/images/register:
 *   post:
 *     tags:
 *       - Images
 *     summary: Register uploaded image
 *     description: Register an image after successful client-side upload.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - albumId
 *               - s3KeyOriginal
 *             properties:
 *               albumId:
 *                 type: string
 *               s3KeyOriginal:
 *                 type: string
 *               filename:
 *                 type: string
 *               size:
 *                 type: integer
 *               width:
 *                 type: integer
 *               height:
 *                 type: integer
 *               folderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Image registered
 */
export async function POST(request: Request) {
    const userId = await getAuthenticatedUser();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            albumId,
            keys, // { original, display, thumb }
            mimeType,
            size,
            width,
            height,
            filename,
            folderId,
            exif
        } = body;

        // Backward compatibility or fallback if keys object missing
        const s3KeyOriginal = keys?.original || body.s3KeyOriginal || body.s3Key; // Fallback
        const s3KeyDisplay = keys?.display || body.s3KeyDisplay || s3KeyOriginal;
        const s3KeyThumb = keys?.thumb || body.s3KeyThumb || s3KeyOriginal;

        if (!albumId || !s3KeyOriginal) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const canUpload = await checkAlbumPermission(userId, albumId, "editor");
        if (!canUpload) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Since we uploaded directly to S3 (no sharp processing on server),
        // we assume the 's3Key' provided is the 'original'.
        // For display/thumb, we'll currently reuse the original or client needs to upload valid thumbnails.
        // STRATEGY: For now, point everything to the original. Next.js <Image> will optimize it on the fly.

        const [image] = await db.insert(images).values({
            albumId,
            folderId: folderId || null,
            uploaderId: userId,
            s3KeyOriginal,
            s3KeyDisplay,
            s3KeyThumb,
            s3Key: s3KeyOriginal,        // Backward compatibility
            mimeType: mimeType || "application/octet-stream",
            originalFilename: filename || "unknown",
            size: size || 0,
            width: width || 0,
            height: height || 0,
            dateTaken: exif?.dateTaken ? new Date(exif.dateTaken) : null,
            cameraMake: exif?.cameraMake || null,
            cameraModel: exif?.cameraModel || null,
            gpsLatitude: exif?.gpsLatitude?.toString() || null,
            gpsLongitude: exif?.gpsLongitude?.toString() || null,
        }).returning();

        await logActivity({
            userId,
            albumId,
            imageId: image.id,
            folderId: folderId || undefined,
            action: "image_upload",
            metadata: {
                filename: filename,
                size: size,
                width: width,
                height: height,
            },
        });

        return NextResponse.json({
            success: true,
            image: {
                id: image.id,
                width: image.width,
                height: image.height,
                dateTaken: image.dateTaken,
            }
        }, { status: 201 });

    } catch (error) {
        console.error("Image registration error:", error);
        return NextResponse.json({ error: "Failed to register image" }, { status: 500 });
    }
}
