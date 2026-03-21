ALTER TABLE "adventures" ADD COLUMN IF NOT EXISTS "total_elevation_gain_m" real;--> statement-breakpoint
ALTER TABLE "adventures" ADD COLUMN IF NOT EXISTS "density_progress" integer DEFAULT 0 NOT NULL;
