CREATE TYPE "public"."insight_kind" AS ENUM('decision', 'action', 'deadline', 'risk', 'question', 'alert');--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"kind" "insight_kind" NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "insights_analyzed_until" timestamp;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;