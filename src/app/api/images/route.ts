import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
import { ImageService } from "@/lib/services/image.service";

const confirmSchema = z.object({
    albumId: z.string().uuid(),
    s3Key: z.string(),
    mimeType: z.string(),
    size: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
});

/**
 * @swagger
 * /api/images:
 *   post:
 *     tags:
 *       - Images
 *     summary: Confirm upload
 *     description: Manually confirm an image upload.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - albumId
 *               - s3Key
 *             properties:
 *               albumId:
 *                 type: string
 *               s3Key:
 *                 type: string
 *               mimeType:
 *                 type: string
 *               size:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Image confirmed
 */
export async function POST(request: Request) {
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
        const data = confirmSchema.parse(body);

        const image = await ImageService.confirmUpload(userId, data);

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return NextResponse.json({ image });

    } catch (error) {
        let status = 500;
        let errorBody: any = { error: "Internal Error" };

        if (error instanceof z.ZodError) {
            status = 400;
            errorBody = { error: error.issues };
        } else if (error instanceof Error && error.message === "Forbidden") {
            status = 403;
            errorBody = { error: "Forbidden" };
        } else {
            console.error(error);
        }

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, status);
        }

        return NextResponse.json(errorBody, { status });
    }
}
