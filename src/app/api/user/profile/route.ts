import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { UserService } from "@/lib/services/user.service";

const updateProfileSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
});

/**
 * @swagger
 * /api/user/profile:
 *   patch:
 *     tags:
 *       - User
 *     summary: Update profile
 *     description: Update user profile details (name).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
export async function PATCH(request: Request) {
    const userId = await getAuthenticatedUser();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { name } = updateProfileSchema.parse(body);

        const result = await UserService.updateProfile(userId, { name });

        return NextResponse.json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
