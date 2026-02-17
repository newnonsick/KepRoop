
import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { generateApiKey, listApiKeys, getApiKeyUsageStats } from "@/lib/auth/api-keys";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { MAX_API_KEYS_PER_USER } from "@/lib/api-middleware";

/**
 * @swagger
 * /api/auth/api-keys:
 *   get:
 *     tags:
 *       - Auth
 *     summary: List API keys
 *     description: List all API keys for the authenticated user, including usage stats.
 *     responses:
 *       200:
 *         description: List of API keys with usage data
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
    const userId = await getAuthenticatedUser();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await listApiKeys(userId);

    // Enrich with usage stats
    const keyIds = keys.map(k => k.id);
    const usageStats = await getApiKeyUsageStats(keyIds);

    const enrichedKeys = keys.map(key => ({
        ...key,
        usage: usageStats[key.id] || { minuteUsage: 0, dailyUsage: 0 },
    }));

    return NextResponse.json(enrichedKeys);
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
    const userId = await getAuthenticatedUser();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Enforce max API keys per user
    const existingKeys = await listApiKeys(userId);
    if (existingKeys.length >= MAX_API_KEYS_PER_USER) {
        return NextResponse.json(
            { error: `Maximum of ${MAX_API_KEYS_PER_USER} API keys per user. Revoke an existing key to create a new one.` },
            { status: 403 }
        );
    }

    const body = await request.json();
    const name = body.name || "My API Key";

    const { key, record } = await generateApiKey(userId, name);

    return NextResponse.json({
        key,
        record: {
            ...record,
            usage: {
                minuteUsage: 0,
                dailyUsage: 0
            }
        }
    });
}
