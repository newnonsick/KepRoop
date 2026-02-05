import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { cookies } from "next/headers";

const updateProfileSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
});

const updatePasswordSchema = z.object({
    currentPassword: z.string().optional(),
    newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[\W_]/, "Password must contain at least one special character"),
});

async function getAuthenticatedUser() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("accessToken")?.value;
    if (!accessToken) return null;

    const payload = await verifyAccessToken(accessToken);
    if (!payload?.userId) return null;

    return payload.userId;
}

export async function PATCH(request: Request) {
    try {
        const userId = await getAuthenticatedUser();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { name } = updateProfileSchema.parse(body);

        await db.update(users)
            .set({ name })
            .where(eq(users.id, userId));

        return NextResponse.json({ success: true, name });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const userId = await getAuthenticatedUser();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { currentPassword, newPassword } = updatePasswordSchema.parse(body);

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { passwordHash: true }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // If user already has a password, verify current password
        if (user.passwordHash) {
            if (!currentPassword) {
                return NextResponse.json({ error: "Current password is required" }, { status: 400 });
            }
            const isValid = await verifyPassword(currentPassword, user.passwordHash);
            if (!isValid) {
                return NextResponse.json({ error: "Incorrect current password" }, { status: 400 });
            }
        }

        const hashedPassword = await hashPassword(newPassword);

        await db.update(users)
            .set({ passwordHash: hashedPassword })
            .where(eq(users.id, userId));

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
