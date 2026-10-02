-- Die Tabelle "receipts" wird durch "documents" + "document_links" ersetzt (Migration 0002).
-- Sicherheitsnetz: Sollte doch schon ein Beleg existieren, bricht die Migration ab,
-- statt ihn stillschweigend zu löschen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "receipts") THEN
    RAISE EXCEPTION 'receipts enthält Daten – bitte vor der Migration nach documents übernehmen';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('received', 'pending', 'cancelled');--> statement-breakpoint
DROP TABLE "receipts" CASCADE;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "status" "payment_status" DEFAULT 'received' NOT NULL;--> statement-breakpoint
-- Die Rechte heißen jetzt document:* statt receipt:* – bestehende Rollen behalten ihren Umfang.
UPDATE "role_permissions" SET "permission" = replace("permission", 'receipt:', 'document:') WHERE "permission" LIKE 'receipt:%';
