
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { images } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";

const registerImageSchema = z.object({
    albumId: z.string().uuid(),
    keys: z.object({
        original: z.string().min(1),
        display: z.string().min(1).optional(),
        thumb: z.string().min(1).optional(),
    }).optional(),
    // Backward compatibility fields
    s3KeyOriginal: z.string().optional(),
    s3KeyDisplay: z.string().optional(),
    s3KeyThumb: z.string().optional(),
    s3Key: z.string().optional(),
    mimeType: z.string().default("application/octet-stream"),
    size: z.number().int().nonnegative().default(0),
    width: z.number().int().nonnegative().default(0),
    height: z.number().int().nonnegative().default(0),
    filename: z.string().default("unknown"),
    folderId: z.string().uuid().nullish(),
    exif: z.object({
        dateTaken: z.any().optional(),
        cameraMake: z.string().nullish(),
        cameraModel: z.string().nullish(),
        gpsLatitude: z.union([z.number(), z.string()]).nullish(),
        gpsLongitude: z.union([z.number(), z.string()]).nullish(),
    }).nullish(),
});

/**
 * Parse GPS coordinates from either decimal numbers or DMS comma-separated strings.
 * Example DMS: "40,27,28.97" → 40.463603
 */
function parseGpsValue(val: unknown): number | null {
    if (val == null) return null;
    const num = Number(val);
    if (isFinite(num)) return num;
    const str = String(val);
    const parts = str.split(",").map(p => parseFloat(p.trim()));
    if (parts.length === 3 && parts.every(p => isFinite(p))) {
        return parts[0] + parts[1] / 60 + parts[2] / 3600;
    }
    return null;
}

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
 *             properties:
 *               albumId:
 *                 type: string
 *                 format: uuid
 *               keys:
 *                 type: object
 *                 properties:
 *                   original:
 *                     type: string
 *                   display:
 *                     type: string
 *                   thumb:
 *                     type: string
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
 *                 format: uuid
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
 *                   gpsLongitude:
 *                     type: number
 *     responses:
 *       201:
 *         description: Image registered
 *       400:
 *         description: Invalid input
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
        const data = registerImageSchema.parse(body);

        // Resolve S3 keys with backward compatibility
        const s3KeyOriginal = data.keys?.original || data.s3KeyOriginal || data.s3Key;
        const s3KeyDisplay = data.keys?.display || data.s3KeyDisplay || s3KeyOriginal;
        const s3KeyThumb = data.keys?.thumb || data.s3KeyThumb || s3KeyOriginal;

        if (!s3KeyOriginal) {
            return NextResponse.json({ error: "Missing required field: s3 key for original image" }, { status: 400 });
        }

        const canUpload = await checkAlbumPermission(userId, data.albumId, "editor");
        if (!canUpload) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Parse and validate GPS coordinates
        const rawLat = parseGpsValue(data.exif?.gpsLatitude);
        const rawLng = parseGpsValue(data.exif?.gpsLongitude);
        const gpsLat = rawLat != null && rawLat >= -90 && rawLat <= 90 ? rawLat : null;
        const gpsLng = rawLng != null && rawLng >= -180 && rawLng <= 180 ? rawLng : null;

        const [image] = await db.insert(images).values({
            albumId: data.albumId,
            folderId: data.folderId || null,
            uploaderId: userId,
            s3KeyOriginal,
            s3KeyDisplay,
            s3KeyThumb,
            s3Key: s3KeyOriginal,
            mimeType: data.mimeType,
            originalFilename: data.filename,
            size: data.size,
            width: data.width,
            height: data.height,
            dateTaken: data.exif?.dateTaken ? new Date(data.exif.dateTaken) : null,
            cameraMake: data.exif?.cameraMake || null,
            cameraModel: data.exif?.cameraModel || null,
            gpsLat,
            gpsLng,
        }).returning();

        await logActivity({
            userId,
            albumId: data.albumId,
            imageId: image.id,
            folderId: data.folderId || undefined,
            action: "image_upload",
            metadata: {
                filename: data.filename,
                size: data.size,
                width: data.width,
                height: data.height,
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
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
        }
        console.error("Image registration error:", error);
        return NextResponse.json({ error: "Failed to register image" }, { status: 500 });
    }
}
