import { db } from "@/db";
import { images, albumMembers, albums } from "@/db/schema";
import { sql, and, gte, lte, isNotNull } from "drizzle-orm";

/**
 * Dynamic precision factor based on zoom level.
 * Controls spatial grouping granularity for the map.
 */
function getPrecisionFactor(zoom: number): number {
    if (zoom < 5) return 1;          // ~111 km
    if (zoom < 8) return 10;         // ~11.1 km
    if (zoom < 11) return 100;       // ~1.1 km
    if (zoom < 14) return 1000;      // ~110 m
    return 100000;                    // ~1.1 m
}

/**
 * Adaptive limit clamp based on zoom level.
 * Low zoom = fewer groups needed; High zoom = more detail.
 */
function getAdaptiveLimit(zoom: number): number {
    const base = zoom < 5 ? 500 : zoom < 10 ? 2000 : 5000;
    return Math.max(1000, Math.min(base, 15000));
}

export interface MapPointsRequest {
    userId: string;
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    zoom: number;
    startDate?: string;
    endDate?: string;
}

export interface MapPoint {
    id: string;
    lat: number;
    lng: number;
    c: number;   // count of photos at this snapped location
    d: string;   // newest date (ISO string)
    thumbKeys: string[];  // up to 3 thumbnail S3 keys for marker preview
}

export class MapService {
    /**
     * Get grouped photo points for the map viewport.
     * Uses Permission-First JOIN strategy and Dynamic Precision Grouping.
     * Returns up to 3 thumbnail S3 keys per group for photo markers.
     */
    static async getPoints(params: MapPointsRequest): Promise<MapPoint[]> {
        const { userId, minLat, maxLat, minLng, maxLng, zoom, startDate, endDate } = params;

        const factor = getPrecisionFactor(zoom);
        const limit = getAdaptiveLimit(zoom);

        // Build time filter conditions
        const timeFilters = [];
        if (startDate) {
            timeFilters.push(sql`i.date_taken >= ${new Date(startDate)}`);
        }
        if (endDate) {
            timeFilters.push(sql`i.date_taken <= ${new Date(endDate)}`);
        }

        const timeClause = timeFilters.length > 0
            ? sql.join([sql`AND`, ...timeFilters.map((f, i) => i > 0 ? sql.join([sql`AND`, f], sql` `) : f)], sql` `)
            : sql``;

        // Permission-First JOIN query with Dynamic Precision Grouping
        // Query path: album_members (filtered by user) -> images (filtered by bounds)
        // array_agg collects up to 3 thumbnail keys per group for photo markers
        const result = await db.execute(sql`
            SELECT 
                FLOOR(i.gps_lat * ${factor}::float8) / ${factor}::float8 as lat,
                FLOOR(i.gps_lng * ${factor}::float8) / ${factor}::float8 as lng,
                COUNT(*)::int as c,
                MIN(i.id::text) as id,
                MAX(i.date_taken) as d,
                (array_agg(i.s3_key_thumb ORDER BY i.date_taken DESC NULLS LAST)
                  FILTER (WHERE i.s3_key_thumb IS NOT NULL))[1:3] as thumbs
            FROM album_members am
            JOIN images i ON am.album_id = i.album_id
            WHERE 
                am.user_id = ${userId}
                AND i.gps_lat IS NOT NULL
                AND i.gps_lng IS NOT NULL
                AND i.gps_lat BETWEEN ${minLat} AND ${maxLat}
                AND i.gps_lng BETWEEN ${minLng} AND ${maxLng}
                AND i.deleted_at IS NULL
                ${timeClause}
            GROUP BY 1, 2
            ORDER BY c DESC
            LIMIT ${limit}
        `);

        return (result.rows as any[]).map(row => ({
            id: row.id,
            lat: Number(row.lat),
            lng: Number(row.lng),
            c: Number(row.c),
            d: row.d ? new Date(row.d).toISOString() : "",
            thumbKeys: Array.isArray(row.thumbs) ? row.thumbs.filter(Boolean) : [],
        }));
    }

    /**
     * Get the date range of all geotagged photos the user has access to.
     * Used by the frontend to initialize the Timeline Slider.
     */
    static async getDateRange(userId: string): Promise<{ min: string | null; max: string | null }> {
        const result = await db.execute(sql`
            SELECT 
                MIN(i.date_taken) as min_date,
                MAX(i.date_taken) as max_date
            FROM album_members am
            JOIN images i ON am.album_id = i.album_id
            WHERE 
                am.user_id = ${userId}
                AND i.gps_lat IS NOT NULL
                AND i.deleted_at IS NULL
                AND i.date_taken IS NOT NULL
        `);

        const row = (result.rows as any[])[0];
        return {
            min: row?.min_date ? new Date(row.min_date).toISOString() : null,
            max: row?.max_date ? new Date(row.max_date).toISOString() : null,
        };
    }

    /**
     * Get individual photos in the viewport for the sidebar panel.
     * Supports pagination via offset/limit for infinite scroll.
     * Returns photos + total count so the frontend can show "X photos" and load more.
     */
    static async getPhotosInViewport(params: {
        userId: string;
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
        offset?: number;
        limit?: number;
    }): Promise<{ photos: any[]; total: number }> {
        const { userId, minLat, maxLat, minLng, maxLng, offset = 0, limit = 20 } = params;

        // Run photos query and count query in parallel
        const [photosResult, countResult] = await Promise.all([
            db.execute(sql`
                SELECT 
                    i.id,
                    i.gps_lat as lat,
                    i.gps_lng as lng,
                    i.s3_key_thumb,
                    i.s3_key_display,
                    i.date_taken,
                    i.original_filename,
                    i.width,
                    i.height,
                    i.album_id,
                    a.title as album_title
                FROM album_members am
                JOIN images i ON am.album_id = i.album_id
                JOIN albums a ON a.id = i.album_id
                WHERE 
                    am.user_id = ${userId}
                    AND i.gps_lat IS NOT NULL
                    AND i.gps_lng IS NOT NULL
                    AND i.gps_lat BETWEEN ${minLat} AND ${maxLat}
                    AND i.gps_lng BETWEEN ${minLng} AND ${maxLng}
                    AND i.deleted_at IS NULL
                ORDER BY i.date_taken DESC NULLS LAST
                LIMIT ${limit}
                OFFSET ${offset}
            `),
            db.execute(sql`
                SELECT COUNT(*)::int as total
                FROM album_members am
                JOIN images i ON am.album_id = i.album_id
                WHERE 
                    am.user_id = ${userId}
                    AND i.gps_lat IS NOT NULL
                    AND i.gps_lng IS NOT NULL
                    AND i.gps_lat BETWEEN ${minLat} AND ${maxLat}
                    AND i.gps_lng BETWEEN ${minLng} AND ${maxLng}
                    AND i.deleted_at IS NULL
            `),
        ]);

        const total = Number((countResult.rows as any[])[0]?.total ?? 0);

        const photos = (photosResult.rows as any[]).map(row => ({
            id: row.id,
            lat: Number(row.lat),
            lng: Number(row.lng),
            thumbKey: row.s3_key_thumb || row.s3_key_display,
            displayKey: row.s3_key_display || row.s3_key_thumb,
            dateTaken: row.date_taken ? new Date(row.date_taken).toISOString() : null,
            filename: row.original_filename,
            width: row.width,
            height: row.height,
            albumId: row.album_id,
            albumTitle: row.album_title,
        }));

        return { photos, total };
    }
}
