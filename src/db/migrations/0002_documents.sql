CREATE TYPE "public"."document_type" AS ENUM('invoice', 'payment_proof', 'contract', 'other');--> statement-breakpoint
CREATE TABLE "document_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"cost_id" integer,
	"payment_id" integer,
	CONSTRAINT "document_links_one_target" CHECK (num_nonnulls("document_links"."cost_id", "document_links"."payment_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"type" "document_type" DEFAULT 'invoice' NOT NULL,
	"description" text,
	"unit_id" integer,
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
	"ocr_status" "ocr_status" DEFAULT 'none' NOT NULL,
	"ocr_result" jsonb,
	"ocr_processed_at" timestamp with time zone,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_cost_id_costs_id_fk" FOREIGN KEY ("cost_id") REFERENCES "public"."costs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_links_document_cost_idx" ON "document_links" USING btree ("document_id","cost_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_links_document_payment_idx" ON "document_links" USING btree ("document_id","payment_id");--> statement-breakpoint
CREATE INDEX "document_links_cost_idx" ON "document_links" USING btree ("cost_id");--> statement-breakpoint
CREATE INDEX "document_links_payment_idx" ON "document_links" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "documents_period_idx" ON "documents" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "documents_unit_idx" ON "documents" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_idx" ON "documents" USING btree ("storage_provider","storage_key");