import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
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
    const { userId, apiKey } = await getAuthContext();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (apiKey) {
        const limitCheck = await checkRateLimits(apiKey.id, apiKey.rateLimit, apiKey.rateLimitPerDay, request);
        if (!limitCheck.ok) {
            return NextResponse.json(limitCheck.error, { status: limitCheck.status });
        }
    }

    try {
        const body = await request.json();
        const { name } = updateProfileSchema.parse(body);

        const result = await UserService.updateProfile(userId, { name });

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return NextResponse.json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }
        console.error(error);
        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 500);
        }
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
