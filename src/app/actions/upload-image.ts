'use server';


// Removed maxDuration as it's not allowed in 'use server' files directly without a layout/page config


import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { processImage } from "@/lib/image-processing";
import { uploadBuffer } from "@/lib/s3";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { images } from "@/db/schema";
import { nanoid } from "nanoid";

// Maximum file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

export async function uploadImageAction(formData: FormData) {
    console.log("Server Action: Starting uploadImageAction");
    const userId = await getUserId();
    if (!userId) {
        console.log("Server Action: No userId");
        return { error: "Unauthorized" };
    }

    try {
        console.log("Server Action: Getting form data");
        const file = formData.get("file") as File | null;
        const albumId = formData.get("albumId") as string | null;
        const folderId = formData.get("folderId") as string | null;

        if (!file) return { error: "No file provided" };
        if (!albumId) return { error: "Album ID is required" };

        console.log(`Server Action: File received: ${file.name}, size: ${file.size}, type: ${file.type}`);

        if (file.size > MAX_FILE_SIZE) {
            return { error: "File too large (max 50MB)" };
        }

        if (!file.type.startsWith("image/")) {
            return { error: "Only image files are allowed" };
        }

        const canUpload = await checkAlbumPermission(userId, albumId, "editor");
        if (!canUpload) {
            return { error: "Forbidden" };
        }

        console.log("Server Action: Reading array buffer");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log("Server Action: Processing image with sharp");
        // Log time taken for processing
        const startProcess = Date.now();
        const processed = await processImage(buffer);
        console.log(`Server Action: Image processed in ${(Date.now() - startProcess) / 1000}s`);

        const baseKey = `albums/${albumId}/${nanoid()}`;
        const keyOriginal = `${baseKey}/original.webp`;
        const keyDisplay = `${baseKey}/display.webp`;
        const keyThumb = `${baseKey}/thumb.webp`;

        console.log("Server Action: Uploading to S3");
        await Promise.all([
            uploadBuffer(keyOriginal, processed.originalBuffer, "image/webp"),
            uploadBuffer(keyDisplay, processed.displayBuffer, "image/webp"),
            uploadBuffer(keyThumb, processed.thumbBuffer, "image/webp"),
        ]);
        console.log("Server Action: Upload to S3 complete");

        const [image] = await db.insert(images).values({
            albumId,
            folderId: folderId || null,
            uploaderId: userId,
            s3KeyOriginal: keyOriginal,
            s3KeyDisplay: keyDisplay,
            s3KeyThumb: keyThumb,
            s3Key: keyOriginal,
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

        console.log("Server Action: DB insert complete, logging activity");
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

        console.log("Server Action: Success, returning");
        return {
            success: true,
            image: {
                id: image.id,
                width: image.width,
                height: image.height,
                dateTaken: image.dateTaken,
            }
        };

    } catch (error) {
        console.error("Upload error details:", error);
        return { error: "Failed to process image" };
    }
}
