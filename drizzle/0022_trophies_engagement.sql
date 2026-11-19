CREATE TABLE "engagement_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"action" text NOT NULL,
	"key" text,
	"grp" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_trophies" (
	"user_id" uuid NOT NULL,
	"trophy" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "user_trophies_user_id_trophy_pk" PRIMARY KEY("user_id","trophy")
);
--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trophies" ADD CONSTRAINT "user_trophies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_feature_idx" ON "engagement_events" USING btree ("feature","at");--> statement-breakpoint
CREATE INDEX "engagement_user_idx" ON "engagement_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "user_trophies_trophy_idx" ON "user_trophies" USING btree ("trophy");