ALTER TABLE "costs" ADD COLUMN "service_period_start" date;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "service_period_end" date;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "net_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "tax_amount_cents" integer;