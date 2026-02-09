
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { favoriteAlbums, activityLogs } from "@/db/schema"; // Import favoriteAlbums
import { and, eq } from "drizzle-orm";

// Helper to get user ID
async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

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
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

            return NextResponse.json({ isFavorite: false });
        } else {
            // Add to favorites
            await db.insert(favoriteAlbums).values({
                userId,
                albumId,
            });

            return NextResponse.json({ isFavorite: true });
        }

    } catch (error) {
        console.error("Error toggling favorite:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
