import { db } from "@/db";
import { activityLogs } from "@/db/schema";

type ActionType = typeof activityLogs.$inferInsert['action'];

interface LogActivityParams {
    userId: string | null;
    albumId: string;
    imageId?: string;
    folderId?: string;
    action: ActionType;
    metadata?: Record<string, unknown>;
}

/**
 * Log an activity to the database
 * Used for tracking uploads, deletions, folder operations, etc.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
    try {
        await db.insert(activityLogs).values({
            userId: params.userId,
            albumId: params.albumId,
            imageId: params.imageId,
            folderId: params.folderId,
            action: params.action,
            metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        });
    } catch (error) {
        // Log error but don't throw - activity logging should not break main operations
        console.error('Failed to log activity:', error);
    }
}

/**
 * Log multiple activities in a batch (for bulk operations)
 */
export async function logActivities(activities: LogActivityParams[]): Promise<void> {
    try {
        const values = activities.map(params => ({
            userId: params.userId,
            albumId: params.albumId,
            imageId: params.imageId,
            folderId: params.folderId,
            action: params.action,
            metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        }));

        await db.insert(activityLogs).values(values);
    } catch (error) {
        console.error('Failed to log activities:', error);
    }
}
