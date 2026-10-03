CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "billing_periods" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD COLUMN "review_status" "review_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD COLUMN "reviewed_by" integer;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD COLUMN "review_comment" text;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "review_status" "review_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "reviewed_by" integer;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "review_comment" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_status" "review_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reviewed_by" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_comment" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "review_status" "review_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reviewed_by" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "review_comment" text;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Neue Rechte für die bestehenden Systemrollen: USER darf Einträge zur Prüfung einreichen,
-- ADMIN zusätzlich prüfen. (Der Seed läuft beim Deployment nicht – daher hier.)
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES ('period:submit'), ('cost:submit'), ('payment:submit'), ('document:submit')) AS p("permission")
WHERE r."key" IN ('USER', 'ADMIN')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'review:manage' FROM "roles" r WHERE r."key" = 'ADMIN'
ON CONFLICT DO NOTHING;
