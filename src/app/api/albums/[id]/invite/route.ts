import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/db";
import { albumInvites } from "@/db/schema";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

const inviteSchema = z.object({
    role: z.enum(["viewer", "editor"]),
    maxUse: z.number().optional(),
    expiresInMinutes: z.number().optional(), // 0 = no expiry
});

type Context = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/albums/{id}/invite:
 *   post:
 *     tags:
 *       - Albums
 *     summary: Create invite
 *     description: Generate an invite link.
 *     parameters:
 *       - in: path
 *         name: id
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
 *                 enum: [viewer, editor]
 *               maxUse:
 *                 type: integer
 *               expiresInMinutes:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Invite created
 */
export async function POST(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const hasAccess = await checkAlbumPermission(userId, albumId, "owner"); // Only owner can generate/manage invites? Or editor? 
        // Dialog said "Only owners and editors". But schema logic says CreatedBy..
        // Let's stick to RBAC: Owner/Editor can share.
        // But for "Deleting/Renewing", maybe Owner only?
        // Let's check `checkAlbumPermission` usage.

        if (!hasAccess) {
            // Editor check?
            const isEditor = await checkAlbumPermission(userId, albumId, "editor");
            if (!isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();
        const { role, maxUse, expiresInMinutes } = inviteSchema.parse(body);

        // Check for existing active invite for this role
        const existingInvite = await db.query.albumInvites.findFirst({
            where: and(
                eq(albumInvites.albumId, albumId),
                eq(albumInvites.role, role)
            )
        });

        if (existingInvite) {
            // Check if expired? If so, delete and create new?
            // For now, return existing if valid.
            // Since we stored HASH before, we can't return existing if it was hashed.
            // Logic change: We will now store PLAIN token.
            // If existing token is old format (hashed), valid length check?
            // nanoid(16) length is 16. BCrypt hash is 60.
            // If length > 20, it's hashed -> can't return -> Delete and Create New.

            if (existingInvite.token.length > 30) {
                // Old hashed token, delete it
                await db.delete(albumInvites).where(eq(albumInvites.id, existingInvite.id));
            } else {
                return NextResponse.json({
                    code: `${existingInvite.id}.${existingInvite.token}`,
                    url: `/invite/${existingInvite.id}.${existingInvite.token}`
                });
            }
        }

        // Generate Secret Token
        const secret = nanoid(16);
        // const secretHash = await hashPassword(secret); // Store PLAIN text now

        // Create Invite Record
        const [invite] = await db.insert(albumInvites).values({
            albumId,
            token: secret, // Plain text
            role,
            maxUse,
            expiresAt: expiresInMinutes ? new Date(Date.now() + expiresInMinutes * 60 * 1000) : null,
            createdBy: userId,
        }).returning();

        const inviteLinkCode = `${invite.id}.${secret}`;

        return NextResponse.json({ code: inviteLinkCode, url: `/invite/${inviteLinkCode}` });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}


/**
 * @swagger
 * /api/albums/{id}/invite:
 *   delete:
 *     tags:
 *       - Albums
 *     summary: Revoke invite
 *     description: Revoke an existing invite link.
 *     parameters:
 *       - in: path
 *         name: id
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
 *                 enum: [viewer, editor]
 *     responses:
 *       200:
 *         description: Invite revoked
 */
export async function DELETE(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const hasAccess = await checkAlbumPermission(userId, albumId, "owner");
        if (!hasAccess) {
            const isEditor = await checkAlbumPermission(userId, albumId, "editor");
            if (!isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();
        // Allow deleting by role
        const { role } = z.object({ role: z.enum(["viewer", "editor"]) }).parse(body);

        await db.delete(albumInvites).where(
            and(
                eq(albumInvites.albumId, albumId),
                eq(albumInvites.role, role)
            )
        );

        return NextResponse.json({ success: true });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}


/**
 * @swagger
 * /api/albums/{id}/invite:
 *   get:
 *     tags:
 *       - Albums
 *     summary: Get invite
 *     description: Get the current active invite link for a specific role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *           enum: [viewer, editor]
 *     responses:
 *       200:
 *         description: Invite details
 */
export async function GET(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!role || (role !== "viewer" && role !== "editor")) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    try {
        const hasAccess = await checkAlbumPermission(userId, albumId, "owner");
        if (!hasAccess) {
            const isEditor = await checkAlbumPermission(userId, albumId, "editor");
            if (!isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existingInvite = await db.query.albumInvites.findFirst({
            where: and(
                eq(albumInvites.albumId, albumId),
                eq(albumInvites.role, role)
            )
        });

        if (!existingInvite) {
            return NextResponse.json({ code: null });
        }

        // If existing token is hashed (legacy), we can't return it.
        // UI should interpret null code as "needs regeneration" for legacy too.
        if (existingInvite.token.length > 30) {
            return NextResponse.json({ code: null });
        }

        return NextResponse.json({
            code: `${existingInvite.id}.${existingInvite.token}`,
            url: `/invite/${existingInvite.id}.${existingInvite.token}`
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
