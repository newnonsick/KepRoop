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
import { getAuthenticatedUser, getAuthContext } from "@/lib/auth/session";

/**
 * @swagger
// ... (keep comments)
 */
export async function GET() {
    // 0. Check for valid session (Cookie or API Key)
    // This handles both "Authorization: Bearer/Api-Key" and "Cookie: accessToken"
    const { userId: authenticatedUserId, apiKey } = await getAuthContext();

    if (apiKey) {
        return NextResponse.json({ error: "API Key access not allowed for this endpoint" }, { status: 403 });
    }

    if (authenticatedUserId) {
        const user = await db.query.users.findFirst({
            where: eq(users.id, authenticatedUserId),
            columns: {
                id: true,
                email: true,
                name: true,
                avatarUrl: true,
                passwordHash: true,
            }
        });

        if (user) {
            const { passwordHash, ...userWithoutPassword } = user;
            return NextResponse.json({
                user: {
                    ...userWithoutPassword,
                    hasPassword: !!passwordHash
                }
            });
        }
    }

    // 1. Fallback: Explicit Refresh Token Flow (Cookie only)
    // If getAuthenticatedUser() returned null, it means Access Token is missing or invalid.
    // We try to use the Refresh Token to get a new session.
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refreshToken")?.value;

    if (refreshToken) {
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

                        // Return the user
                        const user = await db.query.users.findFirst({
                            where: eq(users.id, payload.userId),
                            columns: {
                                id: true,
                                email: true,
                                name: true,
                                avatarUrl: true,
                                passwordHash: true,
                            }
                        });

                        if (user) {
                            const { passwordHash, ...userWithoutPassword } = user;
                            return NextResponse.json({
                                user: {
                                    ...userWithoutPassword,
                                    hasPassword: !!passwordHash
                                }
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Auto-refresh failed", e);
        }
    }

    return NextResponse.json({ user: null }, { status: 401 });
}
