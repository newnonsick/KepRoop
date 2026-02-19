import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { MapService } from "@/lib/services/map.service";
import { checkRateLimits, logApiKeyUsage } from "@/lib/api-middleware";

/**
 * @swagger
 * /api/map/date-range:
 *   get:
 *     tags:
 *       - Map
 *     summary: Get photo date range
 *     description: Returns the min/max dates of geotagged photos the user has access to.
 *     responses:
 *       200:
 *         description: Date range boundaries
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
        const range = await MapService.getDateRange(userId);

        if (apiKey) {
            await logApiKeyUsage(apiKey.id, request, 200);
        }

        return NextResponse.json(range);
    } catch (error) {
        console.error("Map date range error:", error);
        return NextResponse.json({ error: "Failed to load date range" }, { status: 500 });
    }
}
