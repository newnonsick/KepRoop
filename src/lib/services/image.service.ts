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
