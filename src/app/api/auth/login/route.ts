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

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: User login
 *     description: Authenticates a user and sets session cookies.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               remember:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *       401:
 *         description: Invalid credentials
 */
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
        const refreshDuration = remember ? "90d" : "1d";
        const refreshDate = remember
            ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 90) // 90 days
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
            maxAge: 60 * 60, // 1 hour
            path: "/",
        });

        cookieStore.set("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: remember ? 60 * 60 * 24 * 90 : 60 * 60 * 24, // 90 days or 1 day
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
