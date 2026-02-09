
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { revokeApiKey } from "@/lib/auth/api-keys";

/**
 * @swagger
 * /api/auth/api-keys/{id}:
 *   delete:
 *     tags:
 *       - Auth
 *     summary: Revoke API key
 *     description: Revoke an API key
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
export async function DELETE(
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
    const revokedKey = await revokeApiKey(id, payload.userId);

    if (!revokedKey) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}
