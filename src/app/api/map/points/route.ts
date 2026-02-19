import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { MapService } from "@/lib/services/map.service";
import { generateDownloadUrl } from "@/lib/s3";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";

/**
 * @swagger
 * /api/map/points:
 *   get:
 *     tags:
 *       - Map
 *     summary: Get photo map points
 *     description: Returns grouped photo points for the map viewport. Uses permission-first filtering and dynamic precision grouping based on zoom level.
 *     parameters:
 *       - in: query
 *         name: minLat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxLat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: minLng
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxLng
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: zoom
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: until
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Grouped photo points for the viewport
 */
export async function GET(request: NextRequest) {
    const { userId, apiKey } = await getAuthContext();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (apiKey) {
        const limitCheck = await checkRateLimits(apiKey.id, apiKey.rateLimit, apiKey.rateLimitPerDay, request);
        if (!limitCheck.ok) {
            return NextResponse.json(limitCheck.error, { status: limitCheck.status });
        }
    }

    const start = performance.now();

    try {
        const { searchParams } = request.nextUrl;

        const minLat = Number(searchParams.get("minLat"));
        const maxLat = Number(searchParams.get("maxLat"));
        const minLng = Number(searchParams.get("minLng"));
        const maxLng = Number(searchParams.get("maxLng"));
        const zoom = Number(searchParams.get("zoom")) || 5;

        // Validate bounds
        if ([minLat, maxLat, minLng, maxLng].some(v => !isFinite(v))) {
            return NextResponse.json({ error: "Invalid bounds" }, { status: 400 });
        }

        const since = searchParams.get("since") || undefined;
        const until = searchParams.get("until") || undefined;

        const dbStart = performance.now();

        const points = await MapService.getPoints({
            userId,
            minLat,
            maxLat,
            minLng,
            maxLng,
            zoom,
            startDate: since,
            endDate: until,
        });

        const dbDur = Math.round(performance.now() - dbStart);

        // Generate signed URLs for thumbnail S3 keys (deduplicate to avoid repeat signing)
        const urlMap = new Map<string, string>();
        const allKeys = points.flatMap(p => p.thumbKeys);
        await Promise.all(
            allKeys.map(async key => {
                if (!urlMap.has(key)) {
                    urlMap.set(key, await generateDownloadUrl(key));
                }
            })
        );

        // Build response with signed thumb URLs
        const responsePoints = points.map(p => ({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            c: p.c,
            d: p.d,
            thumbs: p.thumbKeys.map(k => urlMap.get(k) || "").filter(Boolean),
        }));

        const totalDur = Math.round(performance.now() - start);

        const response = NextResponse.json({ points: responsePoints });

        // Server-Timing header for observability (visible in DevTools)
        response.headers.set("Server-Timing", `db;dur=${dbDur}, total;dur=${totalDur}`);
        // Private cache - permission-scoped data must never be shared
        response.headers.set("Cache-Control", "private, max-age=30");

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return response;
    } catch (error) {
        console.error("Map points error:", error);
        return NextResponse.json({ error: "Failed to load map points" }, { status: 500 });
    }
}
