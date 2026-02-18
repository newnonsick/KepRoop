import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
import { InviteService } from "@/lib/services/invite.service";

const inviteSchema = z.object({
    role: z.enum(["viewer", "editor"]),
    maxUse: z.number().optional(),
    expiresInMinutes: z.number().optional(),
});

type Context = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/albums/{id}/invite:
 *   post:
 *     tags:
 *       - Albums
 *     summary: Create invite
 *     description: Generate an invite link.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [viewer, editor]
 *     responses:
 *       200:
 *         description: Invite created
 */
export async function POST(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const { userId, apiKey } = await getAuthContext();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (apiKey) {
        const limitCheck = await checkRateLimits(apiKey.id, apiKey.rateLimit, apiKey.rateLimitPerDay, request);
        if (!limitCheck.ok) {
            return NextResponse.json(limitCheck.error, { status: limitCheck.status });
        }
    }

    try {
        const body = await request.json();
        const data = inviteSchema.parse(body);

        const result = await InviteService.createInvite(userId, albumId, data);
        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }
        return NextResponse.json(result);

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

/**
 * @swagger
 * /api/albums/{id}/invite:
 *   delete:
 *     tags:
 *       - Albums
 *     summary: Revoke invite
 *     description: Revoke an existing invite link.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [viewer, editor]
 *     responses:
 *       200:
 *         description: Invite revoked
 */
export async function DELETE(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const { userId, apiKey } = await getAuthContext();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (apiKey) {
        const limitCheck = await checkRateLimits(apiKey.id, apiKey.rateLimit, apiKey.rateLimitPerDay, request);
        if (!limitCheck.ok) {
            return NextResponse.json(limitCheck.error, { status: limitCheck.status });
        }
    }

    try {
        const body = await request.json();
        const { role } = z.object({ role: z.enum(["viewer", "editor"]) }).parse(body);

        await InviteService.revokeInvite(userId, albumId, role);
        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }
        return NextResponse.json({ success: true });

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

/**
 * @swagger
 * /api/albums/{id}/invite:
 *   get:
 *     tags:
 *       - Albums
 *     summary: Get invite
 *     description: Get the current active invite link for a specific role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *           enum: [viewer, editor]
 *     responses:
 *       200:
 *         description: Invite details
 */
export async function GET(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const { userId, apiKey } = await getAuthContext();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!role || (role !== "viewer" && role !== "editor")) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (apiKey) {
        const limitCheck = await checkRateLimits(apiKey.id, apiKey.rateLimit, apiKey.rateLimitPerDay, request);
        if (!limitCheck.ok) {
            return NextResponse.json(limitCheck.error, { status: limitCheck.status });
        }
    }


    try {
        const result = await InviteService.getInvite(userId, albumId, role);
        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }
        return NextResponse.json(result || { code: null }); // return null if not found
    } catch (error: any) {
        if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
