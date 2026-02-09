import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    verifyAccessToken,
    verifyRefreshToken,
    createAccessToken,
    createRefreshToken
} from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/db";
import { users, refreshTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get current user
 *     description: Returns the currently authenticated user based on cookies or tokens.
 *     security:
 *       - CookieAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *       401:
 *         description: Not authenticated
 */
export async function GET() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("accessToken")?.value;
    const refreshToken = cookieStore.get("refreshToken")?.value;

    let userId: string | null = null;
    let shouldRefresh = false;

    // 1. Try Access Token first
    if (accessToken) {
        const payload = await verifyAccessToken(accessToken);
        if (payload) {
            userId = payload.userId;
        } else {
            // Access Token invalid/expired, try refresh
            shouldRefresh = true;
        }
    } else {
        shouldRefresh = true;
    }

    // 2. Refresh Logic if needed
    if (shouldRefresh && refreshToken) {
        try {
            // Verify structure
            const payload = await verifyRefreshToken(refreshToken);
            if (payload && payload.jti) {
                // Check DB
                const storedToken = await db.query.refreshTokens.findFirst({
                    where: eq(refreshTokens.id, payload.jti),
                });

                if (storedToken && new Date() <= storedToken.expiresAt) {
                    // Verify hash
                    const isValid = await verifyPassword(refreshToken, storedToken.tokenHash);
                    if (isValid) {
                        // Secure Rotation: Delete old, create new
                        await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));

                        // Determine new refresh duration (keep users signed in)
                        const remainingTime = storedToken.expiresAt.getTime() - Date.now();
                        const isLongSession = remainingTime > 1000 * 60 * 60 * 25; // > 25 hours

                        const refreshDuration = isLongSession ? "90d" : "1d";
                        const refreshDate = isLongSession
                            ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 90)
                            : new Date(Date.now() + 1000 * 60 * 60 * 24);

                        const newRefreshId = crypto.randomUUID();
                        const newRefreshToken = await createRefreshToken({ userId: payload.userId }, newRefreshId, refreshDuration);
                        const newRefreshTokenHash = await hashPassword(newRefreshToken);
                        const newAccessToken = await createAccessToken({ userId: payload.userId });

                        await db.insert(refreshTokens).values({
                            id: newRefreshId,
                            userId: payload.userId,
                            tokenHash: newRefreshTokenHash,
                            expiresAt: refreshDate,
                        });

                        // Set new cookies
                        cookieStore.set("accessToken", newAccessToken, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === "production",
                            sameSite: "lax",
                            maxAge: 60 * 60, // 1 hour
                            path: "/",
                        });

                        cookieStore.set("refreshToken", newRefreshToken, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === "production",
                            sameSite: "lax",
                            maxAge: isLongSession ? 60 * 60 * 24 * 90 : 60 * 60 * 24,
                            path: "/",
                        });

                        userId = payload.userId;
                    }
                }
            }
        } catch (e) {
            console.error("Auto-refresh failed", e);
        }
    }

    if (!userId) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            passwordHash: true,
        }
    });

    if (!user) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    const { passwordHash, ...userWithoutPassword } = user;

    return NextResponse.json({
        user: {
            ...userWithoutPassword,
            hasPassword: !!passwordHash
        }
    });
}
