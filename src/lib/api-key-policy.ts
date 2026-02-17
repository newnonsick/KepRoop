/**
 * Centralized API Key policy constants.
 * These values are enforced on the backend and displayed on the frontend.
 */

/** Maximum requests allowed per minute per API key */
export const RATE_LIMIT_PER_MINUTE = 60;

/** Maximum requests allowed per day per API key */
export const RATE_LIMIT_PER_DAY = 2_000;

/** Maximum number of active API keys a user can have */
export const MAX_API_KEYS_PER_USER = 3;
