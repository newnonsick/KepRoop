import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { refreshTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
// Need to hash token to find it? No, we store hashed, so we can't find by plain token easily unless we verify validity then match hash?
// Or we revoke ALL tokens for user? Or we rely on the client sending the refresh token to revoke IT specifically?
// Best practice: The logout endpoint receives the cookie. We get the refresh token from cookie.
// Validate it? Or just hash it and try to delete?
// We need to match the hash. `verifyPassword` compares plain to hash.
// If we want to delete a SPECIFIC token, we need to iterate or look it up.
// A common strategy for hashed tokens is: User sends refresh token.
// IF we can't search by hash (bcrypt is one-way specific salt), we can't assume we can find it by just hashing again (salts differ).
// Wait, if I iterate all tokens for user and `compare`, it's slow.
// Alternatively: Store a "family ID" or "token ID" inside the JWT.
// The RefreshToken payload should have a UUID `jti` or similar.
// Let's update `createRefreshToken` to include a unique ID in payload if we need individual revocation.
// Or, simply revoke by finding it?
// For now, simpler approach: The refreshToken table has an ID.
// If we put the `tokenId` in the JWT payload, we can just delete by ID.
// Let's modify `src/lib/auth/tokens.ts` (if needed) or just trust the process.
// Actually, `bcrypt` salts make looking up by "hash of incoming token" impossible directly in SQL `WHERE hash = ?`.
// We MUST have a lookup key.
// I will update `createRefreshToken` to include a `tokenId` (uuid) in the payload.
// Then `verifyRefreshToken` returns payload with `tokenId`.
// Then Logout can delete `where id = tokenId`.
// This is much better.

// I will defer writing Logout until I update the token utils.
// But first, let's write what we can.
// Actually, standard JWT has `jti` (JWT ID). I should use that.
// `SignJWT` can set `jti`.
// I will check `src/lib/auth/tokens.ts`.

export async function POST() {
    // Placeholder logout - just clears cookies for now until I fix the token ID logic.
    // Ideally we should also remove from DB to prevent reuse if stolen.

    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refreshToken")?.value;

    if (refreshToken) {
        // Ideally implementation to revoke from DB
        // For now, let's just clear cookies.
        // I will come back to this after updating token utils.
    }

    cookieStore.delete("accessToken");
    cookieStore.delete("refreshToken");

    return NextResponse.json({ success: true });
}
