import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { db } from "@/db";
import { folders, images } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

const updateFolderSchema = z.object({
    name: z.string().min(1).max(100),
});

type Context = { params: Promise<{ id: string; folderId: string }> };

// PUT /api/albums/[id]/folders/[folderId] - Rename folder
export async function PUT(request: Request, context: Context) {
    const { id: albumId, folderId } = await context.params;
    const userId = await getUserId();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canEdit = await checkAlbumPermission(userId, albumId, "editor");
    if (!canEdit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { name } = updateFolderSchema.parse(body);

        // Verify folder belongs to album
        const existingFolder = await db.query.folders.findFirst({
            where: and(eq(folders.id, folderId), eq(folders.albumId, albumId)),
        });

        if (!existingFolder) {
            return NextResponse.json({ error: "Folder not found" }, { status: 404 });
        }

        const [updatedFolder] = await db.update(folders)
            .set({ name, updatedAt: new Date() })
            .where(eq(folders.id, folderId))
            .returning();

        await logActivity({
            userId,
            albumId,
            folderId,
            action: "folder_update",
            metadata: { oldName: existingFolder.name, newName: name },
        });

        return NextResponse.json({ folder: updatedFolder });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error("Update folder error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// DELETE /api/albums/[id]/folders/[folderId] - Delete folder
export async function DELETE(request: Request, context: Context) {
    const { id: albumId, folderId } = await context.params;
    const userId = await getUserId();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only owner can delete folders (or robust editor check if desired, adhering to RBAC)
    // For now, let's allow editors as they can create folders
    const canEdit = await checkAlbumPermission(userId, albumId, "editor");
    if (!canEdit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const existingFolder = await db.query.folders.findFirst({
            where: and(eq(folders.id, folderId), eq(folders.albumId, albumId)),
        });

        if (!existingFolder) {
            return NextResponse.json({ error: "Folder not found" }, { status: 404 });
        }

        // Hard delete folder. Images in this folder have ON DELETE SET NULL on folderId
        // So images will just become "root" images (unfoldered).
        // If we want to delete images inside, we'd need to do that explicitly.
        // Usually, deleting a folder shouldn't delete the precious photos inside, just organize them back to root.

        await db.delete(folders).where(eq(folders.id, folderId));

        await logActivity({
            userId,
            albumId,
            folderId,
            action: "folder_delete",
            metadata: { name: existingFolder.name },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete folder error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
