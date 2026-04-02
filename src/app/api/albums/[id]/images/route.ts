import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
import { AlbumService } from "@/lib/services/album.service";

const querySchema = z.object({
    sortBy: z.enum(["createdAt", "dateTaken"]).default("createdAt"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    folderId: z.string().optional(),
    offset: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(100).default(30),
});

type Context = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/albums/{id}/images:
 *   get:
 *     tags:
 *       - Albums
 *     summary: Get album images (paginated)
 *     description: Get paginated images for an album with signed URLs. Supports lazy loading via offset/limit.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, dateTaken]
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *         description: Use "root" for images not in any folder
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated images
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
    const params = querySchema.parse({
        sortBy: searchParams.get("sortBy") || undefined,
        sortDir: searchParams.get("sortDir") || undefined,
        folderId: searchParams.get("folderId") || undefined,
        offset: searchParams.get("offset") || undefined,
        limit: searchParams.get("limit") || undefined,
    });

    try {
        const result = await AlbumService.getAlbumImages(userId, albumId, {
            sortBy: params.sortBy,
            sortDir: params.sortDir,
            folderId: params.folderId,
            offset: params.offset,
            limit: params.limit,
        });

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return NextResponse.json(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "Forbidden") {
            if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
