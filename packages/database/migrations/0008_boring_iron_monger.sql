CREATE TABLE "feedbacks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"screen" text,
	"description" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_feedbacks_user_id" ON "feedbacks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_feedbacks_created_at" ON "feedbacks" USING btree ("created_at");