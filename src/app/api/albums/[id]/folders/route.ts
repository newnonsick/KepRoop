import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

/**
 * @swagger
 * /api/albums/{id}/folders:
 *   get:
 *     tags:
 *       - Albums
 *     summary: List folders
 *     description: List all folders in an album.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of folders
 *   post:
 *     tags:
 *       - Albums
 *     summary: Create folder
 *     description: Create a new folder in an album.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Folder created
 */

import { getAuthenticatedUser } from "@/lib/auth/session";

async function getUserId() {
    return getAuthenticatedUser();
}

const createFolderSchema = z.object({
    name: z.string().min(1).max(100),
});

const updateFolderSchema = z.object({
    name: z.string().min(1).max(100),
});

type Context = { params: Promise<{ id: string }> };

// GET /api/albums/[id]/folders - List all folders in album
export async function GET(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    // Check viewer permission
    let hasAccess = false;
    if (userId) {
        hasAccess = await checkAlbumPermission(userId, albumId, "viewer");
    } else {
        // Check for guest access or public album
        const album = await db.query.albums.findFirst({
            where: eq(folders.albumId, albumId),
        });
        hasAccess = album?.visibility === "public";
    }

    if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const albumFolders = await db.query.folders.findMany({
        where: eq(folders.albumId, albumId),
        orderBy: (folders, { asc }) => [asc(folders.name)],
    });

    return NextResponse.json({ folders: albumFolders });
}

// POST /api/albums/[id]/folders - Create a new folder
export async function POST(request: Request, context: Context) {
    const { id: albumId } = await context.params;
    const userId = await getUserId();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check editor permission
    const canEdit = await checkAlbumPermission(userId, albumId, "editor");
    if (!canEdit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { name } = createFolderSchema.parse(body);

        const [folder] = await db.insert(folders).values({
            albumId,
            name,
        }).returning();

        // Log activity
        await logActivity({
            userId,
            albumId,
            folderId: folder.id,
            action: "folder_create",
            metadata: { name },
        });

        return NextResponse.json({ folder });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error("Create folder error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
