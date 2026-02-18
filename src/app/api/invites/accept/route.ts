import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
import { InviteService } from "@/lib/services/invite.service";

const acceptSchema = z.object({
    code: z.string(),
});


export async function POST(request: Request) {
    const { userId, apiKey } = await getAuthContext();

    if (apiKey) {
        return NextResponse.json({ error: "API Key access not allowed for this endpoint" }, { status: 403 });
    }

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
        let status = 500;
        let errorBody: any = { error: "Internal Error" };

        if (error instanceof z.ZodError) {
            status = 400;
            errorBody = { error: error.issues };
        } else if (error.message === "Invalid code format" || error.message === "Invalid token") {
            status = 400;
            errorBody = { error: error.message };
        } else if (error.message === "Invite not found") {
            status = 404;
            errorBody = { error: "Invite not found" };
        } else if (error.message === "Invite expired" || error.message === "Invite limit reached") {
            status = 410;
            errorBody = { error: error.message };
        } else if (error.message === "Sign in required") {
            status = 401;
            errorBody = { error: "Sign in required to accept this invite" };
        } else {
            console.error(error);
        }

        return NextResponse.json(errorBody, { status });
    }
}
