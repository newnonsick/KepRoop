import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { generateDownloadUrl, deleteS3Object } from "@/lib/s3";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { images } from "@/db/schema";
import { eq } from "drizzle-orm";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    // Generate Signed URL for viewing
    const { id } = await context.params;
    const userId = await getUserId();

    // 1. Get Image Metadata to know Album ID
    // We can't check permission without Album ID.
    // If public, we might not need auth completely?
    // User Requirement: "Private album -> signed URL", "Public album -> signed URL or public access".
    // We should check DB logic.

    const image = await db.query.images.findFirst({
        where: eq(images.id, id),
        with: {
            album: true
        }
    });

    if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2. Check Permission
    let hasAccess = image.album.visibility === "public";

    if (!hasAccess) {
        if (userId) {
            // Check RBAC for logged-in user
            hasAccess = await checkAlbumPermission(userId, image.albumId, "viewer");
        } else {
            // Check guest access cookie
            const cookieStore = await cookies();
            const guestToken = cookieStore.get("keproop_guest_access")?.value;
            if (guestToken) {
                const { verifyGuestToken } = await import("@/lib/auth/tokens");
                const payload = await verifyGuestToken(guestToken);
                if (payload && payload.allowedAlbums.includes(image.albumId)) {
                    hasAccess = true;
                }
            }
        }
    }

    if (!hasAccess) {
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Generate URLs for all variants
    const thumbUrl = image.s3KeyThumb ? await generateDownloadUrl(image.s3KeyThumb) : null;
    const displayUrl = image.s3KeyDisplay ? await generateDownloadUrl(image.s3KeyDisplay) : null;
    const originalUrl = image.s3KeyOriginal ? await generateDownloadUrl(image.s3KeyOriginal) : null;
    const url = await generateDownloadUrl(image.s3KeyDisplay || image.s3KeyOriginal || image.s3Key!);

    return NextResponse.json({
        url,
        thumbUrl,
        displayUrl,
        originalUrl,
    });
}

export async function DELETE(request: Request, context: Context) {
    const { id } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const image = await db.query.images.findFirst({
        where: eq(images.id, id),
    });

    if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const hasAccess = await checkAlbumPermission(userId, image.albumId, "editor");
    // Wait, Editor can delete ANY image? Usually Editor can upload/delete.
    // "editor: Upload images, Delete images". Yes.

    if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft delete with audit log
    await db.update(images).set({
        deletedAt: new Date(),
        deletedBy: userId
    }).where(eq(images.id, id));

    // Log activity
    await logActivity({
        userId,
        albumId: image.albumId,
        imageId: image.id,
        action: "image_delete",
    });

    return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, context: Context) {
    const { id } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const image = await db.query.images.findFirst({
        where: eq(images.id, id),
    });

    if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Restore: requires editor permission
    const hasAccess = await checkAlbumPermission(userId, image.albumId, "editor");
    if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.action === "restore") {
        await db.update(images).set({
            deletedAt: null,
            deletedBy: null
        }).where(eq(images.id, id));

        // Log activity
        await logActivity({
            userId,
            albumId: image.albumId,
            imageId: image.id,
            action: "image_restore",
        });

        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
