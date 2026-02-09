
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { rotateApiKey } from "@/lib/auth/api-keys";

/**
 * @swagger
 * /api/auth/api-keys/{id}/rotate:
 *   post:
 *     description: Rotate an API key (revoke old, create new)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The new API key
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(token);
    if (!payload?.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const { key, record } = await rotateApiKey(id, payload.userId);
        return NextResponse.json({ key, record });
    } catch (error) {
        return NextResponse.json({ error: "Failed to rotate key" }, { status: 400 });
    }
}
