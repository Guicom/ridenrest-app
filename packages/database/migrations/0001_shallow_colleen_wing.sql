DROP INDEX "idx_accommodations_cache_segment_id";--> statement-breakpoint
CREATE INDEX "idx_accommodations_cache_segment_expires" ON "accommodations_cache" USING btree ("segment_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_accommodations_cache_segment_external_source" ON "accommodations_cache" USING btree ("segment_id","external_id","source");--> statement-breakpoint
CREATE INDEX "idx_adventures_user_id" ON "adventures" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_weather_cache_segment_km_forecast" ON "weather_cache" USING btree ("segment_id","waypoint_km","forecast_at");