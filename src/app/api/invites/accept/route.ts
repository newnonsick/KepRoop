import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken, createGuestToken, verifyGuestToken } from "@/lib/auth/tokens";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/db";
import { albumInvites, albumMembers, albums } from "@/db/schema";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

const acceptSchema = z.object({
    code: z.string(),
});

export async function POST(request: Request) {
    const userId = await getUserId();

    try {
        const body = await request.json();
        const { code } = acceptSchema.parse(body);

        // Parse Code: {id}.{secret}
        const [inviteId, secret] = code.split(".");
        if (!inviteId || !secret) {
            return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
        }

        // Lookup Invite
        const invite = await db.query.albumInvites.findFirst({
            where: eq(albumInvites.id, inviteId),
        });

        if (!invite) {
            return NextResponse.json({ error: "Invite not found" }, { status: 404 });
        }

        // Checks
        // 1. Expiry
        if (invite.expiresAt && new Date() > invite.expiresAt) {
            return NextResponse.json({ error: "Invite expired" }, { status: 410 });
        }

        // 2. Max Use
        if (invite.maxUse && invite.usedCount >= invite.maxUse) {
            return NextResponse.json({ error: "Invite limit reached" }, { status: 410 });
        }

        // 3. Verify Secret
        let isValid = false;

        // Clean tokens
        const paramToken = secret.trim();
        const storedToken = invite.token.trim();

        // Check for new plain token format (direct match)
        if (storedToken === paramToken) {
            isValid = true;
        }
        // Fallback or legacy check for hashed tokens
        else if (storedToken.length > 30) {
            isValid = await verifyPassword(paramToken, storedToken);
        }

        if (!isValid) {
            return NextResponse.json({ error: "Invalid token" }, { status: 400 });
        }

        // 4. Check if viewer role -> no auth needed (for both public and private albums)
        // Viewers can access via invite link without signing in
        // BUT if user is logged in, we want to add them as member so it stays in their list
        if (invite.role === "viewer" && !userId) {
            // Set guest access cookie for private album access
            const cookieStore = await cookies();
            const existingToken = cookieStore.get("keproop_guest_access")?.value;
            let allowedAlbums: string[] = [];

            if (existingToken) {
                const payload = await verifyGuestToken(existingToken);
                if (payload) {
                    allowedAlbums = payload.allowedAlbums;
                }
            }

            if (!allowedAlbums.includes(invite.albumId)) {
                allowedAlbums.push(invite.albumId);
            }

            const newToken = await createGuestToken(allowedAlbums);

            const response = NextResponse.json({
                success: true,
                albumId: invite.albumId,
                publicAccess: true
            });

            response.cookies.set("keproop_guest_access", newToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60 * 24 * 30 // 30 days
            });

            // Increment usage count for analytics/limits even for guest access
            await db.update(albumInvites)
                .set({ usedCount: sql`${albumInvites.usedCount} + 1` })
                .where(eq(albumInvites.id, inviteId));

            return response;
        }

        // For editor role, require authentication
        if (!userId) {
            return NextResponse.json({ error: "Sign in required to accept this invite" }, { status: 401 });
        }

        // 5. Check if already member
        const existingMember = await db.query.albumMembers.findFirst({
            where: and(eq(albumMembers.userId, userId), eq(albumMembers.albumId, invite.albumId)),
        });

        if (existingMember) {
            // Scenario A: Upgrade Viewer to Editor
            if (invite.role === "editor" && existingMember.role === "viewer") {
                await db.transaction(async (tx) => {
                    await tx.update(albumMembers)
                        .set({ role: "editor" })
                        .where(and(eq(albumMembers.userId, userId), eq(albumMembers.albumId, invite.albumId)));

                    await tx.update(albumInvites)
                        .set({ usedCount: invite.usedCount + 1 })
                        .where(eq(albumInvites.id, inviteId));
                });
                return NextResponse.json({ success: true, albumId: invite.albumId, upgraded: true });
            }

            // Scenario B: Already member with same or higher role -> just redirect/success
            // Prevent downgrade (Editor using Viewer link -> stays Editor)
            return NextResponse.json({ success: true, albumId: invite.albumId, message: "Already a member" });
        }

        // Execute Join
        // Transaction to increment count and add member
        await db.transaction(async (tx) => {
            await tx.insert(albumMembers).values({
                userId,
                albumId: invite.albumId,
                role: invite.role as "editor" | "viewer",
            });

            await tx.update(albumInvites)
                .set({ usedCount: invite.usedCount + 1 })
                .where(eq(albumInvites.id, inviteId));
        });

        return NextResponse.json({ success: true, albumId: invite.albumId });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
