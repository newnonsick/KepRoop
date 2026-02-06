import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { albums, albumMembers, images } from "@/db/schema";
import { z } from "zod";
import { eq, desc, sql, and, isNull, inArray, or, ilike, gte, lte, lt, gt } from "drizzle-orm";

const createAlbumSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    visibility: z.enum(["public", "private"]).default("private"),
    date: z.string().optional(), // ISO string from client
    coverImageKey: z.string().optional(), // S3 key for initial cover
});

// Helper to get user ID
async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

export async function GET(request: Request) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor"); // Format: "timestamp_albumId"
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "12"), 50);
    const filter = url.searchParams.get("filter") || "all"; // "all", "mine", "shared"
    const visibility = url.searchParams.get("visibility"); // "public", "private", or null
    const startDate = url.searchParams.get("startDate"); // ISO date string
    const endDate = url.searchParams.get("endDate"); // ISO date string
    const search = url.searchParams.get("search"); // Search query
    const sortBy = url.searchParams.get("sortBy") || "albumDate"; // "albumDate", "createdAt"
    const sortDir = url.searchParams.get("sortDir") || "desc"; // "asc" or "desc"

    // Build conditions for album_members query
    const memberConditions: any[] = [eq(albumMembers.userId, userId)];

    // Role filter
    if (filter === "mine") {
        memberConditions.push(eq(albumMembers.role, "owner"));
    } else if (filter === "shared") {
        memberConditions.push(sql`${albumMembers.role} != 'owner'`);
    }

    // Cursor-based pagination: (joinedAt, albumId)
    if (cursor) {
        const [cursorTime, cursorId] = cursor.split("_");
        const cursorDate = new Date(cursorTime);
        memberConditions.push(
            or(
                lt(albumMembers.joinedAt, cursorDate),
                and(
                    eq(albumMembers.joinedAt, cursorDate),
                    lt(albumMembers.albumId, cursorId)
                )
            )
        );
    }

    // First get the album member rows with pagination
    const memberRows = await db
        .select({
            albumId: albumMembers.albumId,
            role: albumMembers.role,
            joinedAt: albumMembers.joinedAt,
        })
        .from(albumMembers)
        .where(and(...memberConditions))
        .orderBy(desc(albumMembers.joinedAt), desc(albumMembers.albumId))
        .limit(limit + 1); // Fetch one extra to check hasMore

    const hasMore = memberRows.length > limit;
    const paginatedMembers = hasMore ? memberRows.slice(0, limit) : memberRows;

    if (paginatedMembers.length === 0) {
        return NextResponse.json({
            albums: [],
            nextCursor: null,
            hasMore: false,
            total: 0,
        });
    }

    const albumIds = paginatedMembers.map(m => m.albumId);
    const roleMap = Object.fromEntries(paginatedMembers.map(m => [m.albumId, m.role]));
    const joinedAtMap = Object.fromEntries(paginatedMembers.map(m => [m.albumId, m.joinedAt]));

    // Build album filter conditions
    const albumConditions: any[] = [inArray(albums.id, albumIds)];

    if (visibility === "public" || visibility === "private") {
        albumConditions.push(eq(albums.visibility, visibility));
    }

    if (startDate) {
        albumConditions.push(gte(albums.albumDate, new Date(startDate)));
    }

    if (endDate) {
        // End of day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        albumConditions.push(lte(albums.albumDate, endDateTime));
    }

    if (search) {
        albumConditions.push(
            or(
                ilike(albums.title, `%${search}%`),
                ilike(albums.description, `%${search}%`)
            )
        );
    }

    // Fetch albums with filters
    const filteredAlbums = await db.query.albums.findMany({
        where: and(...albumConditions),
        with: {
            images: {
                limit: 4,
                orderBy: (images, { asc }) => [asc(images.createdAt)],
                where: (images, { isNull }) => isNull(images.deletedAt),
            },
        },
    });

    // Get image counts
    const filteredAlbumIds = filteredAlbums.map(a => a.id);
    let countsMap: Record<string, number> = {};

    if (filteredAlbumIds.length > 0) {
        const counts = await db
            .select({
                albumId: images.albumId,
                count: sql<number>`count(*)`.mapWith(Number)
            })
            .from(images)
            .where(and(
                inArray(images.albumId, filteredAlbumIds),
                isNull(images.deletedAt)
            ))
            .groupBy(images.albumId);

        countsMap = Object.fromEntries(counts.map(c => [c.albumId, c.count]));
    }

    const { generateDownloadUrl } = await import("@/lib/s3");

    const albumsWithCovers = await Promise.all(
        filteredAlbums.map(async (album) => {
            let coverImageUrl = null;
            const previewImageUrls: string[] = [];

            // 1. Handle explicit cover
            if (album.coverImageId) {
                const coverImg = album.images.find((img: any) => img.id === album.coverImageId);
                if (coverImg) {
                    coverImageUrl = await generateDownloadUrl(coverImg.s3KeyThumb || coverImg.s3KeyDisplay || coverImg.s3Key!);
                } else {
                    const dbCoverImg = await db.query.images.findFirst({
                        where: eq(images.id, album.coverImageId)
                    });
                    if (dbCoverImg) {
                        coverImageUrl = await generateDownloadUrl(dbCoverImg.s3KeyThumb || dbCoverImg.s3KeyDisplay || dbCoverImg.s3Key!);
                    }
                }
            }

            // 2. Generate preview URLs
            if (album.images?.length) {
                for (const img of album.images) {
                    previewImageUrls.push(await generateDownloadUrl((img as any).s3KeyThumb || (img as any).s3KeyDisplay || (img as any).s3Key!));
                }
            }

            const { images: _, ...albumWithoutImages } = album;
            return {
                ...albumWithoutImages,
                taskRole: roleMap[album.id],
                coverImageUrl,
                previewImageUrls,
                imageCount: countsMap[album.id] || 0,
                albumDate: album.albumDate,
                joinedAt: joinedAtMap[album.id],
            };
        })
    );

    // Sort albums based on sortBy parameter
    albumsWithCovers.sort((a, b) => {
        let aVal: number, bVal: number;

        switch (sortBy) {
            case "albumDate":
                aVal = new Date(a.albumDate).getTime();
                bVal = new Date(b.albumDate).getTime();
                break;
            case "createdAt":
                aVal = new Date(a.createdAt).getTime();
                bVal = new Date(b.createdAt).getTime();
                break;
            case "joinedAt":
            default:
                aVal = new Date(a.joinedAt).getTime();
                bVal = new Date(b.joinedAt).getTime();
                break;
        }

        if (aVal !== bVal) {
            return sortDir === "asc" ? aVal - bVal : bVal - aVal;
        }
        return sortDir === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });

    // Generate next cursor
    let nextCursor = null;
    if (hasMore && paginatedMembers.length > 0) {
        const lastMember = paginatedMembers[paginatedMembers.length - 1];
        nextCursor = `${lastMember.joinedAt.toISOString()}_${lastMember.albumId}`;
    }

    return NextResponse.json({
        albums: albumsWithCovers,
        nextCursor,
        hasMore,
    });
}

export async function POST(request: Request) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, description, visibility, date, coverImageKey } = createAlbumSchema.parse(body);

        const newAlbum = await db.transaction(async (tx) => {
            // 1. Create album
            const [album] = await tx.insert(albums).values({
                ownerId: userId,
                title,
                description,
                visibility,
                albumDate: date ? new Date(date) : new Date(),
            }).returning();

            // 2. Add as member
            await tx.insert(albumMembers).values({
                userId,
                albumId: album.id,
                role: "owner",
            });

            // 3. Handle initial cover if provided
            if (coverImageKey) {
                // Insert into images table
                const [img] = await tx.insert(images).values({
                    albumId: album.id,
                    s3Key: coverImageKey,
                    mimeType: "image/jpeg", // Default for covers
                    size: 0,
                    width: 0,
                    height: 0,
                }).returning();

                // Set as cover
                await tx.update(albums).set({
                    coverImageId: img.id
                }).where(eq(albums.id, album.id));
            }

            return album;
        });

        return NextResponse.json({ album: newAlbum });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
