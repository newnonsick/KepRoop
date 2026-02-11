
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { rotateApiKey } from "@/lib/auth/api-keys";
import { getAuthenticatedUser } from "@/lib/auth/session";

/**
 * @swagger
// ...
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const userId = await getAuthenticatedUser();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const { key, record } = await rotateApiKey(id, userId);
        return NextResponse.json({ key, record });
    } catch (error) {
        return NextResponse.json({ error: "Failed to rotate key" }, { status: 400 });
    }
}
