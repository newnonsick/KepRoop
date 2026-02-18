import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { MapService } from "@/lib/services/map.service";

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
export async function GET() {
    const { userId } = await getAuthContext();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const range = await MapService.getDateRange(userId);
        return NextResponse.json(range);
    } catch (error) {
        console.error("Map date range error:", error);
        return NextResponse.json({ error: "Failed to load date range" }, { status: 500 });
    }
}
