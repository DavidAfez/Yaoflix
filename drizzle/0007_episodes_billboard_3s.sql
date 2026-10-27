ALTER TABLE "users" ALTER COLUMN "billboard_ms" SET DEFAULT 3000;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "episodes" integer;--> statement-breakpoint
UPDATE "users" SET "billboard_ms" = 3000 WHERE "billboard_ms" = 1500;