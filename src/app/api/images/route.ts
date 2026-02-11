import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
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
    const userId = await getAuthenticatedUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json();
        const data = confirmSchema.parse(body);

        const image = await ImageService.confirmUpload(userId, data);

        return NextResponse.json({ image });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        if (error instanceof Error && error.message === "Forbidden") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
