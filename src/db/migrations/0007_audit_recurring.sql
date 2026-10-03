CREATE TYPE "public"."recurring_amount_type" AS ENUM('fixed', 'variable');--> statement-breakpoint
CREATE TYPE "public"."recurring_interval" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" integer,
	"actor_name" text,
	"actor_unit" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"summary" text NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "recurring_cost_units" (
	"recurring_cost_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	CONSTRAINT "recurring_cost_units_recurring_cost_id_unit_id_pk" PRIMARY KEY("recurring_cost_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"description" text NOT NULL,
	"amount_type" "recurring_amount_type" DEFAULT 'fixed' NOT NULL,
	"amount_cents" integer,
	"interval" "recurring_interval" NOT NULL,
	"supplier" text,
	"allocation_key_id" integer NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "recurring_cost_id" integer;--> statement-breakpoint
ALTER TABLE "recurring_cost_units" ADD CONSTRAINT "recurring_cost_units_recurring_cost_id_recurring_costs_id_fk" FOREIGN KEY ("recurring_cost_id") REFERENCES "public"."recurring_costs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_cost_units" ADD CONSTRAINT "recurring_cost_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_category_id_cost_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cost_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_allocation_key_id_allocation_keys_id_fk" FOREIGN KEY ("allocation_key_id") REFERENCES "public"."allocation_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_occurred_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_recurring_cost_id_recurring_costs_id_fk" FOREIGN KEY ("recurring_cost_id") REFERENCES "public"."recurring_costs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "costs_recurring_idx" ON "costs" USING btree ("recurring_cost_id");--> statement-breakpoint
-- Das Audit-Log wird nur angehängt. Ändern, Löschen und Leeren scheitern auch dann, wenn
-- jemand an der Anwendung vorbei auf die Tabelle zugreift.
CREATE FUNCTION "audit_log_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log ist unveränderlich (% nicht erlaubt)', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "audit_log_no_change" BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW EXECUTE FUNCTION "audit_log_immutable"();--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log"
FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_immutable"();--> statement-breakpoint
-- Neue Rechte für die bestehenden Systemrollen: Vorlagen sehen und verwenden dürfen alle,
-- anlegen, ändern, löschen und das Audit-Log einsehen nur ADMIN.
-- (Der Seed läuft beim Deployment nicht – daher hier.)
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'recurring:read' FROM "roles" r WHERE r."key" IN ('USER', 'ADMIN')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES ('recurring:write'), ('recurring:delete'), ('audit:read')) AS p("permission")
WHERE r."key" = 'ADMIN'
ON CONFLICT DO NOTHING;
