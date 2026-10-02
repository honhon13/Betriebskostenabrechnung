"use client";

import { LoaderCircle, ScanText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type SubmitEvent } from "react";

import { updateDocumentAction } from "@/app/actions/documents";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, fileInputClass } from "@/components/ui/input";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/files";
import { formatFileSize } from "@/lib/format";
import { shrinkImage } from "@/lib/image-resize";
import type { DocumentDto, OcrOutcome } from "@/types/billing";

import { ActionForm } from "../forms/action-form";
import { Dialog } from "../forms/dialog";
import { FieldErrorsContext } from "../forms/field";
import { DocumentFields, type DocumentFormOptions } from "./document-fields";

interface DocumentUploadProps extends DocumentFormOptions {
  defaultPeriodId: number;
  lockPeriod?: boolean;
  /** OCR ist eingerichtet und der Benutzer darf sie nutzen. */
  ocrAvailable: boolean;
}

/** Antwort von POST /api/dokumente. */
interface UploadResponse {
  document: DocumentDto;
  ocr: OcrOutcome | null;
}

type Status = { tone: "success" | "danger"; message: string } | null;

/** Schaltfläche, die das Upload-Formular in einem Dialog öffnet. */
export function DocumentUploadDialog(props: DocumentUploadProps) {
  const [open, setOpen] = useState(false);
  // Nach einem Upload mit OCR: das gespeicherte Dokument zum Prüfen und Ergänzen.
  const [review, setReview] = useState<UploadResponse | null>(null);

  function close() {
    setOpen(false);
    setReview(null);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Upload aria-hidden />
        Dokument hochladen
      </Button>
      {open ? (
        <Dialog
          title={review ? "Erkannte Daten prüfen" : "Dokument hochladen"}
          description={
            review
              ? review.document.fileName
              : "Rechnungen, Zahlungsnachweise, Verträge und sonstige Unterlagen."
          }
          onClose={close}
        >
          {/* key: beim Wechsel zum Prüfschritt beginnt der Bereich wieder oben statt an der alten Scrollposition. */}
          <div key={review ? "review" : "upload"} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {review ? (
              <DocumentReview {...props} result={review} onDone={close} />
            ) : (
              <DocumentUpload {...props} onProcessed={setReview} />
            )}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

/** Upload-Formular für Dokumente. Die Datei geht per multipart an /api/dokumente. */
function DocumentUpload({
  onProcessed,
  ocrAvailable,
  ...fields
}: DocumentUploadProps & { onProcessed: (result: UploadResponse) => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const [useOcr, setUseOcr] = useState(ocrAvailable);
  // Nach erfolgreichem Upload ohne OCR entstehen die Felder neu (leer, mit Standardwerten) –
  // der Dialog bleibt offen, damit sich mehrere Dokumente nacheinander hochladen lassen.
  const [formKey, setFormKey] = useState(0);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selected = formData.get("file");

    if (!(selected instanceof File) || selected.size === 0) {
      setStatus({ tone: "danger", message: "Bitte eine Datei auswählen." });
      return;
    }

    startTransition(async () => {
      try {
        const file = await shrinkImage(selected, MAX_UPLOAD_BYTES);
        if (file.size > MAX_UPLOAD_BYTES) {
          setStatus({
            tone: "danger",
            message: `Die Datei ist größer als ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
          });
          return;
        }
        formData.set("file", file);

        const response = await fetch("/api/dokumente", { method: "POST", body: formData });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setStatus({
            tone: "danger",
            message: body?.error ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.",
          });
          return;
        }

        const result = (await response.json()) as UploadResponse;
        router.refresh();
        if (result.ocr) {
          // Die OCR ist gelaufen: erkannte Werte im Formular zeigen, prüfen und ergänzen lassen.
          onProcessed(result);
          return;
        }
        setFormKey((key) => key + 1);
        setStatus({ tone: "success", message: `„${selected.name}“ wurde hochgeladen.` });
      } catch {
        setStatus({ tone: "danger", message: "Keine Verbindung zum Server. Bitte erneut versuchen." });
      }
    });
  }

  return (
    <form key={formKey} onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Datei</span>
        <input type="file" name="file" accept={UPLOAD_ACCEPT} required className={fileInputClass} />
        <span className="block text-xs text-subtle">
          PDF oder Foto (JPEG, PNG, WebP, HEIC, TIFF) bis {formatFileSize(MAX_UPLOAD_BYTES)}. Größere
          Fotos werden automatisch verkleinert.
        </span>
      </label>

      {ocrAvailable ? (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm">
          {/* Der Erklärtext steht außerhalb des Labels, damit das Kästchen kurz „OCR auslesen“ heißt. */}
          <label className="flex items-center gap-2 font-medium">
            <Checkbox
              name="ocr"
              checked={useOcr}
              onChange={(event) => setUseOcr(event.target.checked)}
              aria-describedby="ocr-hint"
            />
            Automatisch per OCR auslesen
          </label>
          <p id="ocr-hint" className="mt-1 pl-6 text-xs text-muted">
            Rechnungssteller, Rechnungsnummer, Datum, Leistungszeitraum, Beträge und Beschreibung
            werden erkannt und in leere Felder übernommen. Die Datei wird dazu an Azure Document
            Intelligence übertragen.
          </p>
        </div>
      ) : null}

      {/* Feldfehler kommen hier nicht einzeln zurück – die Meldung steht unter dem Formular. */}
      <FieldErrorsContext value={{}}>
        <DocumentFields {...fields} />
      </FieldErrorsContext>

      {status ? <Alert tone={status.tone} title={status.message} /> : null}
      {pending && useOcr ? (
        <p className="text-right text-xs text-muted" role="status">
          Dokument wird gespeichert und ausgelesen – das dauert einige Sekunden.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : useOcr ? (
            <ScanText aria-hidden />
          ) : (
            <Upload aria-hidden />
          )}
          {useOcr ? "Hochladen und auslesen" : "Hochladen"}
        </Button>
      </div>
    </form>
  );
}

/** Was die OCR nach dem Upload ergeben hat – verarbeitet, nichts erkannt oder Fehler. */
function OcrSummary({ ocr }: { ocr: OcrOutcome }) {
  if (ocr.status === "failed") {
    return (
      <Alert tone="danger" title="OCR-Fehler">
        {ocr.error} Das Dokument ist gespeichert – die Felder kannst du von Hand ausfüllen.
      </Alert>
    );
  }
  if (ocr.filled.length === 0) {
    return (
      <Alert tone="warning" title="OCR verarbeitet – keine Daten übernommen">
        Im Dokument wurden keine Rechnungsdaten erkannt, oder die Felder waren bereits ausgefüllt.
        Leere Felder kannst du von Hand ergänzen.
      </Alert>
    );
  }
  return (
    <Alert tone="info" title={`OCR verarbeitet – ${ocr.filled.length} ${ocr.filled.length === 1 ? "Feld" : "Felder"} übernommen`}>
      {ocr.filled.join(", ")}. Bitte prüfen; nicht erkannte Felder bleiben leer und lassen sich
      ergänzen.
    </Alert>
  );
}

/**
 * Zweiter Schritt nach einem Upload mit OCR: das Dokument ist gespeichert, die erkannten
 * Werte stehen in den Formularfeldern und lassen sich prüfen, korrigieren und ergänzen.
 */
function DocumentReview({
  result,
  onDone,
  periods,
  costs,
  payments,
  units,
  lockPeriod,
}: DocumentUploadProps & { result: UploadResponse; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <Alert tone="success" title={`„${result.document.fileName}“ wurde hochgeladen.`} />
      {result.ocr ? <OcrSummary ocr={result.ocr} /> : null}
      <ActionForm
        action={updateDocumentAction.bind(null, result.document.id)}
        submitLabel="Speichern"
        onSuccess={onDone}
        onCancel={onDone}
        cancelLabel="Später ergänzen"
      >
        <DocumentFields
          periods={periods}
          costs={costs}
          payments={payments}
          units={units}
          lockPeriod={lockPeriod}
          defaultPeriodId={result.document.periodId}
          document={result.document}
        />
      </ActionForm>
    </div>
  );
}
