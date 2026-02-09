import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { refreshTokens } from "@/db/schema";
import { verifyRefreshToken, createAccessToken, createRefreshToken } from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { eq } from "drizzle-orm";

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Refresh access token
 *     description: Uses the httpOnly refreshToken cookie to issue a new accessToken.
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 */
export async function POST() {
    try {
        const cookieStore = await cookies();
        const oldRefreshToken = cookieStore.get("refreshToken")?.value;

        if (!oldRefreshToken) {
            return NextResponse.json({ error: "No refresh token" }, { status: 401 });
        }

        // Verify signature
        const payload = await verifyRefreshToken(oldRefreshToken);
        if (!payload || !payload.jti) {
            return NextResponse.json({ error: "Invalid token" }, { status: 401 });
        }

        // Check DB
        const storedToken = await db.query.refreshTokens.findFirst({
            where: eq(refreshTokens.id, payload.jti),
        });

        if (!storedToken) {
            return NextResponse.json({ error: "Token revoked or not found" }, { status: 401 });
        }

        // Verify hash match (detect token reuse/theft)
        const isValid = await verifyPassword(oldRefreshToken, storedToken.tokenHash);
        if (!isValid) {
            // Security Event: Token mismatch! Potential theft.
            // Revoke this ID to be safe.
            await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));
            return NextResponse.json({ error: "Invalid token hash" }, { status: 401 });
        }

        if (new Date() > storedToken.expiresAt) {
            await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));
            return NextResponse.json({ error: "Token expired" }, { status: 401 });
        }

        // Rotation: Delete old, create new
        await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));

        const newRefreshId = crypto.randomUUID();
        const newRefreshToken = await createRefreshToken({ userId: payload.userId }, newRefreshId);
        const newRefreshTokenHash = await hashPassword(newRefreshToken);

        await db.insert(refreshTokens).values({
            id: newRefreshId,
            userId: payload.userId,
            tokenHash: newRefreshTokenHash,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
        });

        const newAccessToken = await createAccessToken({ userId: payload.userId });

        cookieStore.set("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60,
            path: "/",
        });

        cookieStore.set("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 90, // 90 days
            path: "/",
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const redirectPath = url.searchParams.get("redirect") || "/dashboard";

    try {
        const cookieStore = await cookies();
        const oldRefreshToken = cookieStore.get("refreshToken")?.value;

        if (!oldRefreshToken) {
            return NextResponse.redirect(new URL("/", request.url));
        }

        const payload = await verifyRefreshToken(oldRefreshToken);
        if (!payload || !payload.jti) {
            return NextResponse.redirect(new URL("/", request.url));
        }

        const storedToken = await db.query.refreshTokens.findFirst({
            where: eq(refreshTokens.id, payload.jti),
        });

        if (!storedToken || new Date() > storedToken.expiresAt) {
            return NextResponse.redirect(new URL("/", request.url));
        }

        const isValid = await verifyPassword(oldRefreshToken, storedToken.tokenHash);
        if (!isValid) {
            await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));
            return NextResponse.redirect(new URL("/", request.url));
        }

        await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));

        const newRefreshId = crypto.randomUUID();
        const newRefreshToken = await createRefreshToken({ userId: payload.userId }, newRefreshId);
        const newRefreshTokenHash = await hashPassword(newRefreshToken);

        await db.insert(refreshTokens).values({
            id: newRefreshId,
            userId: payload.userId,
            tokenHash: newRefreshTokenHash,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
        });

        const newAccessToken = await createAccessToken({ userId: payload.userId });

        const response = NextResponse.redirect(new URL(redirectPath, request.url));

        response.cookies.set("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60,
            path: "/",
        });

        response.cookies.set("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 90, // 90 days
            path: "/",
        });

        return response;

    } catch (error) {
        console.error("Refresh GET error", error);
        return NextResponse.redirect(new URL("/", request.url));
    }
}
