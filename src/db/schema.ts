
import { pgTable, uuid, text, timestamp, boolean, integer, index, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const timestamps = {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
};

// Users Table
export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").unique().notNull(),
    passwordHash: text("password_hash"), // Nullable for OAuth users
    googleId: text("google_id"),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    ...timestamps,
});

// Albums Table
export const albums = pgTable("albums", {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    visibility: text("visibility", { enum: ["public", "private"] }).default("private").notNull(),
    coverImageId: uuid("cover_image_id"),  // References images.id, but defined without FK to avoid circular ref issues
    albumDate: timestamp("album_date").defaultNow().notNull(),
    ...timestamps,
});

// Album Members Table
export const albumMembers = pgTable("album_members", {
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "cascade" }).notNull(),
    role: text("role", { enum: ["viewer", "editor", "owner"] }).default("viewer").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.albumId] }),
    userIdIdx: index("album_members_user_id_idx").on(table.userId),
    albumIdIdx: index("album_members_album_id_idx").on(table.albumId),
}));

// Album Invites Table
export const albumInvites = pgTable("album_invites", {
    id: uuid("id").defaultRandom().primaryKey(),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "cascade" }).notNull(),
    token: text("token").notNull(), // Hashed
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
    expiresAt: timestamp("expires_at"),
    maxUse: integer("max_use"),
    usedCount: integer("used_count").default(0).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    tokenIdx: index("album_invites_token_idx").on(table.token),
}));

// Images Table
export const images = pgTable("images", {
    id: uuid("id").defaultRandom().primaryKey(),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "cascade" }).notNull(),
    uploaderId: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }), // Keep metadata if user deleted? Or cascade? Using set null for now or cascade. Let's start with Set Null to keep history? User req said "Delete user account", usually cascades. But req said "uploader" metadata. Let's use Cascade for strict cleanups for now.
    s3Key: text("s3_key").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps, // details
}, (table) => ({
    albumIdIdx: index("images_album_id_idx").on(table.albumId),
}));

// Refresh Tokens Table
export const refreshTokens = pgTable("refresh_tokens", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revoked: boolean("revoked").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index("refresh_tokens_user_id_idx").on(table.userId),
}));


// Relations (Optional but good for query builder)
export const usersRelations = relations(users, ({ many }) => ({
    albums: many(albums), // Owned albums
    memberships: many(albumMembers),
}));

export const albumsRelations = relations(albums, ({ one, many }) => ({
    owner: one(users, {
        fields: [albums.ownerId],
        references: [users.id],
    }),
    members: many(albumMembers),
    images: many(images),
    invites: many(albumInvites),
}));

export const imagesRelations = relations(images, ({ one }) => ({
    album: one(albums, {
        fields: [images.albumId],
        references: [albums.id],
    }),
    uploader: one(users, {
        fields: [images.uploaderId],
        references: [users.id],
    }),
}));

export const albumMembersRelations = relations(albumMembers, ({ one }) => ({
    user: one(users, {
        fields: [albumMembers.userId],
        references: [users.id],
    }),
    album: one(albums, {
        fields: [albumMembers.albumId],
        references: [albums.id],
    }),
}));
