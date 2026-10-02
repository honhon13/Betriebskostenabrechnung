ALTER TABLE "documents" ADD COLUMN "service_period_start" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "service_period_end" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "net_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tax_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ocr_error" text;