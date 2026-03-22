ALTER TABLE "adventures" ADD COLUMN IF NOT EXISTS "density_categories" text[] NOT NULL DEFAULT '{}';
