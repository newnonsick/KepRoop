
import { db } from "@/db";
import { albumMembers, albums } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type Role = "owner" | "editor" | "viewer";

const ROLE_HIERARCHY: Record<Role, number> = {
    viewer: 1,
    editor: 2,
    owner: 3,
};

export async function getAlbumRole(userId: string, albumId: string): Promise<Role | null> {
    const member = await db.query.albumMembers.findFirst({
        where: and(eq(albumMembers.userId, userId), eq(albumMembers.albumId, albumId)),
    });

    if (member) {
        return member.role as Role;
    }

    // Fallback: check album ownership directly (covers edge case where owner isn't in members table)
    const album = await db.query.albums.findFirst({
        where: eq(albums.id, albumId),
        columns: { ownerId: true, visibility: true },
    });

    if (!album) return null;

    if (album.ownerId === userId) return "owner";

    // Public albums grant implicit viewer access to any authenticated user
    if (album.visibility === "public") {
        return "viewer";
    }

    return null;
}

export function hasRole(currentRole: Role | null, requiredRole: Role): boolean {
    if (!currentRole) return false;
    return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[requiredRole];
}

export async function checkAlbumPermission(userId: string, albumId: string, requiredRole: Role): Promise<boolean> {
    const role = await getAlbumRole(userId, albumId);
    return hasRole(role, requiredRole);
}

