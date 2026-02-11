import { db } from "@/db";
import { images } from "@/db/schema";
import { nanoid } from "nanoid";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivities, logActivity } from "@/lib/activity";
import { processImage } from "@/lib/image-processing";
import { uploadBuffer, getS3Object, generateDownloadUrl } from "@/lib/s3";
import { eq, inArray, and, isNull } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { verifyGuestToken } from "@/lib/auth/tokens";

export type ConfirmUploadData = {
    albumId: string;
    s3Key: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
};

export class ImageService {
    static async getImage(userId: string | null, imageId: string) {
        const image = await db.query.images.findFirst({
            where: eq(images.id, imageId),
            with: {
                album: true
            }
        });

        if (!image) return null;

        let hasAccess = image.album.visibility === "public";

        if (!hasAccess) {
            if (userId) {
                hasAccess = await checkAlbumPermission(userId, image.albumId, "viewer");
            } else {
                const cookieStore = await cookies();
                const guestToken = cookieStore.get("keproop_guest_access")?.value;
                if (guestToken) {
                    const payload = await verifyGuestToken(guestToken);
                    if (payload && payload.allowedAlbums.includes(image.albumId)) {
                        hasAccess = true;
                    }
                }
            }
        }

        if (!hasAccess) {
            throw new Error("Forbidden");
        }

        const thumbUrl = image.s3KeyThumb ? await generateDownloadUrl(image.s3KeyThumb) : null;
        const displayUrl = image.s3KeyDisplay ? await generateDownloadUrl(image.s3KeyDisplay) : null;
        const originalUrl = image.s3KeyOriginal ? await generateDownloadUrl(image.s3KeyOriginal) : null;
        const url = await generateDownloadUrl(image.s3KeyDisplay || image.s3KeyOriginal || image.s3Key!);

        return {
            url,
            thumbUrl,
            displayUrl,
            originalUrl,
        };
    }

    static async deleteImage(userId: string, imageId: string) {
        const image = await db.query.images.findFirst({
            where: eq(images.id, imageId),
        });

        if (!image) throw new Error("Not found");

        const hasAccess = await checkAlbumPermission(userId, image.albumId, "editor");
        if (!hasAccess) throw new Error("Forbidden");

        await db.update(images).set({
            deletedAt: new Date(),
            deletedBy: userId
        }).where(eq(images.id, imageId));

        await logActivity({
            userId,
            albumId: image.albumId,
            imageId: image.id,
            action: "image_delete",
        });
    }

    static async restoreImage(userId: string, imageId: string) {
        const image = await db.query.images.findFirst({
            where: eq(images.id, imageId),
        });

        if (!image) throw new Error("Not found");

        const hasAccess = await checkAlbumPermission(userId, image.albumId, "editor");
        if (!hasAccess) throw new Error("Forbidden");

        await db.update(images).set({
            deletedAt: null,
            deletedBy: null
        }).where(eq(images.id, imageId));

        await logActivity({
            userId,
            albumId: image.albumId,
            imageId: image.id,
            action: "image_restore",
        });
    }

    static async confirmUpload(userId: string, data: ConfirmUploadData) {
        const canUpload = await checkAlbumPermission(userId, data.albumId, "editor");
        if (!canUpload) {
            throw new Error("Forbidden");
        }

        const [image] = await db.insert(images).values({
            albumId: data.albumId,
            uploaderId: userId,
            s3Key: data.s3Key,
            mimeType: data.mimeType,
            size: data.size,
            width: data.width,
            height: data.height,
        }).returning();

        return image;
    }

    static async processAndUpload(userId: string, file: File, albumId: string, folderId?: string) {
        const canUpload = await checkAlbumPermission(userId, albumId, "editor");
        if (!canUpload) {
            throw new Error("Forbidden");
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const processed = await processImage(buffer);

        const baseKey = `albums/${albumId}/${nanoid()}`;
        const keyOriginal = `${baseKey}/original.webp`;
        const keyDisplay = `${baseKey}/display.webp`;
        const keyThumb = `${baseKey}/thumb.webp`;

        await Promise.all([
            uploadBuffer(keyOriginal, processed.originalBuffer, "image/webp"),
            uploadBuffer(keyDisplay, processed.displayBuffer, "image/webp"),
            uploadBuffer(keyThumb, processed.thumbBuffer, "image/webp"),
        ]);

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

        await logActivity({
            userId,
            albumId,
            imageId: image.id,
            folderId: folderId,
            action: "image_upload",
            metadata: {
                filename: file.name,
                size: file.size,
                width: processed.width,
                height: processed.height,
            },
        });

        return image;
    }

    static async bulkDelete(userId: string, albumId: string, imageIds: string[]) {
        const canEdit = await checkAlbumPermission(userId, albumId, "editor");
        if (!canEdit) throw new Error("Forbidden");

        const imagesToDelete = await db.query.images.findMany({
            where: and(
                inArray(images.id, imageIds),
                eq(images.albumId, albumId),
                isNull(images.deletedAt)
            ),
        });

        if (imagesToDelete.length === 0) return 0;

        const validIds = imagesToDelete.map(img => img.id);
        await db.update(images)
            .set({
                deletedAt: new Date(),
                deletedBy: userId,
            })
            .where(inArray(images.id, validIds));

        await logActivities(
            imagesToDelete.map(img => ({
                userId,
                albumId,
                imageId: img.id,
                action: "image_delete" as const,
                metadata: { bulk: true },
            }))
        );

        return validIds.length;
    }

    static async bulkMove(userId: string, albumId: string, imageIds: string[], targetFolderId: string | null) {
        const canEdit = await checkAlbumPermission(userId, albumId, "editor");
        if (!canEdit) throw new Error("Forbidden");

        const validImages = await db.query.images.findMany({
            where: and(
                inArray(images.id, imageIds),
                eq(images.albumId, albumId),
                isNull(images.deletedAt)
            ),
        });

        if (validImages.length === 0) return 0;

        const validIds = validImages.map(img => img.id);

        await db.update(images)
            .set({ folderId: targetFolderId, updatedAt: new Date() })
            .where(inArray(images.id, validIds));

        await logActivities(
            validImages.map(img => ({
                userId,
                albumId,
                imageId: img.id,
                folderId: targetFolderId || undefined,
                action: "image_update" as const,
                metadata: { move: true, fromFolder: img.folderId, toFolder: targetFolderId },
            }))
        );

        return validIds.length;
    }

    static async getImagesForDownload(userId: string, albumId: string, imageIds: string[]) {
        const canView = await checkAlbumPermission(userId, albumId, "viewer");
        if (!canView) throw new Error("Forbidden");

        const imagesToDownload = await db.query.images.findMany({
            where: and(
                inArray(images.id, imageIds),
                eq(images.albumId, albumId),
                isNull(images.deletedAt)
            ),
        });

        return imagesToDownload;
    }
}
