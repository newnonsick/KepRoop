
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { images } from "@/db/schema";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

export async function POST(request: Request) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            albumId,
            s3Key,
            mimeType,
            size,
            width,
            height,
            filename,
            folderId,
            exif
        } = body;

        if (!albumId || !s3Key) {
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
            s3KeyOriginal: s3Key,
            s3KeyDisplay: s3Key, // Reuse original
            s3KeyThumb: s3Key,   // Reuse original
            s3Key: s3Key,        // Backward compatibility
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
        });

    } catch (error) {
        console.error("Image registration error:", error);
        return NextResponse.json({ error: "Failed to register image" }, { status: 500 });
    }
}
