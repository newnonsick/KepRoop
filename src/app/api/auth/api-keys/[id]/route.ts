
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { revokeApiKey } from "@/lib/auth/api-keys";
import { getAuthenticatedUser } from "@/lib/auth/session";

/**
 * @swagger
// ...
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const userId = await getAuthenticatedUser();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const revokedKey = await revokeApiKey(id, userId);

    if (!revokedKey) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}
