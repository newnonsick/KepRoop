import { headers, cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { verifyApiKey } from "@/lib/auth/api-keys";

/**
 * Retrieves the authenticated user's ID from either:
 * 1. Session cookies (accessToken)
 * 2. Authorization header (Bearer token or raw API Key)
 */
export async function getAuthenticatedUser() {
    // 1. Check Cookies (Session)
    // Most common for frontend usage
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (token) {
        const payload = await verifyAccessToken(token);
        if (payload?.userId) return payload.userId;
    }

    // 2. Check Authorization Header (API Key)
    // Used by Swagger and external scripts
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (authHeader) {
        let key = authHeader.trim();

        // Handle "Bearer " prefix (Swagger often sends this)
        // Also allow "Api-Key " prefix if used
        if (key.startsWith("Bearer ")) {
            key = key.substring(7).trim();
        } else if (key.startsWith("Api-Key ")) {
            key = key.substring(8).trim();
        }

        // Check if it looks like an API Key
        // Our keys start with "kp_"
        if (key.startsWith("kp_")) {
            const result = await verifyApiKey(key);
            if (result?.user?.id) {
                return result.user.id;
            }
        }
    }

    return null;
}
