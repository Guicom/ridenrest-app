CREATE TABLE "adventure_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"adventure_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"order_index" integer NOT NULL,
	"start_km" real NOT NULL,
	"end_km" real NOT NULL,
	"distance_km" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adventure_stages" ADD CONSTRAINT "adventure_stages_adventure_id_adventures_id_fk" FOREIGN KEY ("adventure_id") REFERENCES "public"."adventures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_adventure_stages_adventure_id" ON "adventure_stages" USING btree ("adventure_id");--> statement-breakpoint
CREATE INDEX "idx_adventure_stages_order" ON "adventure_stages" USING btree ("adventure_id","order_index");