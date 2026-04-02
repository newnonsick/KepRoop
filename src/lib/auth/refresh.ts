import { db } from "@/db";
import { refreshTokens } from "@/db/schema";
import { verifyRefreshToken, createAccessToken, createRefreshToken } from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { eq } from "drizzle-orm";

interface RefreshResult {
    accessToken: string;
    refreshToken: string;
    userId: string;
}

/**
 * Core refresh token flow: verify, rotate, return new tokens.
 * Returns null if the refresh token is invalid/expired/revoked.
 *
 * This is shared between POST (API) and GET (redirect) handlers
 * to eliminate code duplication.
 */
export async function performTokenRefresh(
    oldRefreshToken: string
): Promise<RefreshResult | null> {
    // 1. Verify JWT signature
    const payload = await verifyRefreshToken(oldRefreshToken);
    if (!payload || !payload.jti) return null;

    // 2. Check stored token exists in DB
    const storedToken = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.id, payload.jti),
    });

    if (!storedToken) return null;

    // 3. Verify hash (detect token reuse/theft)
    const isValid = await verifyPassword(oldRefreshToken, storedToken.tokenHash);
    if (!isValid) {
        // Security: potential token theft — revoke immediately
        await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));
        return null;
    }

    // 4. Check expiry
    if (new Date() > storedToken.expiresAt) {
        await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));
        return null;
    }

    // 5. Rotate: delete old, create new
    await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));

    const newRefreshId = crypto.randomUUID();
    const newRefreshToken = await createRefreshToken({ userId: payload.userId }, newRefreshId);
    const newRefreshTokenHash = await hashPassword(newRefreshToken);

    await db.insert(refreshTokens).values({
        id: newRefreshId,
        userId: payload.userId,
        tokenHash: newRefreshTokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90), // 90 days
    });

    const newAccessToken = await createAccessToken({ userId: payload.userId });

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        userId: payload.userId,
    };
}
