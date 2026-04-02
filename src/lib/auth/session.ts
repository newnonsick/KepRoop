import { headers, cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { verifyApiKey } from "@/lib/auth/api-keys";

/**
 * Retrieves the authenticated user's ID from either:
 * 1. Session cookies (accessToken)
 * 2. Authorization header (Bearer token or raw API Key)
 */
export async function getAuthenticatedUser() {
    const context = await getAuthContext();
    return context.userId;
}

export interface ApiKeyContext {
    id: string;
    userId: string;
    name: string;
    rateLimit: number;
    rateLimitPerDay: number;
}

export interface AuthContext {
    userId: string | null;
    apiKey: ApiKeyContext | null;
}

/**
 * Retrieves full authentication context, including API Key if used.
 * This allows route handlers to perform rate limiting and logging.
 */
export async function getAuthContext(): Promise<AuthContext> {
    // 1. Check Cookies (Session)
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (token) {
        const payload = await verifyAccessToken(token);
        if (payload?.userId) return { userId: payload.userId, apiKey: null };
    }

    // 2. Check Authorization Header (API Key)
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (authHeader) {
        let key = authHeader.trim();

        if (key.startsWith("Bearer ")) {
            key = key.substring(7).trim();
        } else if (key.startsWith("Api-Key ")) {
            key = key.substring(8).trim();
        }

        if (key.startsWith("kp_")) {
            const result = await verifyApiKey(key);
            if (result?.user?.id) {
                return {
                    userId: result.user.id,
                    apiKey: {
                        id: result.apiKey.id,
                        userId: result.apiKey.userId,
                        name: result.apiKey.name,
                        rateLimit: result.apiKey.rateLimit,
                        rateLimitPerDay: result.apiKey.rateLimitPerDay,
                    },
                };
            }
        }
    }

    return { userId: null, apiKey: null };
}

