
import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { generateApiKey, listApiKeys } from "@/lib/auth/api-keys";

/**
 * @swagger
 * /api/auth/api-keys:
 *   get:
 *     tags:
 *       - Auth
 *     summary: List API keys
 *     description: List all API keys for the authenticated user
 *     responses:
 *       200:
 *         description: A list of API keys
 */
export async function GET(request: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(token);
    if (!payload?.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await listApiKeys(payload.userId);
    return NextResponse.json(keys);
}

/**
 * @swagger
 * /api/auth/api-keys:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Create API key
 *     description: Create a new API key
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: The created API key (only shown once)
 */
export async function POST(request: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(token);
    if (!payload?.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = body.name || "My API Key";

    const { key, record } = await generateApiKey(payload.userId, name);

    return NextResponse.json({ key, record });
}
