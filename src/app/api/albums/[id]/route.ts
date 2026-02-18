import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
import { AlbumService } from "@/lib/services/album.service";

const updateAlbumSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    visibility: z.enum(["public", "private"]).optional(),
    coverImageId: z.string().uuid().nullable().optional(),
    albumDate: z.coerce.date().optional(),
});

type Context = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/albums/{id}:
 *   get:
 *     tags:
 *       - Albums
 *     summary: Get album details
 *     description: Get album details including images and folders.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Album details
 *       404:
 *         description: Album not found
 */
export async function GET(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const { userId, apiKey } = await getAuthContext();

    if (apiKey) {
        const limitCheck = await checkRateLimits(apiKey.id, apiKey.rateLimit, apiKey.rateLimitPerDay, request);
        if (!limitCheck.ok) {
            return NextResponse.json(limitCheck.error, { status: limitCheck.status });
        }
    }

    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDir = searchParams.get('sortDir') || 'desc';

    try {
        const result = await AlbumService.getAlbum(userId, albumId, { sortBy, sortDir });
        if (!result) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }
        return NextResponse.json(result);
    } catch (error: any) {
        if (error.message === "Forbidden") {
            // Check if user is unauthorized (401) or forbidden (403)
            // Logic in service checks guest access too. 
            // If userId is null and service throws Forbidden, it's 401/403 depending on if they are logged in?
            // Usually if not logged in -> 401. If logged in but no access -> 403.
            // Service handles userId | null.
            if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

/**
 * @swagger
 * /api/albums/{id}:
 *   patch:
 *     tags:
 *       - Albums
 *     summary: Update album
 *     description: Update album metadata.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *               albumDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Album updated
 */
export async function PATCH(request: Request, context: Context) {
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
        const data = updateAlbumSchema.parse(body);

        // Filter out undefined
        const cleanData: any = {};
        if (data.title !== undefined) cleanData.title = data.title;
        if (data.description !== undefined) cleanData.description = data.description;
        if (data.visibility !== undefined) cleanData.visibility = data.visibility;
        if (data.coverImageId !== undefined) cleanData.coverImageId = data.coverImageId;
        if (data.albumDate !== undefined) cleanData.albumDate = data.albumDate;

        const album = await AlbumService.updateAlbum(userId, albumId, cleanData);

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return NextResponse.json({ album });

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        if (error.message === "Only owner can change visibility") return NextResponse.json({ error: error.message }, { status: 403 });

        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

/**
 * @swagger
 * /api/albums/{id}:
 *   delete:
 *     tags:
 *       - Albums
 *     summary: Delete album
 *     description: Delete an album and all its contents.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Album deleted
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
        await AlbumService.deleteAlbum(userId, albumId);
        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
