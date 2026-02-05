import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { albums, images } from "@/db/schema";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { z } from "zod";
import { eq } from "drizzle-orm";

// Helper
async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

const updateAlbumSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    visibility: z.enum(["public", "private"]).optional(),
    coverImageId: z.string().uuid().nullable().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) {
        const album = await db.query.albums.findFirst({ where: eq(albums.id, albumId) });
        if (!album) return NextResponse.json({ error: "Not found" }, { status: 404 });

        let hasAccess = album.visibility === "public";

        // Check guest access
        if (!hasAccess) {
            const cookieStore = await cookies();
            const guestToken = cookieStore.get("keproop_guest_access")?.value;
            console.log(`[GuestDebug] Checking guest access for album ${albumId}. Token present: ${!!guestToken}`);

            if (guestToken) {
                const { verifyGuestToken } = await import("@/lib/auth/tokens");
                const payload = await verifyGuestToken(guestToken);
                console.log(`[GuestDebug] Token verified. Payload:`, payload);

                if (payload && payload.allowedAlbums.includes(albumId)) {
                    console.log(`[GuestDebug] Access granted via guest token`);
                    hasAccess = true;
                } else {
                    console.log(`[GuestDebug] Access denied. Album ID not in allowed list.`);
                }
            }
        }

        if (!hasAccess) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Public album - fetch with images and return full data
        const publicAlbum = await db.query.albums.findFirst({
            where: eq(albums.id, albumId),
            with: {
                images: {
                    where: (images, { isNull }) => isNull(images.deletedAt),
                    orderBy: (images, { asc }) => [asc(images.createdAt)]
                }
            }
        });

        if (!publicAlbum) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const { generateDownloadUrl } = await import("@/lib/s3");
        const imagesWithUrls = await Promise.all(publicAlbum.images.map(async (img: typeof images.$inferSelect) => ({
            ...img,
            url: await generateDownloadUrl(img.s3Key)
        })));

        let coverImageUrl = null;
        if (publicAlbum.coverImageId) {
            const coverImage = imagesWithUrls.find(img => img.id === publicAlbum.coverImageId);
            coverImageUrl = coverImage?.url || null;
        }
        if (!coverImageUrl && imagesWithUrls.length > 0) {
            coverImageUrl = imagesWithUrls[0].url;
        }

        return NextResponse.json({
            album: {
                ...publicAlbum,
                images: imagesWithUrls,
                coverImageUrl,
            },
            userRole: "viewer" // Public viewers are read-only
        });
    }

    // Check RBAC
    const hasAccess = await checkAlbumPermission(userId, albumId, "viewer");
    if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch album with images
    const album = await db.query.albums.findFirst({
        where: eq(albums.id, albumId),
        with: {
            images: {
                where: (images, { isNull }) => isNull(images.deletedAt),
                orderBy: (images, { asc }) => [asc(images.createdAt)]
            }
        }
    });

    if (!album) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Generate signed URLs for images
    const { generateDownloadUrl } = await import("@/lib/s3");

    const imagesWithUrls = await Promise.all(album.images.map(async (img: typeof images.$inferSelect) => {
        return {
            ...img,
            url: await generateDownloadUrl(img.s3Key)
        };
    }));

    // Get cover image URL (use coverImageId or first image as fallback)
    let coverImageUrl = null;
    if (album.coverImageId) {
        const coverImage = imagesWithUrls.find(img => img.id === album.coverImageId);
        coverImageUrl = coverImage?.url || null;
    }
    if (!coverImageUrl && imagesWithUrls.length > 0) {
        coverImageUrl = imagesWithUrls[0].url;
    }

    // Get user role for permission display in UI
    const { getAlbumRole } = await import("@/lib/auth/rbac");
    const userRole = userId ? await getAlbumRole(userId, albumId) : "viewer";

    return NextResponse.json({
        album: {
            ...album,
            images: imagesWithUrls,
            coverImageUrl,
        },
        userRole
    });
}

export async function PUT(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const hasAccess = await checkAlbumPermission(userId, albumId, "editor"); // Assuming editors can update metadata? 
    // Plan said: "Update Album - Check Owner/Editor".
    // Usually Owner only updates visibility? Or Editor too?
    // Let's allow Editor to update title/description, Owner for visibility?
    // Start with Editor for now.

    if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const data = updateAlbumSchema.parse(body);

        // If visibility change, check OWNER
        if (data.visibility) {
            const isOwner = await checkAlbumPermission(userId, albumId, "owner");
            if (!isOwner) return NextResponse.json({ error: "Only owner can change visibility" }, { status: 403 });
        }

        const [updated] = await db.update(albums).set({
            ...data,
            // updatedAt: new Date() // handled by defaultNow()? No, usually manual or trigger. Drizzle defaultNow is creation mostly? No, schema says defaultNow. but that's SQL default. update doesn't trigger it unless `onUpdateNow`.
            // My schema said `updatedAt: timestamp("updated_at").defaultNow().notNull()`.
            // Drizzle `.$onUpdate(() => new Date())` is better.
            // I'll manually set it for now.
            updatedAt: new Date(),
        })
            .where(eq(albums.id, albumId))
            .returning();

        return NextResponse.json({ album: updated });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const hasAccess = await checkAlbumPermission(userId, albumId, "owner");
    if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(albums).where(eq(albums.id, albumId));

    return NextResponse.json({ success: true });
}
