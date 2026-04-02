-- Consolidated migration: add columns that were created manually outside of drizzle-kit
-- and were never tracked in _journal.json. Uses IF NOT EXISTS to be idempotent.
-- Covers: 0009_add_start_date_adventures, 0010_add_end_date_adventures,
--         0011_add_density_analyzed_at, add_source_to_adventure_segments,
--         0008_add_overpass_enabled

ALTER TABLE "adventures" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement-breakpoint
ALTER TABLE "adventures" ADD COLUMN IF NOT EXISTS "end_date" date;
--> statement-breakpoint
ALTER TABLE "adventures" ADD COLUMN IF NOT EXISTS "density_analyzed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "adventure_segments" ADD COLUMN IF NOT EXISTS "source" text;
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "overpass_enabled" boolean DEFAULT false NOT NULL;
