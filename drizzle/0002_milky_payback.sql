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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "favorite_albums" (
	"user_id" uuid NOT NULL,
	"album_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_albums_user_id_album_id_pk" PRIMARY KEY("user_id","album_id")
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key_id" uuid NOT NULL,
	"window_start" timestamp NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_id_window_start_pk" PRIMARY KEY("key_id","window_start")
);
--> statement-breakpoint
ALTER TABLE "images" ALTER COLUMN "s3_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "albums" ADD COLUMN "album_date" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "s3_key_original" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "s3_key_display" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "s3_key_thumb" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "date_taken" timestamp;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "camera_make" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "camera_model" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "gps_latitude" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "gps_longitude" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_logs" ADD CONSTRAINT "api_key_logs_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_albums" ADD CONSTRAINT "favorite_albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_albums" ADD CONSTRAINT "favorite_albums_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_album_id_idx" ON "activity_logs" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "api_key_logs_key_id_idx" ON "api_key_logs" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "api_key_logs_timestamp_idx" ON "api_key_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "folders_album_id_idx" ON "folders" USING btree ("album_id");--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_folder_id_idx" ON "images" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "images_date_taken_idx" ON "images" USING btree ("date_taken");