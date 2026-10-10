-- Gutschriften und automatische Kostenart: rein additiv – bestehende Kosten, Einzahlungen und
-- Dokumente bleiben unverändert. Der neue Dokumenttyp wird in dieser Migration bewusst noch nicht
-- verwendet: ein mit ADD VALUE ergänzter Enum-Wert ist erst nach dem Commit nutzbar, und der
-- Migrator führt alle offenen Migrationen in einer Transaktion aus.
ALTER TYPE "public"."document_type" ADD VALUE 'credit_note' BEFORE 'payment_proof';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_cost_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cost_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category_id");