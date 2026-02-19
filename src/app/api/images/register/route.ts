
import { NextResponse } from "next/server";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { images } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";

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
 *               exif:
 *                 type: object
 *                 properties:
 *                   dateTaken:
 *                     type: string
 *                     format: date-time
 *                   cameraMake:
 *                     type: string
 *                   cameraModel:
 *                     type: string
 *                   gpsLatitude:
 *                     type: number
 *                     description: Decimal latitude (-90 to 90)
 *                   gpsLongitude:
 *                     type: number
 *                     description: Decimal longitude (-180 to 180)
 *     responses:
 *       200:
 *         description: Image registered
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

        // Parse and validate GPS coordinates for map feature
        // Handles both decimal numbers and DMS comma-separated strings ("40,27,28.97")
        function parseGpsValue(val: any): number | null {
            if (val == null) return null;
            // If it's already a finite number, use it directly
            const num = Number(val);
            if (isFinite(num)) return num;
            // Try to parse DMS format: "degrees,minutes,seconds"
            const str = String(val);
            const parts = str.split(',').map(p => parseFloat(p.trim()));
            if (parts.length === 3 && parts.every(p => isFinite(p))) {
                return parts[0] + parts[1] / 60 + parts[2] / 3600;
            }
            return null;
        }

        const rawLat = parseGpsValue(exif?.gpsLatitude);
        const rawLng = parseGpsValue(exif?.gpsLongitude);
        const gpsLat = rawLat != null && rawLat >= -90 && rawLat <= 90 ? rawLat : null;
        const gpsLng = rawLng != null && rawLng >= -180 && rawLng <= 180 ? rawLng : null;

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
            gpsLat,
            gpsLng,
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

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 201);
        }

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
