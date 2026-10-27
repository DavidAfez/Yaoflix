CREATE TABLE "seen" (
	"user_id" uuid NOT NULL,
	"title_id" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seen_user_id_title_id_pk" PRIMARY KEY("user_id","title_id")
);
--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "audio_file" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "mime" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "text" text;--> statement-breakpoint
ALTER TABLE "seen" ADD CONSTRAINT "seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen" ADD CONSTRAINT "seen_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "seen" ("user_id", "title_id", "source") SELECT "user_id", "title_id", 'like' FROM "likes" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "seen" ("user_id", "title_id", "source") SELECT DISTINCT "user_id", "title_id", 'watch' FROM "watch_sessions" WHERE "completed" AND "user_id" IS NOT NULL ON CONFLICT DO NOTHING;
