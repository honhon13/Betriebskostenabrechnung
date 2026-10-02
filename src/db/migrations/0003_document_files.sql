-- Dateien liegen ab jetzt in der Datenbank (document_files) statt in einem externen Speicher.
-- Sicherheitsnetz: Gäbe es schon Dokumente, lägen deren Dateien noch im alten Speicher und
-- würden mit den Verweis-Spalten unauffindbar – dann lieber abbrechen als Daten verlieren.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "documents") THEN
    RAISE EXCEPTION 'documents enthält Daten – Dateien bitte vor der Migration nach document_files übernehmen';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "document_files" (
	"document_id" integer PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
DROP INDEX "documents_storage_key_idx";--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "storage_provider";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "storage_key";