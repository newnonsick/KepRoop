/**
 * Lightweight in-memory rate limiter for auth endpoints.
 * Uses fixed-window algorithm with automatic cleanup.
 *
 * NOT suitable for distributed deployments — use Redis for those.
 * But ideal for single-instance self-hosted setups like KepRoop.
 */

interface RateLimitEntry {
    count: number;
    windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;

    for (const [key, entry] of store) {
        if (now - entry.windowStart > windowMs * 2) {
            store.delete(key);
        }
    }
}

export interface RateLimitResult {
    allowed: boolean;
    retryAfter: number; // seconds until the window resets
    remaining: number;
}

/**
 * Check and increment rate limit for a given key.
 *
 * @param key - Unique identifier (e.g., IP address, email, or combination)
 * @param maxAttempts - Maximum attempts allowed in the window
 * @param windowSeconds - Window duration in seconds
 */
export function checkRateLimit(
    key: string,
    maxAttempts: number,
    windowSeconds: number
): RateLimitResult {
    const windowMs = windowSeconds * 1000;
    const now = Date.now();

    cleanup(windowMs);

    const entry = store.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
        // New window
        store.set(key, { count: 1, windowStart: now });
        return { allowed: true, retryAfter: 0, remaining: maxAttempts - 1 };
    }

    if (entry.count >= maxAttempts) {
        const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
        return { allowed: false, retryAfter, remaining: 0 };
    }

    entry.count += 1;
    return { allowed: true, retryAfter: 0, remaining: maxAttempts - entry.count };
}

/**
 * Helper to get the client IP from a request.
 * Falls back to "unknown" if IP detection fails.
 */
export function getClientIp(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp;
    return "unknown";
}
