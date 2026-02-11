import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export class UserService {
    static async updateProfile(userId: string, data: { name: string }) {
        await db.update(users)
            .set({ name: data.name })
            .where(eq(users.id, userId));

        return { success: true, name: data.name };
    }

    static async updatePassword(userId: string, data: { currentPassword?: string, newPassword: string }) {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { passwordHash: true }
        });

        if (!user) {
            throw new Error("User not found");
        }

        // If user already has a password, verify current password
        if (user.passwordHash) {
            if (!data.currentPassword) {
                throw new Error("Current password is required");
            }
            const isValid = await verifyPassword(data.currentPassword, user.passwordHash);
            if (!isValid) {
                throw new Error("Incorrect current password");
            }
        }

        const hashedPassword = await hashPassword(data.newPassword);

        await db.update(users)
            .set({ passwordHash: hashedPassword })
            .where(eq(users.id, userId));

        return { success: true };
    }
}
