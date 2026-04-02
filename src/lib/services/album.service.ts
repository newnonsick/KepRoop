import { db } from "@/db";
import { albums, albumMembers, images, favoriteAlbums, folders } from "@/db/schema";
import { eq, desc, sql, and, isNull, inArray, or, ilike, gte, lte, lt, asc } from "drizzle-orm";
import { generateDownloadUrl, deleteS3Objects } from "@/lib/s3";
import { checkAlbumPermission, getAlbumRole } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { cookies } from "next/headers";
import { verifyGuestToken } from "@/lib/auth/tokens";

export type ListAlbumsParams = {
    userId: string;
    cursor?: string;
    limit?: number;
    filter?: string; // "all" | "mine" | "shared" | "favorites"
    visibility?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    search?: string | null;
    sortBy?: string;
    sortDir?: string;
};

export type CreateAlbumData = {
    title: string;
    description?: string;
    visibility: "public" | "private";
    date?: string;
    coverImageKey?: string;
};

export type UpdateAlbumData = {
    title?: string;
    description?: string;
    visibility?: "public" | "private";
    coverImageId?: string | null;
    albumDate?: Date;
};

export class AlbumService {
    /**
     * Shared access check for album operations.
     * Returns { hasAccess, role } or throws if album not found.
     */
    private static async checkAlbumAccess(userId: string | null, albumId: string) {
        const album = await db.query.albums.findFirst({ where: eq(albums.id, albumId) });
        if (!album) return null;

        let hasAccess = false;
        let role = "viewer";

        // 1. Public Access
        if (album.visibility === "public") {
            hasAccess = true;
        }

        // 2. Guest Access
        if (!hasAccess && !userId) {
            const cookieStore = await cookies();
            const guestToken = cookieStore.get("keproop_guest_access")?.value;
            if (guestToken) {
                const payload = await verifyGuestToken(guestToken);
                if (payload && payload.allowedAlbums.includes(albumId)) {
                    hasAccess = true;
                }
            }
        }

        // 3. RBAC
        if (userId) {
            const userRole = await getAlbumRole(userId, albumId);
            if (userRole) {
                hasAccess = true;
                role = userRole;
            } else if (album.visibility === "public") {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            throw new Error("Forbidden");
        }

        return { album, role };
    }

    /**
     * Get album metadata (no images). Returns album details, folders, cover image URL, total image count, and user role.
     */
    static async getAlbum(userId: string | null, albumId: string) {
        const result = await this.checkAlbumAccess(userId, albumId);
        if (!result) return null;

        const { role } = result;

        // Fetch album with folders only (no images)
        const details = await db.query.albums.findFirst({
            where: eq(albums.id, albumId),
            with: {
                folders: {
                    orderBy: (folders, { asc }) => [asc(folders.name)]
                }
            }
        });

        if (!details) return null;

        // Get total image count and per-folder counts
        const countResult = await db
            .select({
                total: sql<number>`count(*)`.mapWith(Number),
            })
            .from(images)
            .where(and(eq(images.albumId, albumId), isNull(images.deletedAt)));

        const totalImageCount = countResult[0]?.total || 0;

        // Get cover image URL
        let coverImageUrl = null;
        if (details.coverImageId) {
            const coverImg = await db.query.images.findFirst({
                where: eq(images.id, details.coverImageId),
            });
            if (coverImg) {
                coverImageUrl = await generateDownloadUrl(coverImg.s3KeyThumb || coverImg.s3KeyDisplay || coverImg.s3Key!);
            }
        }

        // If no explicit cover, use first image
        if (!coverImageUrl && totalImageCount > 0) {
            const firstImg = await db.query.images.findFirst({
                where: and(eq(images.albumId, albumId), isNull(images.deletedAt)),
                orderBy: (images, { asc }) => [asc(images.createdAt)],
            });
            if (firstImg) {
                coverImageUrl = await generateDownloadUrl(firstImg.s3KeyThumb || firstImg.s3KeyDisplay || firstImg.s3Key!);
            }
        }

        return {
            album: {
                ...details,
                coverImageUrl,
                totalImageCount,
            },
            userRole: role,
        };
    }

    /**
     * Get paginated images for an album with signed URLs.
     * Uses offset/limit for lazy loading (infinite scroll).
     */
    static async getAlbumImages(
        userId: string | null,
        albumId: string,
        options: {
            sortBy?: string;
            sortDir?: string;
            folderId?: string | null;
            offset?: number;
            limit?: number;
        } = {}
    ) {
        const {
            sortBy = "createdAt",
            sortDir = "desc",
            folderId,
            offset = 0,
            limit = 30,
        } = options;

        // Access check
        await this.checkAlbumAccess(userId, albumId);

        // Build conditions
        const conditions = [eq(images.albumId, albumId), isNull(images.deletedAt)];

        if (folderId === "root") {
            // Root view: only images NOT in any folder
            conditions.push(isNull(images.folderId));
        } else if (folderId) {
            conditions.push(eq(images.folderId, folderId));
        }
        // If folderId is undefined/null, return ALL images (for total counts, etc.)

        // Sort
        const sortColumn = sortBy === "dateTaken" ? images.dateTaken : images.createdAt;
        const orderFn = sortDir === "asc" ? asc : desc;

        // Query images
        const [albumImages, countResult] = await Promise.all([
            db.query.images.findMany({
                where: and(...conditions),
                orderBy: [orderFn(sortColumn), orderFn(images.createdAt)],
                limit: limit,
                offset: offset,
            }),
            db
                .select({ total: sql<number>`count(*)`.mapWith(Number) })
                .from(images)
                .where(and(...conditions)),
        ]);

        const total = countResult[0]?.total || 0;

        // Generate signed URLs
        const imagesWithUrls = await Promise.all(
            albumImages.map(async (img) => ({
                ...img,
                url: await generateDownloadUrl(img.s3KeyThumb || img.s3KeyDisplay || img.s3Key!),
                thumbUrl: img.s3KeyThumb ? await generateDownloadUrl(img.s3KeyThumb) : null,
                displayUrl: img.s3KeyDisplay ? await generateDownloadUrl(img.s3KeyDisplay) : null,
                originalUrl: img.s3KeyOriginal
                    ? await generateDownloadUrl(img.s3KeyOriginal)
                    : img.s3Key
                        ? await generateDownloadUrl(img.s3Key)
                        : null,
            }))
        );

        return {
            images: imagesWithUrls,
            total,
            hasMore: offset + albumImages.length < total,
        };
    }

    static async updateAlbum(userId: string, albumId: string, data: UpdateAlbumData) {
        const currentRole = await getAlbumRole(userId, albumId);
        if (!currentRole || (currentRole !== "owner" && currentRole !== "editor")) {
            throw new Error("Forbidden");
        }

        if (data.visibility && currentRole !== "owner") {
            throw new Error("Only owner can change visibility");
        }

        const [updated] = await db.update(albums).set({
            ...data,
            updatedAt: new Date(),
        })
            .where(eq(albums.id, albumId))
            .returning();

        await logActivity({
            userId,
            albumId,
            action: "album_update",
            metadata: { changes: Object.keys(data) }
        });

        return updated;
    }

    static async deleteAlbum(userId: string, albumId: string) {
        const isOwner = await checkAlbumPermission(userId, albumId, "owner");
        if (!isOwner) throw new Error("Forbidden");

        // Collect S3 keys before deleting DB records
        const albumImages = await db.select({
            s3Key: images.s3Key,
            s3KeyOriginal: images.s3KeyOriginal,
            s3KeyDisplay: images.s3KeyDisplay,
            s3KeyThumb: images.s3KeyThumb,
        }).from(images).where(eq(images.albumId, albumId));

        const keysToDelete = new Set<string>();
        for (const img of albumImages) {
            if (img.s3Key) keysToDelete.add(img.s3Key);
            if (img.s3KeyOriginal) keysToDelete.add(img.s3KeyOriginal);
            if (img.s3KeyDisplay) keysToDelete.add(img.s3KeyDisplay);
            if (img.s3KeyThumb) keysToDelete.add(img.s3KeyThumb);
        }

        // Log activity before deletion (DB is source of truth)
        await logActivity({
            userId,
            albumId,
            action: "album_delete",
        });

        // Delete DB records first — if this fails, S3 objects are preserved
        await db.delete(albums).where(eq(albums.id, albumId));

        // Delete S3 objects last — orphaned objects can be cleaned up later
        if (keysToDelete.size > 0) {
            deleteS3Objects(Array.from(keysToDelete)).catch(err =>
                console.error("Failed to delete S3 objects for album:", albumId, err)
            );
        }
    }

    static async listAlbums(params: ListAlbumsParams) {
        const {
            userId,
            cursor,
            limit = 12,
            filter = "all",
            visibility,
            startDate,
            endDate,
            search,
            sortBy = "albumDate",
            sortDir = "desc"
        } = params;

        const { albumIds, roleMap, joinedAtMap, nextCursor, hasMore } = await this.getAlbumIdsAndCursor(
            userId,
            filter,
            limit,
            cursor
        );

        if (albumIds.length === 0) {
            return { albums: [], nextCursor: null, hasMore: false };
        }

        const filteredAlbums = await this.fetchAlbumDetails(
            albumIds,
            visibility,
            startDate,
            endDate,
            search
        );

        const albumsWithMeta = await this.attachMetadata(filteredAlbums, roleMap, joinedAtMap, userId);

        this.sortAlbums(albumsWithMeta, sortBy, sortDir);

        return {
            albums: albumsWithMeta,
            nextCursor,
            hasMore
        };
    }

    private static async getAlbumIdsAndCursor(
        userId: string,
        filter: string,
        limit: number,
        cursor?: string
    ) {
        if (filter === "favorites") {
            return this.getFavorites(userId, limit, cursor);
        }
        return this.getRegularAlbums(userId, filter, limit, cursor);
    }

    private static async getFavorites(userId: string, limit: number, cursor?: string) {
        const conditions: any[] = [eq(favoriteAlbums.userId, userId)];

        if (cursor) {
            const [cursorTime, cursorId] = cursor.split("_");
            const cursorDate = new Date(cursorTime);
            conditions.push(
                or(
                    lt(favoriteAlbums.createdAt, cursorDate),
                    and(
                        eq(favoriteAlbums.createdAt, cursorDate),
                        lt(favoriteAlbums.albumId, cursorId)
                    )
                )
            );
        }

        const rows = await db
            .select({
                albumId: favoriteAlbums.albumId,
                createdAt: favoriteAlbums.createdAt,
            })
            .from(favoriteAlbums)
            .where(and(...conditions))
            .orderBy(desc(favoriteAlbums.createdAt), desc(favoriteAlbums.albumId))
            .limit(limit + 1);

        const hasMore = rows.length > limit;
        const paginated = hasMore ? rows.slice(0, limit) : rows;
        const albumIds = paginated.map(r => r.albumId);

        const members = await db.select({
            albumId: albumMembers.albumId,
            role: albumMembers.role,
            joinedAt: albumMembers.joinedAt
        }).from(albumMembers)
            .where(and(
                eq(albumMembers.userId, userId),
                inArray(albumMembers.albumId, albumIds)
            ));

        const roleMap = Object.fromEntries(members.map(m => [m.albumId, m.role]));
        const joinedAtMap = Object.fromEntries(members.map(m => [m.albumId, m.joinedAt]));

        let nextCursor = null;
        if (hasMore) {
            const last = paginated[paginated.length - 1];
            nextCursor = `${last.createdAt.toISOString()}_${last.albumId}`;
        }

        return { albumIds, roleMap, joinedAtMap, nextCursor, hasMore };
    }

    private static async getRegularAlbums(userId: string, filter: string, limit: number, cursor?: string) {
        const conditions: any[] = [eq(albumMembers.userId, userId)];

        if (filter === "mine") {
            conditions.push(eq(albumMembers.role, "owner"));
        } else if (filter === "shared") {
            conditions.push(sql`${albumMembers.role} != 'owner'`);
        }

        if (cursor) {
            const [cursorTime, cursorId] = cursor.split("_");
            const cursorDate = new Date(cursorTime);
            conditions.push(
                or(
                    lt(albumMembers.joinedAt, cursorDate),
                    and(
                        eq(albumMembers.joinedAt, cursorDate),
                        lt(albumMembers.albumId, cursorId)
                    )
                )
            );
        }

        const rows = await db
            .select({
                albumId: albumMembers.albumId,
                role: albumMembers.role,
                joinedAt: albumMembers.joinedAt,
            })
            .from(albumMembers)
            .where(and(...conditions))
            .orderBy(desc(albumMembers.joinedAt), desc(albumMembers.albumId))
            .limit(limit + 1);

        const hasMore = rows.length > limit;
        const paginated = hasMore ? rows.slice(0, limit) : rows;
        const albumIds = paginated.map(r => r.albumId);

        const roleMap = Object.fromEntries(paginated.map(m => [m.albumId, m.role]));
        const joinedAtMap = Object.fromEntries(paginated.map(m => [m.albumId, m.joinedAt]));

        let nextCursor = null;
        if (hasMore) {
            const last = paginated[paginated.length - 1];
            nextCursor = `${last.joinedAt.toISOString()}_${last.albumId}`;
        }

        return { albumIds, roleMap, joinedAtMap, nextCursor, hasMore };
    }

    private static async fetchAlbumDetails(
        albumIds: string[],
        visibility?: string | null,
        startDate?: string | null,
        endDate?: string | null,
        search?: string | null
    ) {
        const conditions: any[] = [inArray(albums.id, albumIds)];

        if (visibility) conditions.push(eq(albums.visibility, visibility as "public" | "private"));
        if (startDate) conditions.push(gte(albums.albumDate, new Date(startDate)));
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            conditions.push(lte(albums.albumDate, end));
        }
        if (search) {
            conditions.push(or(ilike(albums.title, `%${search}%`), ilike(albums.description, `%${search}%`)));
        }

        return db.query.albums.findMany({
            where: and(...conditions),
            with: {
                images: {
                    limit: 4,
                    orderBy: (images, { asc }) => [asc(images.createdAt)],
                    where: (images, { isNull }) => isNull(images.deletedAt),
                },
            },
        });
    }

    private static async attachMetadata(
        albums: any[],
        roleMap: Record<string, string>,
        joinedAtMap: Record<string, Date>,
        userId: string
    ) {
        const userFavorites = await db
            .select({ albumId: favoriteAlbums.albumId })
            .from(favoriteAlbums)
            .where(eq(favoriteAlbums.userId, userId));
        const favoriteSet = new Set(userFavorites.map(f => f.albumId));

        const albumIds = albums.map(a => a.id);
        const counts = await db
            .select({
                albumId: images.albumId,
                count: sql<number>`count(*)`.mapWith(Number)
            })
            .from(images)
            .where(and(inArray(images.albumId, albumIds), isNull(images.deletedAt)))
            .groupBy(images.albumId);
        const countsMap = Object.fromEntries(counts.map(c => [c.albumId, c.count]));

        return Promise.all(albums.map(async (album) => {
            let coverImageUrl = null;
            const previewImageUrls: string[] = [];

            if (album.coverImageId) {
                const coverImg = album.images.find((img: any) => img.id === album.coverImageId);
                if (coverImg) {
                    coverImageUrl = await generateDownloadUrl(coverImg.s3KeyThumb || coverImg.s3KeyDisplay || coverImg.s3Key!);
                } else {
                    const dbCoverImg = await db.query.images.findFirst({ where: eq(images.id, album.coverImageId) });
                    if (dbCoverImg) {
                        coverImageUrl = await generateDownloadUrl(dbCoverImg.s3KeyThumb || dbCoverImg.s3KeyDisplay || dbCoverImg.s3Key!);
                    }
                }
            }

            if (album.images?.length) {
                for (const img of album.images) {
                    previewImageUrls.push(await generateDownloadUrl((img as any).s3KeyThumb || (img as any).s3KeyDisplay || (img as any).s3Key!));
                }
            }

            const { images: _, ...rest } = album;
            return {
                ...rest,
                taskRole: roleMap[album.id],
                coverImageUrl,
                previewImageUrls,
                imageCount: countsMap[album.id] || 0,
                albumDate: new Date(album.albumDate),
                joinedAt: new Date(joinedAtMap[album.id]),
                isFavorite: favoriteSet.has(album.id),
            };
        }));
    }

    private static sortAlbums(albums: any[], sortBy: string, sortDir: string) {
        albums.sort((a, b) => {
            let aVal: number, bVal: number;
            switch (sortBy) {
                case "albumDate":
                    aVal = a.albumDate.getTime();
                    bVal = b.albumDate.getTime();
                    break;
                case "createdAt":
                    aVal = new Date(a.createdAt).getTime();
                    bVal = new Date(b.createdAt).getTime();
                    break;
                case "joinedAt":
                default:
                    aVal = a.joinedAt.getTime();
                    bVal = b.joinedAt.getTime();
                    break;
            }
            if (aVal !== bVal) return sortDir === "asc" ? aVal - bVal : bVal - aVal;
            return sortDir === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
        });
    }

    static async createAlbum(userId: string, data: CreateAlbumData) {
        return db.transaction(async (tx) => {
            const [album] = await tx.insert(albums).values({
                ownerId: userId,
                title: data.title,
                description: data.description,
                visibility: data.visibility,
                albumDate: data.date ? new Date(data.date) : new Date(),
            }).returning();

            await tx.insert(albumMembers).values({
                userId,
                albumId: album.id,
                role: "owner",
            });

            if (data.coverImageKey) {
                const [img] = await tx.insert(images).values({
                    albumId: album.id,
                    s3Key: data.coverImageKey,
                    mimeType: "image/jpeg",
                    size: 0,
                    width: 0,
                    height: 0,
                }).returning();

                await tx.update(albums).set({ coverImageId: img.id }).where(eq(albums.id, album.id));
            }
            return album;
        });
    }
}
