CREATE TYPE "public"."parse_status" AS ENUM('pending', 'processing', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."adventure_status" AS ENUM('planning', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."gap_severity" AS ENUM('low', 'medium', 'critical');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('EUR', 'USD', 'GBP');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('free', 'pro', 'team');--> statement-breakpoint
CREATE TYPE "public"."unit_pref" AS ENUM('km', 'mi');--> statement-breakpoint
CREATE TABLE "accommodations_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"segment_id" text NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"dist_from_trace_m" real NOT NULL,
	"dist_along_route_km" real NOT NULL,
	"raw_data" jsonb,
	"cached_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adventure_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"adventure_id" text NOT NULL,
	"name" text NOT NULL,
	"order_index" integer NOT NULL,
	"cumulative_start_km" real DEFAULT 0 NOT NULL,
	"distance_km" real DEFAULT 0 NOT NULL,
	"elevation_gain_m" real,
	"storage_url" text,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"geom" geometry(LINESTRING, 4326),
	"waypoints" jsonb,
	"bounding_box" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adventures" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"total_distance_km" real DEFAULT 0 NOT NULL,
	"status" "adventure_status" DEFAULT 'planning' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coverage_gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"segment_id" text NOT NULL,
	"from_km" real NOT NULL,
	"to_km" real NOT NULL,
	"gap_length_km" real NOT NULL,
	"severity" "gap_severity" NOT NULL,
	"analyzed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tier" "tier" DEFAULT 'free' NOT NULL,
	"unit_pref" "unit_pref" DEFAULT 'km' NOT NULL,
	"currency" "currency" DEFAULT 'EUR' NOT NULL,
	"strava_athlete_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_strava_athlete_id_unique" UNIQUE("strava_athlete_id")
);
--> statement-breakpoint
CREATE TABLE "weather_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"segment_id" text NOT NULL,
	"waypoint_km" real NOT NULL,
	"forecast_at" timestamp NOT NULL,
	"temperature_c" real,
	"precipitation_mm" real,
	"wind_speed_kmh" real,
	"wind_direction" real,
	"weather_code" text,
	"raw_data" jsonb,
	"cached_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accommodations_cache" ADD CONSTRAINT "accommodations_cache_segment_id_adventure_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."adventure_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventure_segments" ADD CONSTRAINT "adventure_segments_adventure_id_adventures_id_fk" FOREIGN KEY ("adventure_id") REFERENCES "public"."adventures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventures" ADD CONSTRAINT "adventures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_gaps" ADD CONSTRAINT "coverage_gaps_segment_id_adventure_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."adventure_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_cache" ADD CONSTRAINT "weather_cache_segment_id_adventure_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."adventure_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accommodations_cache_segment_id" ON "accommodations_cache" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "idx_accommodations_cache_expires_at" ON "accommodations_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_adventure_segments_adventure_id" ON "adventure_segments" USING btree ("adventure_id");--> statement-breakpoint
CREATE INDEX "idx_adventure_segments_order" ON "adventure_segments" USING btree ("adventure_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_coverage_gaps_segment_id" ON "coverage_gaps" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "idx_weather_cache_segment_km" ON "weather_cache" USING btree ("segment_id","waypoint_km");