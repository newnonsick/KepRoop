import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { albumMembers } from "@/db/schema";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { eq, and } from "drizzle-orm";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

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
    const userId = await getUserId();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

        return NextResponse.json({ members });
    } catch (error) {
        console.error("Failed to fetch members", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
