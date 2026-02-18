import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
import { ImageService } from "@/lib/services/image.service";
type Context = { params: Promise<{ id: string }> };
/**
 * @swagger
 * /api/images/{id}/restore:
 *   post:
 *     tags:
 *       - Images
 *     summary: Restore image
 *     description: Restore a soft-deleted image from trash.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Image restored
 */
export async function POST(request: Request, context: Context) {
    const { id } = await context.params;
    const { userId, apiKey } = await getAuthContext();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (apiKey) {
        const limitCheck = await checkRateLimits(apiKey.id, apiKey.rateLimit, apiKey.rateLimitPerDay, request);
        if (!limitCheck.ok) {
            return NextResponse.json(limitCheck.error, { status: limitCheck.status });
        }
    }
    try {
        await ImageService.restoreImage(userId, id);
        if (apiKey) await logApiKeyUsage(apiKey.id, request, 200);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.message === "Not found") return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}