import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, refreshTokens } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createAccessToken, createRefreshToken } from "@/lib/auth/tokens";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

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

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: User registration
 *     description: Creates a new user account and sets session cookies.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Registration successful
 *       400:
 *         description: Validation error or user already exists
 */
export async function POST(request: Request) {
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
        // Generate tokens
        const accessToken = await createAccessToken({ userId: newUser.id });
        const refreshId = crypto.randomUUID();
        const refreshToken = await createRefreshToken({ userId: newUser.id }, refreshId);
        const refreshTokenHash = await hashPassword(refreshToken); // Hash refresh token before storing

        // Store refresh token
        await db.insert(refreshTokens).values({
            id: refreshId,
            userId: newUser.id,
            tokenHash: refreshTokenHash,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
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
