import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { MapService } from "@/lib/services/map.service";
import { generateDownloadUrl } from "@/lib/s3";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";

/**
 * @swagger
 * /api/map/photos:
 *   get:
 *     tags:
 *       - Map
 *     summary: Get photo map points
 *     description: Returns individual photos in the viewport for the sidebar panel. Each photo includes a display-quality signed URL and album deep-link info.
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
 *     responses:
 *       200:
 *         description: Individual photos in the viewport
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

    try {
        const { searchParams } = request.nextUrl;

        const minLat = Number(searchParams.get("minLat"));
        const maxLat = Number(searchParams.get("maxLat"));
        const minLng = Number(searchParams.get("minLng"));
        const maxLng = Number(searchParams.get("maxLng"));

        if ([minLat, maxLat, minLng, maxLng].some(v => !isFinite(v))) {
            return NextResponse.json({ error: "Invalid bounds" }, { status: 400 });
        }

        const photos = await MapService.getPhotosInViewport({
            userId, minLat, maxLat, minLng, maxLng,
        });

        // Generate signed URLs (deduplicated)
        const urlMap = new Map<string, string>();
        const allKeys = photos.flatMap(p => [p.thumbKey, p.displayKey]).filter(Boolean);
        await Promise.all(
            [...new Set(allKeys)].map(async key => {
                urlMap.set(key, await generateDownloadUrl(key));
            })
        );

        const responsePhotos = photos.map(p => ({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            thumbUrl: urlMap.get(p.thumbKey) || "",
            displayUrl: urlMap.get(p.displayKey) || "",
            dateTaken: p.dateTaken,
            filename: p.filename,
            width: p.width,
            height: p.height,
            albumId: p.albumId,
            albumTitle: p.albumTitle,
        }));

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        const response = NextResponse.json({ photos: responsePhotos });
        response.headers.set("Cache-Control", "private, max-age=30");
        return response;
    } catch (error) {
        console.error("Map photos error:", error);
        return NextResponse.json({ error: "Failed to load photos" }, { status: 500 });
    }
}
