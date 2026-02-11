import { db } from "@/db";
import { albumInvites, albumMembers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { verifyPassword } from "@/lib/auth/password";
import { createGuestToken, verifyGuestToken } from "@/lib/auth/tokens";
import { cookies } from "next/headers";

export type CreateInviteData = {
    role: "viewer" | "editor";
    maxUse?: number;
    expiresInMinutes?: number;
};

export class InviteService {
    static async createInvite(userId: string, albumId: string, data: CreateInviteData) {
        const canManage = await checkAlbumPermission(userId, albumId, "editor");
        if (!canManage) throw new Error("Forbidden");

        // Cleanup old/active invites for same role if specific logic requires ONE per role?
        // Current logic allows one per role.
        const existingInvite = await db.query.albumInvites.findFirst({
            where: and(eq(albumInvites.albumId, albumId), eq(albumInvites.role, data.role))
        });

        if (existingInvite) {
            // Delete if hashed (legacy)
            if (existingInvite.token.length > 30) {
                await db.delete(albumInvites).where(eq(albumInvites.id, existingInvite.id));
            } else {
                return {
                    code: `${existingInvite.id}.${existingInvite.token}`,
                    url: `/invite/${existingInvite.id}.${existingInvite.token}`
                };
            }
        }

        const secret = nanoid(16);
        const [invite] = await db.insert(albumInvites).values({
            albumId,
            token: secret,
            role: data.role,
            maxUse: data.maxUse,
            expiresAt: data.expiresInMinutes ? new Date(Date.now() + data.expiresInMinutes * 60 * 1000) : null,
            createdBy: userId,
        }).returning();

        const code = `${invite.id}.${secret}`;
        return { code, url: `/invite/${code}` };
    }

    static async getInvite(userId: string, albumId: string, role: string) {
        const canView = await checkAlbumPermission(userId, albumId, "editor");
        if (!canView) throw new Error("Forbidden");

        const invite = await db.query.albumInvites.findFirst({
            where: and(eq(albumInvites.albumId, albumId), eq(albumInvites.role, role as any))
        });

        if (!invite || invite.token.length > 30) return null;

        return {
            code: `${invite.id}.${invite.token}`,
            url: `/invite/${invite.id}.${invite.token}`
        };
    }

    static async revokeInvite(userId: string, albumId: string, role: string) {
        const canManage = await checkAlbumPermission(userId, albumId, "editor");
        if (!canManage) throw new Error("Forbidden");

        await db.delete(albumInvites).where(
            and(eq(albumInvites.albumId, albumId), eq(albumInvites.role, role as any))
        );
    }

    static async acceptInvite(userId: string | null, code: string) {
        const [inviteId, secret] = code.split(".");
        if (!inviteId || !secret) throw new Error("Invalid code format");

        const invite = await db.query.albumInvites.findFirst({
            where: eq(albumInvites.id, inviteId),
        });

        if (!invite) throw new Error("Invite not found");

        if (invite.expiresAt && new Date() > invite.expiresAt) throw new Error("Invite expired");
        if (invite.maxUse && invite.usedCount >= invite.maxUse) throw new Error("Invite limit reached");

        // Verify Secret
        const paramToken = secret.trim();
        const storedToken = invite.token.trim();
        let isValid = storedToken === paramToken;

        if (!isValid && storedToken.length > 30) {
            isValid = await verifyPassword(paramToken, storedToken);
        }

        if (!isValid) throw new Error("Invalid token");

        // Logged-in User Logic
        if (userId) {
            const existingMember = await db.query.albumMembers.findFirst({
                where: and(eq(albumMembers.userId, userId), eq(albumMembers.albumId, invite.albumId)),
            });

            if (existingMember) {
                if (invite.role === "editor" && existingMember.role === "viewer") {
                    await db.transaction(async (tx) => {
                        await tx.update(albumMembers)
                            .set({ role: "editor" })
                            .where(and(eq(albumMembers.userId, userId), eq(albumMembers.albumId, invite.albumId)));
                        await tx.update(albumInvites).set({ usedCount: sql`${albumInvites.usedCount} + 1` }).where(eq(albumInvites.id, inviteId));
                    });
                    return { status: "upgraded", albumId: invite.albumId };
                }
                return { status: "already_member", albumId: invite.albumId };
            }

            await db.transaction(async (tx) => {
                await tx.insert(albumMembers).values({
                    userId,
                    albumId: invite.albumId,
                    role: invite.role as "editor" | "viewer",
                });
                await tx.update(albumInvites).set({ usedCount: sql`${albumInvites.usedCount} + 1` }).where(eq(albumInvites.id, inviteId));
            });

            await logActivity({
                userId,
                albumId: invite.albumId,
                action: "member_join",
                metadata: { inviteId: invite.id, role: invite.role }
            });

            return { status: "joined", albumId: invite.albumId };
        }

        // Guest Logic (only for viewer links)
        if (invite.role === "viewer") {
            const cookieStore = await cookies();
            const existingToken = cookieStore.get("keproop_guest_access")?.value;
            let allowedAlbums: string[] = [];
            if (existingToken) {
                const payload = await verifyGuestToken(existingToken);
                if (payload) allowedAlbums = payload.allowedAlbums;
            }
            if (!allowedAlbums.includes(invite.albumId)) {
                allowedAlbums.push(invite.albumId);
            }
            const newToken = await createGuestToken(allowedAlbums);

            // Increment count even for guest?
            await db.update(albumInvites)
                .set({ usedCount: sql`${albumInvites.usedCount} + 1` })
                .where(eq(albumInvites.id, inviteId));

            return { status: "guest_access", albumId: invite.albumId, token: newToken };
        }

        throw new Error("Sign in required");
    }
}
