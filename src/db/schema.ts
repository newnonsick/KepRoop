
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

// Folders Table - Folders within albums (inherits album permissions)
export const folders = pgTable("folders", {
    id: uuid("id").defaultRandom().primaryKey(),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    ...timestamps,
}, (table) => ({
    albumIdIdx: index("folders_album_id_idx").on(table.albumId),
}));

// Images Table
export const images = pgTable("images", {
    id: uuid("id").defaultRandom().primaryKey(),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "cascade" }).notNull(),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    uploaderId: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }),

    // Multi-variant S3 keys
    s3KeyOriginal: text("s3_key_original"),  // WebP lossless
    s3KeyDisplay: text("s3_key_display"),    // WebP q90  
    s3KeyThumb: text("s3_key_thumb"),        // WebP q70
    s3Key: text("s3_key"),  // Legacy field for backward compatibility

    mimeType: text("mime_type").notNull(),
    originalFilename: text("original_filename"),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),

    // EXIF data
    dateTaken: timestamp("date_taken"),
    cameraMake: text("camera_make"),
    cameraModel: text("camera_model"),
    gpsLatitude: text("gps_latitude"),
    gpsLongitude: text("gps_longitude"),

    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
}, (table) => ({
    albumIdIdx: index("images_album_id_idx").on(table.albumId),
    folderIdIdx: index("images_folder_id_idx").on(table.folderId),
    dateTakenIdx: index("images_date_taken_idx").on(table.dateTaken),
}));

// Activity Logs Table - Track actions (database only, no UI)
export const activityLogs = pgTable("activity_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "cascade" }),
    imageId: uuid("image_id"),
    folderId: uuid("folder_id"),
    action: text("action", {
        enum: [
            "image_upload", "image_delete", "image_restore", "image_permanent_delete", "image_update",
            "album_create", "album_update", "album_delete",
            "folder_create", "folder_update", "folder_delete",
            "member_join", "member_leave", "member_role_change"
        ]
    }).notNull(),
    metadata: text("metadata"),  // JSON string for additional data
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    albumIdIdx: index("activity_logs_album_id_idx").on(table.albumId),
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


// Relations

export const foldersRelations = relations(folders, ({ one, many }) => ({
    album: one(albums, {
        fields: [folders.albumId],
        references: [albums.id],
    }),
    images: many(images),
}));

export const imagesRelations = relations(images, ({ one }) => ({
    album: one(albums, {
        fields: [images.albumId],
        references: [albums.id],
    }),
    folder: one(folders, {
        fields: [images.folderId],
        references: [folders.id],
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

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
    user: one(users, {
        fields: [activityLogs.userId],
        references: [users.id],
    }),
    album: one(albums, {
        fields: [activityLogs.albumId],
        references: [albums.id],
    }),
}));

// Favorite Albums Table
export const favoriteAlbums = pgTable("favorite_albums", {
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "cascade" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.albumId] }),
}));

export const favoriteAlbumsRelations = relations(favoriteAlbums, ({ one }) => ({
    user: one(users, {
        fields: [favoriteAlbums.userId],
        references: [users.id],
    }),
    album: one(albums, {
        fields: [favoriteAlbums.albumId],
        references: [albums.id],
    }),
}));

// Relation updates
export const usersRelations = relations(users, ({ many }) => ({
    albums: many(albums),
    memberships: many(albumMembers),
    favorites: many(favoriteAlbums),
}));

export const albumsRelations = relations(albums, ({ one, many }) => ({
    owner: one(users, {
        fields: [albums.ownerId],
        references: [users.id],
    }),
    members: many(albumMembers),
    images: many(images),
    invites: many(albumInvites),
    folders: many(folders),
    favoritedBy: many(favoriteAlbums),
}));
