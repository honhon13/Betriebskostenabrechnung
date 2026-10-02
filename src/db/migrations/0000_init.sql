CREATE TYPE "public"."allocation_source" AS ENUM('unit_area', 'unit_persons', 'equal', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ocr_status" AS ENUM('none', 'pending', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('draft', 'released');--> statement-breakpoint
CREATE TABLE "allocation_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit_label" text DEFAULT '' NOT NULL,
	"source" "allocation_source" DEFAULT 'manual' NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_keys_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "allocation_values" (
	"period_id" integer NOT NULL,
	"key_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"value" numeric(14, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "allocation_values_period_id_key_id_unit_id_pk" PRIMARY KEY("period_id","key_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "billing_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "period_status" DEFAULT 'draft' NOT NULL,
	"released_at" timestamp with time zone,
	"released_by" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_periods_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "cost_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_allocation_key_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "cost_units" (
	"cost_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	CONSTRAINT "cost_units_cost_id_unit_id_pk" PRIMARY KEY("cost_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"cost_date" date,
	"supplier" text,
	"invoice_number" text,
	"allocation_key_id" integer NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"payment_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"purpose" text,
	"note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"cost_id" integer,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"document_date" date,
	"supplier" text,
	"invoice_number" text,
	"amount_cents" integer,
	"notes" text,
	"ocr_status" "ocr_status" DEFAULT 'none' NOT NULL,
	"ocr_result" jsonb,
	"ocr_processed_at" timestamp with time zone,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"area_sqm" numeric(8, 2),
	"persons" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" integer NOT NULL,
	"unit_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "allocation_values" ADD CONSTRAINT "allocation_values_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_values" ADD CONSTRAINT "allocation_values_key_id_allocation_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."allocation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_values" ADD CONSTRAINT "allocation_values_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_categories" ADD CONSTRAINT "cost_categories_default_allocation_key_id_allocation_keys_id_fk" FOREIGN KEY ("default_allocation_key_id") REFERENCES "public"."allocation_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_units" ADD CONSTRAINT "cost_units_cost_id_costs_id_fk" FOREIGN KEY ("cost_id") REFERENCES "public"."costs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_units" ADD CONSTRAINT "cost_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_category_id_cost_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cost_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_allocation_key_id_allocation_keys_id_fk" FOREIGN KEY ("allocation_key_id") REFERENCES "public"."allocation_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_cost_id_costs_id_fk" FOREIGN KEY ("cost_id") REFERENCES "public"."costs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "costs_period_idx" ON "costs" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "payments_period_unit_idx" ON "payments" USING btree ("period_id","unit_id");--> statement-breakpoint
CREATE INDEX "receipts_period_idx" ON "receipts" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "receipts_cost_idx" ON "receipts" USING btree ("cost_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_storage_key_idx" ON "receipts" USING btree ("storage_provider","storage_key");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");