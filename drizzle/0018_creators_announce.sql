ALTER TABLE "media" ADD COLUMN "announce" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "creator_id" uuid;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "credits" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "creator" text;--> statement-breakpoint
ALTER TABLE "titles" ADD CONSTRAINT "titles_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;