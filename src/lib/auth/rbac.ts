
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
    // Check membership
    const member = await db.query.albumMembers.findFirst({
        where: and(eq(albumMembers.userId, userId), eq(albumMembers.albumId, albumId)),
    });

    if (member) {
        return member.role as Role;
    }

    // Check ownership (Owner is implicitly owner role)
    // Actually schema has ownerId on album.
    // And usually owner is ALSO added to members table to simplify queries.
    // Implementation detail: When creating album, add owner to members table too?
    // Yes, best practice for unified "get all my albums" queries via members table.
    // If not, we check both.

    const album = await db.query.albums.findFirst({
        where: eq(albums.id, albumId),
        columns: { ownerId: true, visibility: true },
    });

    if (!album) return null;

    if (album.ownerId === userId) return "owner";

    // Public albums give "viewer" access to everyone?
    // User req: "Public albums -> ... public access".
    // So if public, implied "viewer" role?
    // But RBAC usually refers to "Member Role".
    // If public, we might return "viewer" for any authenticated user?
    // Or distinct "public_viewer"?
    // Let's stick to explicit roles.
    // If album is private and no member record -> null.

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
