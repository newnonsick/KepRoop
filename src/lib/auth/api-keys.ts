import { db } from "@/db";
import { apiKeys, apiKeyLogs, rateLimits } from "@/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { compare, hash } from "bcryptjs";

const KEY_PREFIX = "kp_";
const KEY_LENGTH = 32;

/**
 * Generates a new API key for a user.
 * Returns the raw key (to show to the user once) and the database record.
 */
export async function generateApiKey(userId: string, name: string, rateLimit: number = 1000) {
    const keySecret = nanoid(KEY_LENGTH);
    const fullKey = `${KEY_PREFIX}${keySecret}`;
    const keyHash = await hash(fullKey, 10);
    const prefix = fullKey.substring(0, 8); // Store enough to identify but not reconstruct

    const [apiKeyRecord] = await db.insert(apiKeys).values({
        userId,
        name,
        keyHash,
        prefix,
        rateLimit,
    }).returning();

    return {
        key: fullKey,
        record: apiKeyRecord,
    };
}

/**
 * Verifies an API key and returns the associated user and key record.
 * Also checks if the key is revoked.
 */
export async function verifyApiKey(fullKey: string) {
    if (!fullKey.startsWith(KEY_PREFIX)) {
        return null;
    }

    // We can't look up by hash directly since bcrypt salts are random.
    // We need to look up by prefix first (optimization), or iterate?
    // Actually, storing a "prefix" allows us to filter candidates.
    // Security note: Prefix should not be the secret part.
    // If the key is "kp_SECRET", prefix could be "kp_SECR".
    // Alternatively, we can store a separate "lookup index" if we want O(1).
    // But iterating over keys with same prefix for a user is fine? NO.
    // We need to look up a key by SOME identifier or check all active keys.
    // Standard practice: "kp_ID_SECRET".
    // Let's adjust: "kp_" + nanoid(ID) + nanoid(SECRET)?
    // Or just store the prefix and query by prefix.

    // Implementation: Query by prefix.
    const prefix = fullKey.substring(0, 8);

    const candidates = await db.query.apiKeys.findMany({
        where: and(
            eq(apiKeys.prefix, prefix),
            sql`${apiKeys.revokedAt} IS NULL`
        ),
        with: {
            user: true,
        }
    });

    for (const candidate of candidates) {
        const isValid = await compare(fullKey, candidate.keyHash);
        if (isValid) {
            // Update last used at (async, fire and forget)
            await db.update(apiKeys)
                .set({ lastUsedAt: new Date() })
                .where(eq(apiKeys.id, candidate.id));

            return {
                user: candidate.user,
                apiKey: candidate,
            };
        }
    }

    return null;
}

/**
 * Revokes an API key.
 */
export async function revokeApiKey(id: string, userId: string) {
    const [revokedKey] = await db.update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
        .returning();

    return revokedKey;
}

/**
 * Lists active API keys for a user.
 */
export async function listApiKeys(userId: string) {
    return db.query.apiKeys.findMany({
        where: and(
            eq(apiKeys.userId, userId),
            sql`${apiKeys.revokedAt} IS NULL`
        ),
        orderBy: (apiKeys, { desc }) => [desc(apiKeys.createdAt)],
    });
}

/**
 * Rotates an API key: Revokes the old one and issues a new one.
 */
export async function rotateApiKey(oldKeyId: string, userId: string) {
    // 1. Get the old key to copy metadata
    const oldKey = await db.query.apiKeys.findFirst({
        where: and(eq(apiKeys.id, oldKeyId), eq(apiKeys.userId, userId)),
    });

    if (!oldKey) {
        throw new Error("API key not found");
    }

    // 2. Revoke old key
    await revokeApiKey(oldKeyId, userId);

    // 3. Generate new key
    return generateApiKey(userId, oldKey.name, oldKey.rateLimit);
}
