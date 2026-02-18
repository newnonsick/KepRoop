import { NextResponse } from "next/server";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "@/db";
import { users, refreshTokens } from "@/db/schema";
import { createAccessToken, createRefreshToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth/session";

const googleSchema = z.object({
    idToken: z.string(),
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function POST(request: Request) {
    const { apiKey } = await getAuthContext();
    if (apiKey) {
        return NextResponse.json({ error: "API Key access not allowed for this endpoint" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { idToken } = googleSchema.parse(body);

        // Verify Google Token
        const { payload } = await jwtVerify(idToken, JWKS, {
            issuer: ["https://accounts.google.com", "accounts.google.com"],
            audience: GOOGLE_CLIENT_ID,
        });

        if (!payload.email) {
            return NextResponse.json({ error: "Email not provided by Google" }, { status: 400 });
        }

        // Check if user exists
        let user = await db.query.users.findFirst({
            where: eq(users.email, payload.email as string),
        });

        if (!user) {
            // Create user
            const [newUser] = await db.insert(users).values({
                email: payload.email as string,
                name: (payload.name as string) || (payload.email as string).split("@")[0],
                googleId: payload.sub,
                avatarUrl: payload.picture as string,
            }).returning();
            user = newUser;
        } else {
            // Update google info if needed
            if (!user.googleId) {
                await db.update(users).set({ googleId: payload.sub, avatarUrl: payload.picture as string }).where(eq(users.id, user.id));
            }
        }

        // Generate Tokens (Same flow as Login)
        const accessToken = await createAccessToken({ userId: user.id });
        const refreshId = crypto.randomUUID();
        const refreshToken = await createRefreshToken({ userId: user.id }, refreshId);
        const refreshTokenHash = await hashPassword(refreshToken);

        await db.insert(refreshTokens).values({
            id: refreshId,
            userId: user.id,
            tokenHash: refreshTokenHash,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        });

        const cookieStore = await cookies();
        cookieStore.set("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 15,
            path: "/",
        });

        cookieStore.set("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
        });

        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid input" }, { status: 400 });
        }
        console.error("Google Auth Error", error);
        return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
}
