import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, refreshTokens } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createAccessToken, createRefreshToken } from "@/lib/auth/tokens";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";

const registerSchema = z.object({
    email: z.string().email(),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[\W_]/, "Password must contain at least one special character"),
    name: z.string().min(2, "Name must be at least 2 characters"),
});

export async function POST(request: Request) {
    const { apiKey } = await getAuthContext();
    if (apiKey) {
        return NextResponse.json({ error: "API Key access not allowed for this endpoint" }, { status: 403 });
    }

    // Rate limit by IP: 3 registrations per minute, 10 per hour
    const ip = getClientIp(request);
    const minuteLimit = checkRateLimit(`register:min:${ip}`, 3, 60);
    if (!minuteLimit.allowed) {
        return NextResponse.json(
            { error: "Too many registration attempts. Please try again later." },
            { status: 429, headers: { "Retry-After": String(minuteLimit.retryAfter) } }
        );
    }

    const hourLimit = checkRateLimit(`register:hour:${ip}`, 10, 3600);
    if (!hourLimit.allowed) {
        return NextResponse.json(
            { error: "Too many registration attempts. Please try again later." },
            { status: 429, headers: { "Retry-After": String(hourLimit.retryAfter) } }
        );
    }

    try {
        const body = await request.json();
        const { email, password, name } = registerSchema.parse(body);

        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (existingUser) {
            return NextResponse.json({ error: "User already exists" }, { status: 400 });
        }

        const hashedPassword = await hashPassword(password);

        // Create user
        const [newUser] = await db
            .insert(users)
            .values({
                email,
                passwordHash: hashedPassword,
                name,
            })
            .returning();

        // Generate tokens
        const accessToken = await createAccessToken({ userId: newUser.id });
        const refreshId = crypto.randomUUID();
        const refreshToken = await createRefreshToken({ userId: newUser.id }, refreshId);
        const refreshTokenHash = await hashPassword(refreshToken);

        // Store refresh token — 90 days to match cookie maxAge
        await db.insert(refreshTokens).values({
            id: refreshId,
            userId: newUser.id,
            tokenHash: refreshTokenHash,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90), // 90 days
        });

        // Set cookies
        const cookieStore = await cookies();
        cookieStore.set("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60, // 1 hour
            path: "/",
        });

        cookieStore.set("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 90, // 90 days
            path: "/",
        });

        return NextResponse.json({
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
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
