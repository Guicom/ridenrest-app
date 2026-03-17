CREATE TYPE "public"."density_status" AS ENUM('idle', 'pending', 'processing', 'success', 'error');--> statement-breakpoint
ALTER TABLE "adventure_segments" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "adventures" ADD COLUMN "density_status" "density_status" DEFAULT 'idle' NOT NULL;