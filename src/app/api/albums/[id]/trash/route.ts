
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission, getAlbumRole } from "@/lib/auth/rbac";
import { db } from "@/db";
import { images, users } from "@/db/schema";
import { eq, isNotNull, and, desc, inArray } from "drizzle-orm";
import { deleteS3Object, generateDownloadUrl } from "@/lib/s3";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check permission: Owner or Editor can view trash
    // User requested: "Editor can View trash"
    const role = await getAlbumRole(userId, albumId);
    if (role !== "owner" && role !== "editor") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch deleted images with deleter info
    const deletedImages = await db.select({
        id: images.id,
        s3Key: images.s3Key,
        deletedAt: images.deletedAt,
        deleterName: users.name,
        deleterAvatar: users.avatarUrl,
    })
        .from(images)
        .leftJoin(users, eq(images.deletedBy, users.id))
        .where(and(eq(images.albumId, albumId), isNotNull(images.deletedAt)))
        .orderBy(desc(images.deletedAt));

    // Generate signed URLs for thumbnails
    const imagesWithUrls = await Promise.all(deletedImages.map(async (img) => ({
        ...img,
        url: await generateDownloadUrl(img.s3Key)
    })));

    return NextResponse.json({ images: imagesWithUrls });
}

export async function DELETE(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check permission: Only Owner can permanent delete
    // User requested: "make only owner can permanent delete a photo in recyclebin"
    const hasAccess = await checkAlbumPermission(userId, albumId, "owner");
    if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden: Only owners can permanently delete items" }, { status: 403 });
    }

    const { imageIds } = await request.json().catch(() => ({ imageIds: [] }));

    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
        return NextResponse.json({ error: "No images specified" }, { status: 400 });
    }

    // Get images to verify they belong to this album and get S3 keys
    const imagesToDelete = await db.select()
        .from(images)
        .where(
            and(
                eq(images.albumId, albumId),
                inArray(images.id, imageIds),
                isNotNull(images.deletedAt) // Ensure they are already in trash
            )
        );

    // Hard delete from S3 and DB
    for (const img of imagesToDelete) {
        await deleteS3Object(img.s3Key);
    }

    if (imagesToDelete.length > 0) {
        await db.delete(images).where(inArray(images.id, imagesToDelete.map(img => img.id)));
    }

    return NextResponse.json({ success: true, count: imagesToDelete.length });
}
