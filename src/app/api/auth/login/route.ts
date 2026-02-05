import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, refreshTokens } from "@/db/schema";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createAccessToken, createRefreshToken } from "@/lib/auth/tokens";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    remember: z.boolean().optional(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, remember } = loginSchema.parse(body);

        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (!user || !user.passwordHash) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        // Determine expiration based on remember me
        const refreshDuration = remember ? "30d" : "1d";
        const refreshDate = remember
            ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 days
            : new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 day

        // Generate tokens
        const accessToken = await createAccessToken({ userId: user.id });
        const refreshId = crypto.randomUUID();
        const refreshToken = await createRefreshToken({ userId: user.id }, refreshId, refreshDuration);
        const refreshTokenHash = await hashPassword(refreshToken);

        // Store refresh token
        await db.insert(refreshTokens).values({
            id: refreshId,
            userId: user.id,
            tokenHash: refreshTokenHash,
            expiresAt: refreshDate,
        });

        // Set cookies
        const cookieStore = await cookies();

        cookieStore.set("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 15, // 15 minutes
            path: "/",
        });

        cookieStore.set("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24, // 30 days or 1 day
            path: "/",
        });

        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
