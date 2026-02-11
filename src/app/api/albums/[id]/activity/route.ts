import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { activityLogs, users } from "@/db/schema";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { eq, desc } from "drizzle-orm";

import { getAuthenticatedUser } from "@/lib/auth/session";

async function getUserId() {
    return getAuthenticatedUser();
}

type Context = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/albums/{id}/activity:
 *   get:
 *     tags:
 *       - Albums
 *     summary: Get album activity
 *     description: Get activity logs for an album.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Activity logs
 */
export async function GET(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only OWNER (Original or Joint) can view activity logs
    const isOwner = await checkAlbumPermission(userId, albumId, "owner");
    if (!isOwner) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const url = new URL(request.url);
        const cursor = url.searchParams.get("cursor");
        const limit = parseInt(url.searchParams.get("limit") || "20");

        const { lt, and } = await import("drizzle-orm");

        const logs = await db.select({
            id: activityLogs.id,
            action: activityLogs.action,
            metadata: activityLogs.metadata,
            createdAt: activityLogs.createdAt,
            user: {
                id: users.id,
                name: users.name,
                avatarUrl: users.avatarUrl,
                email: users.email
            }
        })
            .from(activityLogs)
            .leftJoin(users, eq(activityLogs.userId, users.id))
            .where(
                and(
                    eq(activityLogs.albumId, albumId),
                    cursor ? lt(activityLogs.createdAt, new Date(cursor)) : undefined
                )
            )
            .orderBy(desc(activityLogs.createdAt))
            .limit(limit + 1); // Fetch 1 extra to check for next page

        let nextCursor: string | null = null;
        if (logs.length > limit) {
            logs.pop(); // Remove extra item
            // The cursor for the next page is the created date of the last item in the *current* page
            nextCursor = logs[logs.length - 1].createdAt.toISOString();
        }

        return NextResponse.json({ logs, nextCursor });
    } catch (error) {
        console.error("Failed to fetch activity logs:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
