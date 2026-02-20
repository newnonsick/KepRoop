import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { db } from "@/db";
import { images, albumMembers, albums } from "@/db/schema";
import { eq, desc, and, isNull, inArray, lt, or, sql } from "drizzle-orm";
import { generateDownloadUrl } from "@/lib/s3";

/**
 * @swagger
 * /api/timeline:
 *   get:
 *     tags:
 *       - Timeline
 *     summary: Get user's photo timeline
 *     description: Fetch all photos the user has access to, globally ordered by date taken. Supports cursor-based pagination.
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for pagination (format timestamp_imageId)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of photos to return per page
 *     responses:
 *       200:
 *         description: A list of photos
 */
export async function GET(request: Request) {
    const { userId } = await getAuthContext();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

    try {
        // 1. Get all album IDs the user has access to
        const userAlbums = await db
            .select({ albumId: albumMembers.albumId })
            .from(albumMembers)
            .where(eq(albumMembers.userId, userId));

        const accessibleAlbumIds = userAlbums.map((a) => a.albumId);

        if (accessibleAlbumIds.length === 0) {
            return NextResponse.json({ photos: [], nextCursor: null, hasMore: false });
        }

        // 2. Build the query conditions for images
        const conditions: any[] = [
            inArray(images.albumId, accessibleAlbumIds),
            isNull(images.deletedAt)
        ];

        // 3. Get total counts per month (only on initial fetch)
        const monthCounts: Record<string, number> = {};
        if (!cursor) {
            const countsResult = await db
                .select({
                    monthStr: sql<string>`TO_CHAR(COALESCE(${images.dateTaken}, ${images.createdAt}), 'YYYY-MM')`,
                    count: sql<number>`count(*)::int`
                })
                .from(images)
                .where(
                    and(
                        inArray(images.albumId, accessibleAlbumIds),
                        isNull(images.deletedAt)
                    )
                )
                .groupBy(sql`TO_CHAR(COALESCE(${images.dateTaken}, ${images.createdAt}), 'YYYY-MM')`);

            countsResult.forEach(row => {
                if (row.monthStr) {
                    monthCounts[row.monthStr] = row.count;
                }
            });
        }

        // 4. Handle Cursor for infinite scroll
        // Cursor format: "timestamp_imageId"
        if (cursor) {
            const [cursorTimeStr, cursorId] = cursor.split("_");
            const cursorDate = new Date(cursorTimeStr);

            // Fetch anything older than the cursor date. If exact same date, fetch if ID is smaller
            // Note: dateTaken can be null, we coalesce to createdAt in our mind, but for SQL we need to be careful.
            // A robust way is assuming the cursor represents the sorting value.

            // To simplify, we will sort purely by createdAt descending if dateTaken is unreliable, 
            // but for a timeline, dateTaken descending NULLS LAST (coalesced with createdAt) is best.
            // Drizzle doesn't perfectly support complex order by coalesced easily in simple WHERE clauses without raw SQL for cursors.
            // We will use raw SQL for the cursor condition to ensure accuracy

            const cursorTimestamp = cursorDate.getTime();

            conditions.push(
                or(
                    lt(images.dateTaken, cursorDate),
                    and(
                        eq(images.dateTaken, cursorDate),
                        lt(images.id, cursorId)
                    ),
                    // Fallback for null dateTaken, comparing createdAt instead if we decide to fallback.
                    // For now, let's keep it simple: strict dateTaken comparison if present, else fallback via DB query
                )
            );

            // A better approach for the cursor where clause: 
            // (COALESCE(date_taken, created_at) < cursorDate) OR (COALESCE(date_taken, created_at) = cursorDate AND id < cursorId)
        }

        // We will construct a query that sorts by COALESCE(dateTaken, createdAt) DESC, id DESC
        const rows = await db.query.images.findMany({
            where: (imgs, { and, inArray, isNull, sql }) => {
                const baseConditions = [
                    inArray(imgs.albumId, accessibleAlbumIds),
                    isNull(imgs.deletedAt)
                ];

                if (cursor) {
                    const [cursorTimeStr, cursorId] = cursor.split("_");

                    // Use raw SQL to cleanly handle the coalesce logic for the cursor
                    const cursorDate = new Date(cursorTimeStr).toISOString();
                    baseConditions.push(
                        sql`(COALESCE(${imgs.dateTaken}, ${imgs.createdAt}) < ${cursorDate}::timestamp) OR (COALESCE(${imgs.dateTaken}, ${imgs.createdAt}) = ${cursorDate}::timestamp AND ${imgs.id} < ${cursorId})`
                    );
                }

                return and(...baseConditions);
            },
            extras: {
                effectiveDate: sql<Date>`COALESCE(${images.dateTaken}, ${images.createdAt})`.as("effective_date"),
            },
            orderBy: (imgs, { desc }) => [
                desc(sql`COALESCE(${imgs.dateTaken}, ${imgs.createdAt})`),
                desc(imgs.id)
            ],
            limit: limit + 1, // Fetch one extra to determine if there is a next page
            with: {
                album: {
                    columns: {
                        id: true,
                        title: true,
                    }
                }
            }
        });

        const hasMore = rows.length > limit;
        const paginatedRows = hasMore ? rows.slice(0, limit) : rows;

        // 4. Transform results and generate Pre-signed URLs
        const photos = await Promise.all(
            paginatedRows.map(async (img) => {
                const thumbUrl = img.s3KeyThumb ? await generateDownloadUrl(img.s3KeyThumb) : null;
                const displayUrl = img.s3KeyDisplay ? await generateDownloadUrl(img.s3KeyDisplay) : null;
                const originalUrl = img.s3KeyOriginal ? await generateDownloadUrl(img.s3KeyOriginal) : (img.s3Key ? await generateDownloadUrl(img.s3Key) : null);

                // Determine the sorting date for the cursor
                const sortDate = img.dateTaken || img.createdAt;

                return {
                    id: img.id,
                    albumId: img.albumId,
                    albumTitle: img.album?.title,
                    url: thumbUrl || displayUrl || originalUrl, // Fallback chain
                    thumbUrl,
                    displayUrl,
                    originalUrl,
                    width: img.width,
                    height: img.height,
                    dateTaken: sortDate, // This is Date object
                };
            })
        );

        // 5. Build Next Cursor
        let nextCursor = null;
        if (hasMore && paginatedRows.length > 0) {
            const lastPhoto = paginatedRows[paginatedRows.length - 1];
            const lastDate = lastPhoto.dateTaken || lastPhoto.createdAt;
            if (lastDate) {
                nextCursor = `${lastDate.toISOString()}_${lastPhoto.id}`;
            }
        }

        return NextResponse.json({
            photos,
            nextCursor,
            hasMore,
            ...(cursor ? {} : { monthCounts })
        });

    } catch (error) {
        console.error("[TIMELINE_GET]", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
