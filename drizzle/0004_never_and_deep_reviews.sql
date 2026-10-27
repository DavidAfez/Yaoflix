CREATE TABLE "deep_reviews" (
	"user_id" uuid NOT NULL,
	"title_id" integer NOT NULL,
	"scores" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deep_reviews_user_id_title_id_pk" PRIMARY KEY("user_id","title_id")
);
--> statement-breakpoint
CREATE TABLE "nevers" (
	"user_id" uuid NOT NULL,
	"title_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nevers_user_id_title_id_pk" PRIMARY KEY("user_id","title_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deep_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deep_reviews" ADD CONSTRAINT "deep_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_reviews" ADD CONSTRAINT "deep_reviews_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nevers" ADD CONSTRAINT "nevers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nevers" ADD CONSTRAINT "nevers_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deep_reviews_title_idx" ON "deep_reviews" USING btree ("title_id");--> statement-breakpoint
UPDATE "users" SET "deep_review" = true WHERE "role" = 'DEV';