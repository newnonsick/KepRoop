import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { albums, albumMembers, images } from "@/db/schema";
import { z } from "zod";
import { eq, desc, sql, and, isNull, inArray } from "drizzle-orm";

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

export async function GET() {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get albums with image counts and cover image data
    // Fetch up to 4 images for collage fallback
    const userAlbums = await db.query.albumMembers.findMany({
        where: eq(albumMembers.userId, userId),
        with: {
            album: {
                with: {
                    images: {
                        limit: 4,
                        orderBy: (images, { asc }) => [asc(images.createdAt)],
                        where: (images, { isNull }) => isNull(images.deletedAt),
                    },
                },
            },
        },
        orderBy: desc(albumMembers.joinedAt),
    });

    // Fetch accurate total counts
    const albumIds = userAlbums.map(m => m.albumId).filter(Boolean) as string[];
    let countsMap: Record<string, number> = {};

    if (albumIds.length > 0) {
        const counts = await db
            .select({
                albumId: images.albumId,
                count: sql<number>`count(*)`.mapWith(Number)
            })
            .from(images)
            .where(and(
                inArray(images.albumId, albumIds),
                isNull(images.deletedAt)
            ))
            .groupBy(images.albumId);

        countsMap = Object.fromEntries(counts.map(c => [c.albumId, c.count]));
    }

    const { generateDownloadUrl } = await import("@/lib/s3");

    const albumsWithCovers = await Promise.all(
        userAlbums.flatMap((m) => {
            if (!m.album) return [];
            return [(async () => {
                let coverImageUrl = null;
                const previewImageUrls: string[] = [];

                // 1. Handle explicit cover
                if (m.album.coverImageId) {
                    // Try to find it in the fetched images first
                    const coverImg = m.album.images.find((img: any) => img.id === m.album.coverImageId);
                    if (coverImg) {
                        coverImageUrl = await generateDownloadUrl(coverImg.s3Key);
                    } else {
                        // If not in top 4, fetch it specifically (rare case but possible)
                        const dbCoverImg = await db.query.images.findFirst({
                            where: eq(images.id, m.album.coverImageId)
                        });
                        if (dbCoverImg) {
                            coverImageUrl = await generateDownloadUrl(dbCoverImg.s3Key);
                        }
                    }
                }

                // 2. Generate preview URLs (collage fallback)
                // Even if we have a cover, we send previews for the case where cover is removed
                if (m.album.images?.length) {
                    for (const img of m.album.images) {
                        previewImageUrls.push(await generateDownloadUrl(img.s3Key));
                    }
                }

                const { images: _, ...albumWithoutImages } = m.album;
                return {
                    ...albumWithoutImages,
                    taskRole: m.role,
                    coverImageUrl,
                    previewImageUrls,
                    imageCount: countsMap[m.album.id] || 0,
                    albumDate: m.album.albumDate,
                };
            })()];
        })
    );

    return NextResponse.json({ albums: albumsWithCovers });
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
