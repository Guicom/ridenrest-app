CREATE TYPE "public"."routing_profile" AS ENUM('road', 'gravel', 'bikepacking');--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD COLUMN "access_origin_stage_id" text;--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD COLUMN "access_distance_m" real;--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD COLUMN "access_elevation_gain_m" real;--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD COLUMN "access_elevation_loss_m" real;--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD COLUMN "access_geometry" geometry(LINESTRING, 4326);--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD COLUMN "access_engine_version" text;--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD COLUMN "access_computed_at" timestamp;--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD COLUMN "access_failed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adventures" ADD COLUMN "routing_profile" "routing_profile" DEFAULT 'gravel' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "live_access_consent" boolean;--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD CONSTRAINT "accommodations_cache_access_origin_stage_id_adventure_stages_id_fk" FOREIGN KEY ("access_origin_stage_id") REFERENCES "public"."adventure_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accommodations_cache_access_stage" ON "accommodations_cache" USING btree ("access_origin_stage_id");--> statement-breakpoint
CREATE INDEX "idx_accommodations_cache_access_pending" ON "accommodations_cache" USING btree ("segment_id") WHERE access_computed_at IS NULL AND access_failed = false;