ALTER TABLE "adventure_segments" ADD COLUMN "elevation_loss_m" real;--> statement-breakpoint
ALTER TABLE "adventure_stages" ADD COLUMN "elevation_loss_m" real;--> statement-breakpoint
ALTER TABLE "adventures" ADD COLUMN "total_elevation_loss_m" real;