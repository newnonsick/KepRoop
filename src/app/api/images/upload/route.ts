import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { ImageService } from "@/lib/services/image.service";

// Allow longer timeout
export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * @swagger
 * /api/images/upload:
 *   post:
 *     tags:
 *       - Images
 *     summary: Upload image (Server-side)
 *     description: Upload an image file directly to the server.
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - albumId
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               albumId:
 *                 type: string
 *               folderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Image uploaded and processed
 */
export async function POST(request: Request) {
    const userId = await getAuthenticatedUser();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const albumId = formData.get("albumId") as string | null;
        const folderId = formData.get("folderId") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!albumId) {
            return NextResponse.json({ error: "Album ID is required" }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
        }

        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
        }

        const image = await ImageService.processAndUpload(userId, file, albumId, folderId as string | undefined);

        return NextResponse.json({
            image: {
                id: image.id,
                width: image.width,
                height: image.height,
                dateTaken: image.dateTaken,
            }
        }, { status: 201 });

    } catch (error) {
        console.error("Upload error:", error);
        if (error instanceof Error && error.message === "Forbidden") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
    }
}
