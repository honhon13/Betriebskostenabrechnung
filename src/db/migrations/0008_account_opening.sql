CREATE TABLE "account_opening_balances" (
	"unit_id" integer PRIMARY KEY NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"note" text,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_settings_singleton" CHECK ("account_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "account_opening_balances" ADD CONSTRAINT "account_opening_balances_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_opening_balances" ADD CONSTRAINT "account_opening_balances_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Neue Rechte für die bestehenden Systemrollen: das Abrechnungskonto sehen dürfen alle (USER nur
-- das der eigenen TOP), Stichtag und Anfangssalden festlegen nur ADMIN.
-- (Der Seed läuft beim Deployment nicht – daher hier.)
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'account:read' FROM "roles" r WHERE r."key" IN ('USER', 'ADMIN')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'account:manage' FROM "roles" r WHERE r."key" = 'ADMIN'
ON CONFLICT DO NOTHING;
