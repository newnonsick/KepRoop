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

// Update schema to include 'owner'
const updateMemberSchema = z.object({
    role: z.enum(["editor", "viewer", "owner"]),
});

type Context = { params: Promise<{ id: string; memberId: string }> };

/**
 * @swagger
 * /api/albums/{id}/members/{memberId}:
 *   patch:
 *     tags:
 *       - Albums
 *     summary: Update member role
 *     description: Update the role of a member.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [viewer, editor, owner]
 *     responses:
 *       200:
 *         description: Role updated
 *   delete:
 *     tags:
 *       - Albums
 *     summary: Remove member
 *     description: Remove a member from the album or leave the album.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 */
export async function PATCH(request: Request, context: Context) {
    const { id: albumId, memberId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Only owners can change roles
    const isOwner = await checkAlbumPermission(userId, albumId, "owner");
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Fetch album to identify Original Owner
    const album = await db.query.albums.findFirst({
        where: eq(albums.id, albumId),
    });

    if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });

    // RULE 1: Cannot change Original Owner's role
    if (album.ownerId === memberId) {
        return NextResponse.json({ error: "Cannot change the Original Owner's role" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { role } = updateMemberSchema.parse(body);

        // RULE 2: Joint Owner Demotion Check
        // If current user is NOT Original Owner, they cannot demote another Owner
        if (userId !== album.ownerId) {
            // Check if target is currently an owner
            const targetMember = await db.query.albumMembers.findFirst({
                where: and(eq(albumMembers.albumId, albumId), eq(albumMembers.userId, memberId))
            });

            if (targetMember?.role === "owner" && role !== "owner") {
                return NextResponse.json({ error: "Only the Original Owner can demote Joint Owners" }, { status: 403 });
            }
        }

        await db.update(albumMembers)
            .set({ role })
            .where(and(eq(albumMembers.albumId, albumId), eq(albumMembers.userId, memberId)));

        // LOGGING: Role Change
        const { logActivity } = await import("@/lib/activity");
        await logActivity({
            userId, // The actor (Owner)
            albumId,
            action: "member_role_change",
            metadata: {
                targetUserId: memberId,
                newRole: role
            }
        });

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

    const album = await db.query.albums.findFirst({
        where: eq(albums.id, albumId),
    });

    if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });

    // Case 1: Leaving (isSelf)
    if (isSelf) {
        if (album.ownerId === userId) {
            return NextResponse.json({ error: "Original Owner cannot leave. Delete the album instead." }, { status: 400 });
        }
    }
    // Case 2: Kicking (not isSelf)
    else {
        if (!isOwner) {
            return NextResponse.json({ error: "Only owners can remove members" }, { status: 403 });
        }

        // RULE 1: Cannot kick Original Owner
        if (album.ownerId === memberId) {
            return NextResponse.json({ error: "Cannot remove the Original Owner" }, { status: 403 });
        }

        // RULE 2: Joint Owner Kick Check
        // If current user is NOT Original Owner, they cannot kick another Owner
        if (userId !== album.ownerId) {
            const targetMember = await db.query.albumMembers.findFirst({
                where: and(eq(albumMembers.albumId, albumId), eq(albumMembers.userId, memberId))
            });

            if (targetMember?.role === "owner") {
                return NextResponse.json({ error: "Only the Original Owner can remove Joint Owners" }, { status: 403 });
            }
        }
    }

    try {
        await db.delete(albumMembers)
            .where(and(eq(albumMembers.albumId, albumId), eq(albumMembers.userId, memberId)));

        // LOGGING: Member Leave / Remove
        const { logActivity } = await import("@/lib/activity");
        await logActivity({
            userId, // The actor (could be self or owner)
            albumId,
            action: "member_leave",
            metadata: {
                targetUserId: memberId, // Who left/was removed
                isKick: !isSelf // true if removed by someone else
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
