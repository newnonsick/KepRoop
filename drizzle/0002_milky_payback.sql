DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_logs') THEN
    CREATE TABLE "activity_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid,
      "album_id" uuid,
      "image_id" uuid,
      "folder_id" uuid,
      "action" text NOT NULL,
      "metadata" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_key_logs') THEN
    CREATE TABLE "api_key_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "key_id" uuid NOT NULL,
      "endpoint" text NOT NULL,
      "method" text NOT NULL,
      "ip" text,
      "user_agent" text,
      "status_code" integer NOT NULL,
      "timestamp" timestamp DEFAULT now() NOT NULL
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys') THEN
    CREATE TABLE "api_keys" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "key_hash" text NOT NULL,
      "name" text NOT NULL,
      "prefix" text NOT NULL,
      "rate_limit" integer DEFAULT 1000 NOT NULL,
      "last_used_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "revoked_at" timestamp
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'favorite_albums') THEN
    CREATE TABLE "favorite_albums" (
      "user_id" uuid NOT NULL,
      "album_id" uuid NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "favorite_albums_user_id_album_id_pk" PRIMARY KEY("user_id","album_id")
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'folders') THEN
    CREATE TABLE "folders" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "album_id" uuid NOT NULL,
      "name" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      "deleted_at" timestamp
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits') THEN
    CREATE TABLE "rate_limits" (
      "key_id" uuid NOT NULL,
      "window_start" timestamp NOT NULL,
      "request_count" integer DEFAULT 0 NOT NULL,
      CONSTRAINT "rate_limits_key_id_window_start_pk" PRIMARY KEY("key_id","window_start")
    );
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "images" ALTER COLUMN "s3_key" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'albums' AND column_name = 'album_date') THEN ALTER TABLE "albums" ADD COLUMN "album_date" timestamp DEFAULT now() NOT NULL; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'folder_id') THEN ALTER TABLE "images" ADD COLUMN "folder_id" uuid; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 's3_key_original') THEN ALTER TABLE "images" ADD COLUMN "s3_key_original" text; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 's3_key_display') THEN ALTER TABLE "images" ADD COLUMN "s3_key_display" text; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 's3_key_thumb') THEN ALTER TABLE "images" ADD COLUMN "s3_key_thumb" text; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'original_filename') THEN ALTER TABLE "images" ADD COLUMN "original_filename" text; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'date_taken') THEN ALTER TABLE "images" ADD COLUMN "date_taken" timestamp; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'camera_make') THEN ALTER TABLE "images" ADD COLUMN "camera_make" text; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'camera_model') THEN ALTER TABLE "images" ADD COLUMN "camera_model" text; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'gps_latitude') THEN ALTER TABLE "images" ADD COLUMN "gps_latitude" text; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'gps_longitude') THEN ALTER TABLE "images" ADD COLUMN "gps_longitude" text; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'deleted_by') THEN ALTER TABLE "images" ADD COLUMN "deleted_by" uuid; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_user_id_users_id_fk') THEN ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_album_id_albums_id_fk') THEN ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_key_logs_key_id_api_keys_id_fk') THEN ALTER TABLE "api_key_logs" ADD CONSTRAINT "api_key_logs_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_user_id_users_id_fk') THEN ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorite_albums_user_id_users_id_fk') THEN ALTER TABLE "favorite_albums" ADD CONSTRAINT "favorite_albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorite_albums_album_id_albums_id_fk') THEN ALTER TABLE "favorite_albums" ADD CONSTRAINT "favorite_albums_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'folders_album_id_albums_id_fk') THEN ALTER TABLE "folders" ADD CONSTRAINT "folders_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limits_key_id_api_keys_id_fk') THEN ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_album_id_idx" ON "activity_logs" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_logs_key_id_idx" ON "api_key_logs" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_logs_timestamp_idx" ON "api_key_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folders_album_id_idx" ON "folders" USING btree ("album_id");--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'images_folder_id_folders_id_fk') THEN ALTER TABLE "images" ADD CONSTRAINT "images_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'images_deleted_by_users_id_fk') THEN ALTER TABLE "images" ADD CONSTRAINT "images_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "images_folder_id_idx" ON "images" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "images_date_taken_idx" ON "images" USING btree ("date_taken");