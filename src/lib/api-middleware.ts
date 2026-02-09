
import { db } from "@/db";
import { apiKeyLogs, rateLimits, apiKeys } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { verifyApiKey } from "@/lib/auth/api-keys";

/**
 * Checks if the API key has exceeded its rate limit.
 * Uses a fixed window counter (per minute).
 */
export async function checkRateLimit(keyId: string, limit: number): Promise<boolean> {
    const now = new Date();
    // Round down to the nearest minute
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);

    // Upsert the rate limit counter
    // Note: Concurrency might be an issue here for high load, but acceptable for this scale.
    // Ideally we use Redis, but we are using Postgres.

    // Attempt to insert or update
    const [record] = await db.insert(rateLimits)
        .values({
            keyId,
            windowStart,
            requestCount: 1,
        })
        .onConflictDoUpdate({
            target: [rateLimits.keyId, rateLimits.windowStart],
            set: {
                requestCount: sql`${rateLimits.requestCount} + 1`,
            },
        })
        .returning();

    return record.requestCount <= limit;
}

/**
 * Logs API key usage.
 * precise: we want to capture the status code, so this should be called AFTER the handler.
 * But in Next.js App Router, it's hard to wrap handlers easily without a HOC.
 */
export async function logApiKeyUsage(
    keyId: string,
    request: Request,
    statusCode: number
) {
    // Fire and forget log insertion
    try {
        const headerMap = await headers();
        const userAgent = headerMap.get("user-agent") || undefined;
        const forwarded = headerMap.get("x-forwarded-for");
        const ip = forwarded ? forwarded.split(',')[0] : "unknown";

        await db.insert(apiKeyLogs).values({
            keyId,
            endpoint: new URL(request.url).pathname,
            method: request.method,
            ip,
            userAgent,
            statusCode,
        });
    } catch (err) {
        console.error("Failed to log API key usage", err);
    }
}

/**
 * Higher-order function to wrap API route handlers with API Key authentication,
 * Rate Limiting, and Logging.
 */
type RouteHandler = (req: Request, context: any) => Promise<Response>;

export function withApiKeyAuth(handler: RouteHandler): RouteHandler {
    return async (req: Request, context: any) => {
        const authHeader = req.headers.get("Authorization");

        // Check for API Key
        let apiKeyStr: string | null = null;
        if (authHeader?.startsWith("Bearer kp_")) {
            apiKeyStr = authHeader.substring(7);
        } else if (authHeader?.startsWith("Api-Key ")) {
            apiKeyStr = authHeader.substring(8);
        }

        if (!apiKeyStr) {
            // Fallback to existing auth or return 401? 
            // If this wrapper is strictly for API Key routes, return 401.
            // If we want to support hybrid, we need to check JWT too.
            // Let's assume this is strictly for external API access for now, 
            // or we check if user is logged in.
            return NextResponse.json({ error: "Unauthorized: Missing API Key" }, { status: 401 });
        }

        const verification = await verifyApiKey(apiKeyStr);
        if (!verification) {
            return NextResponse.json({ error: "Unauthorized: Invalid API Key" }, { status: 401 });
        }

        const { apiKey } = verification;

        // Rate Limiting
        const isAllowed = await checkRateLimit(apiKey.id, apiKey.rateLimit);
        if (!isAllowed) {
            await logApiKeyUsage(apiKey.id, req, 429);
            return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
        }

        // Execute Handler
        let response: Response;
        try {
            response = await handler(req, context);
        } catch (error) {
            console.error(error);
            response = NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        // Log Usage
        await logApiKeyUsage(apiKey.id, req, response.status);

        return response;
    };
}

import { NextResponse } from "next/server";
