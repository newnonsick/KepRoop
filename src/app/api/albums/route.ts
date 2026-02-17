import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";
import { AlbumService } from "@/lib/services/album.service";

const createAlbumSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    visibility: z.enum(["public", "private"]).default("private"),
    date: z.string().optional(),
    coverImageKey: z.string().optional(),
});

/**
 * @swagger
 * /api/albums:
 *   get:
 *     tags:
 *       - Albums
 *     summary: List albums
 *     description: List albums with filtering, sorting, and pagination.
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of items to return
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [all, mine, shared, favorites]
 *           default: all
 *         description: Filter albums by ownership
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [public, private]
 *         description: Filter by visibility
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title or description
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: albumDate
 *         description: Sort field
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: A list of albums
 */
export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "12"), 50);
    const filter = url.searchParams.get("filter") || "all";
    const visibility = url.searchParams.get("visibility") || undefined;
    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;
    const search = url.searchParams.get("search") || undefined;
    const sortBy = url.searchParams.get("sortBy") || "albumDate";
    const sortDir = url.searchParams.get("sortDir") || "desc";

    const result = await AlbumService.listAlbums({
        userId,
        cursor,
        limit,
        filter,
        visibility,
        startDate,
        endDate,
        search,
        sortBy,
        sortDir
    });

    if (apiKey) {
        await logApiKeyUsage(apiKey.id, request, 200);
    }

    return NextResponse.json(result);
}

/**
 * @swagger
 * /api/albums:
 *   post:
 *     tags:
 *       - Albums
 *     summary: Create album
 *     description: Create a new album.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *               date:
 *                 type: string
 *                 format: date-time
 *               coverImageKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Album created successfully
 */
export async function POST(request: Request) {
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
        const parsed = createAlbumSchema.parse(body);

        const album = await AlbumService.createAlbum(userId, {
            title: parsed.title,
            description: parsed.description,
            visibility: parsed.visibility,
            date: parsed.date,
            coverImageKey: parsed.coverImageKey
        });

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return NextResponse.json({ album });

    } catch (error) {
        let status = 500;
        let errorBody: any = { error: "Internal Error" };

        if (error instanceof z.ZodError) {
            status = 400;
            errorBody = { error: error.issues };
        } else {
            console.error(error);
        }

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, status);
        }

        return NextResponse.json(errorBody, { status });
    }
}
