import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { albumMembers } from "@/db/schema";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { eq, and } from "drizzle-orm";

import { getAuthContext } from "@/lib/auth/session";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";

type Context = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/albums/{id}/members:
 *   get:
 *     tags:
 *       - Albums
 *     summary: List members
 *     description: List all members of an album.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of members
 */
export async function GET(request: Request, context: Context) {
    const { id: albumId } = await context.params;
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

    // Check if user has at least viewer access
    const hasAccess = await checkAlbumPermission(userId, albumId, "viewer");
    if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const members = await db.query.albumMembers.findMany({
            where: eq(albumMembers.albumId, albumId),
            with: {
                user: {
                    columns: {
                        id: true,
                        name: true,
                        email: true,
                        avatarUrl: true,
                    }
                }
            },
            orderBy: (albumMembers, { asc }) => [asc(albumMembers.joinedAt)],
        });



        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return NextResponse.json({ members });
    } catch (error) {
        console.error("Failed to fetch members", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
