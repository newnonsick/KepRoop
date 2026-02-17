DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'albums' AND column_name = 'cover_image_id') THEN
    ALTER TABLE "albums" ADD COLUMN "cover_image_id" uuid;
  END IF;
END $$;