import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { processImage } from "@/lib/image-processing";
import { uploadBuffer } from "@/lib/s3";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { images } from "@/db/schema";
import { nanoid } from "nanoid";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

// Maximum file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(request: Request) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const albumId = formData.get("albumId") as string | null;
        const folderId = formData.get("folderId") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!albumId) {
            return NextResponse.json({ error: "Album ID is required" }, { status: 400 });
        }

        // Check file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
        }

        // Check content type
        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
        }

        // Check permission
        const canUpload = await checkAlbumPermission(userId, albumId, "editor");
        if (!canUpload) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Process image with sharp
        const processed = await processImage(buffer);

        // Generate S3 keys
        const baseKey = `albums/${albumId}/${nanoid()}`;
        const keyOriginal = `${baseKey}/original.webp`;
        const keyDisplay = `${baseKey}/display.webp`;
        const keyThumb = `${baseKey}/thumb.webp`;

        // Upload all three variants to S3
        await Promise.all([
            uploadBuffer(keyOriginal, processed.originalBuffer, "image/webp"),
            uploadBuffer(keyDisplay, processed.displayBuffer, "image/webp"),
            uploadBuffer(keyThumb, processed.thumbBuffer, "image/webp"),
        ]);

        // Insert into database
        const [image] = await db.insert(images).values({
            albumId,
            folderId: folderId || null,
            uploaderId: userId,
            s3KeyOriginal: keyOriginal,
            s3KeyDisplay: keyDisplay,
            s3KeyThumb: keyThumb,
            s3Key: keyOriginal, // Backward compatibility
            mimeType: "image/webp",
            originalFilename: file.name,
            size: file.size,
            width: processed.width,
            height: processed.height,
            dateTaken: processed.exif?.dateTaken || null,
            cameraMake: processed.exif?.cameraMake || null,
            cameraModel: processed.exif?.cameraModel || null,
            gpsLatitude: processed.exif?.gpsLatitude?.toString() || null,
            gpsLongitude: processed.exif?.gpsLongitude?.toString() || null,
        }).returning();

        // Log activity
        await logActivity({
            userId,
            albumId,
            imageId: image.id,
            folderId: folderId || undefined,
            action: "image_upload",
            metadata: {
                filename: file.name,
                size: file.size,
                width: processed.width,
                height: processed.height,
            },
        });

        return NextResponse.json({
            image: {
                id: image.id,
                width: image.width,
                height: image.height,
                dateTaken: image.dateTaken,
            }
        });

    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
    }
}
