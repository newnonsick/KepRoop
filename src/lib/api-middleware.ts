
import { db } from "@/db";
import { apiKeyLogs, rateLimits, apiKeys } from "@/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-keys";
import { RATE_LIMIT_PER_MINUTE, RATE_LIMIT_PER_DAY, MAX_API_KEYS_PER_USER } from "@/lib/api-key-policy";

// Re-export policy constants for backward compatibility
export { RATE_LIMIT_PER_MINUTE, RATE_LIMIT_PER_DAY, MAX_API_KEYS_PER_USER } from "@/lib/api-key-policy";


/**
 * Checks the per-minute rate limit (60 req/min).
 * Uses a fixed-window counter keyed on (keyId, windowStart).
 * Window is based on UTC time.
 */
async function checkMinuteRateLimit(keyId: string, limit: number): Promise<boolean> {
    const now = new Date();
    // UTC Minute Window: truncate seconds and milliseconds
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), 0, 0));

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
 * Checks the per-day rate limit (2,000 req/day).
 * Sums all minute-window counters for the current UTC day.
 */
async function checkDailyRateLimit(keyId: string, limit: number): Promise<boolean> {
    const now = new Date();
    // UTC Day Window: truncate hours, minutes, seconds, milliseconds
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

    const [result] = await db
        .select({ total: sql<number>`coalesce(sum(${rateLimits.requestCount}), 0)` })
        .from(rateLimits)
        .where(and(
            eq(rateLimits.keyId, keyId),
            gte(rateLimits.windowStart, dayStart),
        ));

    return (result?.total ?? 0) <= limit;
}

/**
 * Checks compliance with rate limits.
 * Returns { ok: true } if allowed, or { ok: false, error: ... } if blocked.
 * Also logs the attempt if blocked.
 */
export async function checkRateLimits(keyId: string, limitPerMinute: number, limitPerDay: number, req?: Request): Promise<{ ok: boolean; error?: any; status?: number }> {
    // 1. Check Minute Limit
    const minuteOk = await checkMinuteRateLimit(keyId, limitPerMinute);
    if (!minuteOk) {
        if (req) await logApiKeyUsage(keyId, req, 429);
        return {
            ok: false,
            status: 429,
            error: {
                error: "Too Many Requests",
                detail: `Rate limit exceeded: ${limitPerMinute} requests per minute`
            }
        };
    }

    // 2. Check Daily Limit
    const dailyOk = await checkDailyRateLimit(keyId, limitPerDay);
    if (!dailyOk) {
        if (req) await logApiKeyUsage(keyId, req, 429);
        return {
            ok: false,
            status: 429,
            error: {
                error: "Too Many Requests",
                detail: `Daily limit exceeded: ${limitPerDay} requests per day`
            }
        };
    }

    return { ok: true };
}

/**
 * Logs API key usage.
 */
export async function logApiKeyUsage(
    keyId: string,
    request: Request,
    statusCode: number
) {
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
 * rate limiting (60/min + 2,000/day), and usage logging.
 */
type RouteHandler = (req: Request, context: any) => Promise<Response>;

export function withApiKeyAuth(handler: RouteHandler): RouteHandler {
    return async (req: Request, context: any) => {
        const authHeader = req.headers.get("Authorization");

        // Extract API Key
        let apiKeyStr: string | null = null;
        if (authHeader?.startsWith("Bearer kp_")) {
            apiKeyStr = authHeader.substring(7);
        } else if (authHeader?.startsWith("Api-Key ")) {
            apiKeyStr = authHeader.substring(8);
        }

        if (!apiKeyStr) {
            return NextResponse.json({ error: "Unauthorized: Missing API Key" }, { status: 401 });
        }

        const verification = await verifyApiKey(apiKeyStr);
        if (!verification) {
            return NextResponse.json({ error: "Unauthorized: Invalid API Key" }, { status: 401 });
        }

        const { apiKey } = verification;

        // Per-minute rate limit (uses key's stored limit)
        const minuteOk = await checkMinuteRateLimit(apiKey.id, apiKey.rateLimit);
        if (!minuteOk) {
            await logApiKeyUsage(apiKey.id, req, 429);
            return NextResponse.json(
                { error: "Too Many Requests", detail: `Rate limit exceeded: ${apiKey.rateLimit} requests per minute` },
                { status: 429, headers: { "Retry-After": "60" } }
            );
        }

        // Per-day rate limit (uses key's stored daily limit)
        const dailyOk = await checkDailyRateLimit(apiKey.id, apiKey.rateLimitPerDay);
        if (!dailyOk) {
            await logApiKeyUsage(apiKey.id, req, 429);
            return NextResponse.json(
                { error: "Too Many Requests", detail: `Daily limit exceeded: ${apiKey.rateLimitPerDay} requests per day` },
                { status: 429, headers: { "Retry-After": "3600" } }
            );
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
