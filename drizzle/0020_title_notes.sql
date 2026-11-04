CREATE TABLE "title_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title_id" integer NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"artist" text,
	"at_sec" integer,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "title_notes" ADD CONSTRAINT "title_notes_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_notes" ADD CONSTRAINT "title_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "title_notes_title_idx" ON "title_notes" USING btree ("title_id","kind");