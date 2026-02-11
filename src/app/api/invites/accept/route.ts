import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { InviteService } from "@/lib/services/invite.service";

const acceptSchema = z.object({
    code: z.string(),
});

/**
 * @swagger
 * /api/invites/accept:
 *   post:
 *     tags:
 *       - Invites
 *     summary: Accept invite
 *     description: Accept an album invite code.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invite accepted
 */
export async function POST(request: Request) {
    const userId = await getAuthenticatedUser();

    try {
        const body = await request.json();
        const { code } = acceptSchema.parse(body);

        const result = await InviteService.acceptInvite(userId, code);

        // Handle Guest Access Cookie
        if (result.status === "guest_access" && result.token) {
            const response = NextResponse.json({
                success: true,
                albumId: result.albumId,
                publicAccess: true
            });

            response.cookies.set("keproop_guest_access", result.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60 * 24 * 30 // 30 days
            });

            return response;
        }

        return NextResponse.json({ success: true, ...result });

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        if (error.message === "Invalid code format" || error.message === "Invalid token") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (error.message === "Invite not found") {
            return NextResponse.json({ error: "Invite not found" }, { status: 404 });
        }
        if (error.message === "Invite expired" || error.message === "Invite limit reached") {
            return NextResponse.json({ error: error.message }, { status: 410 });
        }
        if (error.message === "Sign in required") {
            return NextResponse.json({ error: "Sign in required to accept this invite" }, { status: 401 });
        }

        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
