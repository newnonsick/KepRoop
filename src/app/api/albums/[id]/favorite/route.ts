
import { NextResponse } from "next/server";
import { db } from "@/db";
import { favoriteAlbums, activityLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";

/**
 * @swagger
 * /api/albums/{id}/favorite:
 *   post:
 *     tags:
 *       - Albums
 *     summary: Toggle favorite
 *     description: Add or remove album from favorites.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Favorite status toggled
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Params are now a Promise in Next.js 15
) {
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

    const { id: albumId } = await params;

    try {
        // Toggle favorite: check if exists, if so delete, else insert
        const existing = await db.query.favoriteAlbums.findFirst({
            where: and(
                eq(favoriteAlbums.userId, userId),
                eq(favoriteAlbums.albumId, albumId)
            ),
        });

        if (existing) {
            // Remove from favorites
            await db.delete(favoriteAlbums)
                .where(and(
                    eq(favoriteAlbums.userId, userId),
                    eq(favoriteAlbums.albumId, albumId)
                ));

            if (apiKey) {
                await logApiKeyUsage(apiKey.id, request, 200);
            }
            return NextResponse.json({ isFavorite: false });
        } else {
            // Add to favorites
            await db.insert(favoriteAlbums).values({
                userId,
                albumId,
            });

            if (apiKey) {
                await logApiKeyUsage(apiKey.id, request, 200);
            }
            return NextResponse.json({ isFavorite: true });
        }

    } catch (error) {
        console.error("Error toggling favorite:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
