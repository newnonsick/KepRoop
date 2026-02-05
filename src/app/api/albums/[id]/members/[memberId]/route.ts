import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { albumMembers, albums } from "@/db/schema";
import { checkAlbumPermission, getAlbumRole } from "@/lib/auth/rbac";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

const updateMemberSchema = z.object({
    role: z.enum(["editor", "viewer"]),
});

type Context = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(request: Request, context: Context) {
    const { id: albumId, memberId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Only owners can change roles
    const isOwner = await checkAlbumPermission(userId, albumId, "owner");
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Cannot change owner's role
    const album = await db.query.albums.findFirst({
        where: eq(albums.id, albumId),
    });
    if (album?.ownerId === memberId) {
        return NextResponse.json({ error: "Cannot change owner's role" }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { role } = updateMemberSchema.parse(body);

        await db.update(albumMembers)
            .set({ role })
            .where(and(eq(albumMembers.albumId, albumId), eq(albumMembers.userId, memberId)));

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: Context) {
    const { id: albumId, memberId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSelf = userId === memberId;
    const isOwner = await checkAlbumPermission(userId, albumId, "owner");

    // Case 1: Leaving (isSelf)
    if (isSelf) {
        const album = await db.query.albums.findFirst({
            where: eq(albums.id, albumId),
        });
        if (album?.ownerId === userId) {
            return NextResponse.json({ error: "Owner cannot leave the album. Delete the album instead." }, { status: 400 });
        }
    }
    // Case 2: Kicking (not isSelf)
    else {
        if (!isOwner) {
            return NextResponse.json({ error: "Only owners can remove members" }, { status: 403 });
        }
        // Cannot kick the owner
        const album = await db.query.albums.findFirst({
            where: eq(albums.id, albumId),
        });
        if (album?.ownerId === memberId) {
            return NextResponse.json({ error: "Cannot remove the owner" }, { status: 400 });
        }
    }

    try {
        await db.delete(albumMembers)
            .where(and(eq(albumMembers.albumId, albumId), eq(albumMembers.userId, memberId)));

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
