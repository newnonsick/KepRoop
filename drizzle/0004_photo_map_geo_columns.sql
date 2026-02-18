-- Add numeric GPS columns for Photo Map feature
ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "gps_lat" double precision;
ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "gps_lng" double precision;

-- Backfill from existing DMS text columns (format: "degrees,minutes,seconds")
-- Converts "40,27,28.97" -> 40 + 27/60 + 28.97/3600 = 40.458047
UPDATE "images" 
SET 
    "gps_lat" = CASE
        WHEN "gps_latitude" ~ '^\-?[0-9]+\.?[0-9]*$' 
            THEN CAST("gps_latitude" AS double precision)
        WHEN "gps_latitude" ~ '^\-?[0-9]+\.?[0-9]*,[0-9]+\.?[0-9]*,[0-9]+\.?[0-9]*$'
            THEN (
                SPLIT_PART("gps_latitude", ',', 1)::double precision
                + SPLIT_PART("gps_latitude", ',', 2)::double precision / 60.0
                + SPLIT_PART("gps_latitude", ',', 3)::double precision / 3600.0
            )
        ELSE NULL
    END,
    "gps_lng" = CASE
        WHEN "gps_longitude" ~ '^\-?[0-9]+\.?[0-9]*$' 
            THEN CAST("gps_longitude" AS double precision)
        WHEN "gps_longitude" ~ '^\-?[0-9]+\.?[0-9]*,[0-9]+\.?[0-9]*,[0-9]+\.?[0-9]*$'
            THEN (
                SPLIT_PART("gps_longitude", ',', 1)::double precision
                + SPLIT_PART("gps_longitude", ',', 2)::double precision / 60.0
                + SPLIT_PART("gps_longitude", ',', 3)::double precision / 3600.0
            )
        ELSE NULL
    END
WHERE 
    "gps_latitude" IS NOT NULL 
    AND "gps_longitude" IS NOT NULL
    AND "gps_lat" IS NULL;

-- Composite index for Photo Map: Permission-First -> Space -> Time
CREATE INDEX IF NOT EXISTS "idx_images_album_geo_time" ON "images" ("album_id", "gps_lat", "gps_lng", "date_taken" DESC);

-- Composite index for fast user -> album membership lookup
CREATE INDEX IF NOT EXISTS "idx_album_members_user_album" ON "album_members" ("user_id", "album_id");