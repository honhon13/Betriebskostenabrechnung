"use client";

import { CircleCheck, CircleX, LoaderCircle, ScanText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type SubmitEvent } from "react";

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

export interface DocumentUploadProps extends DocumentFormOptions {
  defaultPeriodId: number;
  lockPeriod?: boolean;
  /** OCR ist eingerichtet und der Benutzer darf sie nutzen. */
  ocrAvailable: boolean;
  /** Einreichen durch Benutzer: andere Beschriftung, kein TOP-Feld, Hinweis auf die Prüfung. */
  submission?: boolean;
}

interface DocumentUploadDialogProps extends DocumentUploadProps {
  /** Wird beim Schließen aufgerufen – mit der Zahl der in diesem Dialog gespeicherten Dokumente. */
  onClose: (uploaded: number) => void;
}

/** Antwort von POST /api/dokumente. */
interface UploadResponse {
  document: DocumentDto;
  ocr: OcrOutcome | null;
}

/** Ergebnis je Datei – die Liste bleibt stehen, solange der Dialog offen ist. */
interface UploadEntry {
  fileName: string;
  ok: boolean;
  /** Fehlermeldung bzw. Hinweis zum gespeicherten Dokument. */
  note?: string;
}

/** Angaben, die zu genau einem Dokument gehören – bei mehreren Dateien füllt sie die OCR je Dokument. */
const SINGLE_DOCUMENT_FIELDS = [
  "supplier",
  "invoiceNumber",
  "documentDate",
  "servicePeriodStart",
  "servicePeriodEnd",
  "netAmount",
  "taxAmount",
  "amount",
];

/**
 * Upload-Dialog für Dokumente. Er bleibt nach jedem Upload offen, damit sich beliebig viele
 * Dokumente nacheinander – oder mehrere Dateien auf einmal – hochladen lassen.
 */
export function DocumentUploadDialog({ onClose, ...props }: DocumentUploadDialogProps) {
  // Nach einem Upload mit OCR: das gespeicherte Dokument zum Prüfen und Ergänzen.
  const [review, setReview] = useState<UploadResponse | null>(null);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const uploaded = entries.filter((entry) => entry.ok).length;
  const scroller = useRef<HTMLDivElement>(null);

  return (
    <Dialog
      title={
        review
          ? "Erkannte Daten prüfen"
          : props.submission
            ? "Dokument einreichen"
            : "Dokument hochladen"
      }
      description={
        review
          ? review.document.fileName
          : props.submission
            ? "Das Dokument zählt erst nach der Freigabe durch die Verwaltung."
            : "Rechnungen, Zahlungsnachweise, Verträge und sonstige Unterlagen."
      }
      onClose={() => onClose(uploaded)}
    >
      {/* key: beim Wechsel zum Prüfschritt beginnt der Bereich wieder oben statt an der alten Scrollposition. */}
      <div
        ref={scroller}
        key={review ? "review" : "upload"}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        {review ? (
          <DocumentReview {...props} result={review} onDone={() => setReview(null)} />
        ) : (
          <DocumentUpload
            {...props}
            entries={entries}
            onUploaded={(added) => {
              setEntries((current) => [...current, ...added]);
              // Das Ergebnis steht oben – ohne Zurückscrollen bliebe der Blick am Ende des Formulars.
              scroller.current?.scrollTo({ top: 0 });
            }}
            onProcessed={setReview}
            onFinish={() => onClose(uploaded)}
          />
        )}
      </div>
    </Dialog>
  );
}

/** Upload-Formular für Dokumente. Jede Datei geht als eigene multipart-Anfrage an /api/dokumente. */
function DocumentUpload({
  entries,
  onUploaded,
  onProcessed,
  onFinish,
  ocrAvailable,
  ...fields
}: DocumentUploadProps & {
  entries: UploadEntry[];
  onUploaded: (entries: UploadEntry[]) => void;
  onProcessed: (result: UploadResponse) => void;
  onFinish: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [useOcr, setUseOcr] = useState(ocrAvailable);
  // Ab zwei gewählten Dateien gelten die Angaben für alle; Rechnungsdaten gibt es dann je Dokument.
  const [selectedCount, setSelectedCount] = useState(0);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  // Nach einem Upload entstehen die Felder neu (leer, mit Standardwerten) – der Dialog bleibt
  // offen, damit sich beliebig viele Dokumente nacheinander hochladen lassen.
  const [formKey, setFormKey] = useState(0);
  const several = selectedCount > 1;

  /** Lädt eine Datei hoch. Fehler kommen als Text zurück, damit die übrigen Dateien weiterlaufen. */
  async function upload(base: FormData, selected: File): Promise<UploadResponse | string> {
    try {
      const file = await shrinkImage(selected, MAX_UPLOAD_BYTES);
      if (file.size > MAX_UPLOAD_BYTES) {
        return `Die Datei ist größer als ${formatFileSize(MAX_UPLOAD_BYTES)}.`;
      }
      const formData = new FormData();
      for (const [name, value] of base.entries()) {
        if (name !== "file") formData.append(name, value);
      }
      formData.set("file", file);

      const response = await fetch("/api/dokumente", { method: "POST", body: formData });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        return body?.error ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.";
      }
      return (await response.json()) as UploadResponse;
    } catch {
      return "Keine Verbindung zum Server. Bitte erneut versuchen.";
    }
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const files = formData
      .getAll("file")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (files.length === 0) {
      setError("Bitte eine Datei auswählen.");
      return;
    }
    setError(null);
    // Rechnungsnummer, Datum und Beträge gehören zu einem einzelnen Dokument.
    if (files.length > 1) {
      for (const name of SINGLE_DOCUMENT_FIELDS) formData.delete(name);
    }

    startTransition(async () => {
      const results: UploadEntry[] = [];
      let last: UploadResponse | null = null;
      // Nacheinander statt gleichzeitig: jede Datei ist eine eigene Anfrage mit eigener OCR.
      for (const [index, file] of files.entries()) {
        if (files.length > 1) setProgress({ current: index + 1, total: files.length });
        const result = await upload(formData, file);
        if (typeof result === "string") {
          results.push({ fileName: file.name, ok: false, note: result });
          continue;
        }
        last = result;
        results.push({
          fileName: result.document.fileName,
          ok: true,
          note:
            result.ocr?.status === "failed"
              ? `Gespeichert – OCR-Fehler: ${result.ocr.error ?? "nicht ausgelesen"}`
              : fields.submission
                ? "Eingereicht, wartet auf Prüfung"
                : undefined,
        });
      }
      setProgress(null);
      onUploaded(results);
      if (results.some((entry) => entry.ok)) router.refresh();

      // Scheitert ein einzelnes Dokument, bleiben die Eingaben für den nächsten Versuch stehen.
      if (files.length === 1 && !last) return;
      setFormKey((key) => key + 1);
      setSelectedCount(0);
      // Ein einzelnes, ausgelesenes Dokument: erkannte Werte zeigen, prüfen und ergänzen lassen.
      if (files.length === 1 && last?.ocr) onProcessed(last);
    });
  }

  return (
    <form key={formKey} onSubmit={handleSubmit} className="space-y-4">
      {entries.length > 0 ? <UploadLog entries={entries} submission={fields.submission} /> : null}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          {entries.length > 0 ? "Weitere Dateien" : "Dateien"}
        </span>
        <input
          type="file"
          name="file"
          accept={UPLOAD_ACCEPT}
          multiple
          required
          className={fileInputClass}
          onChange={(event) => setSelectedCount(event.target.files?.length ?? 0)}
        />
        <span className="block text-xs text-subtle">
          PDF oder Foto (JPEG, PNG, WebP, HEIC, TIFF) bis {formatFileSize(MAX_UPLOAD_BYTES)} je
          Datei – auch mehrere auf einmal. Größere Fotos werden automatisch verkleinert.
        </span>
      </label>

      {several ? (
        <Alert tone="info" title={`${selectedCount} Dateien gewählt`}>
          Typ, Abrechnungsjahr und Verknüpfungen gelten für alle Dateien. Rechnungsdaten
          {useOcr ? " erkennt die OCR je Dokument; du kannst sie" : " kannst du"} danach in der
          Liste ergänzen.
        </Alert>
      ) : null}

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
        <DocumentFields {...fields} hideInvoiceData={several} />
      </FieldErrorsContext>

      {error ? <Alert tone="danger" title={error} /> : null}
      {pending ? (
        <p className="text-right text-xs text-muted" role="status">
          {progress
            ? `Dokument ${progress.current} von ${progress.total} wird gespeichert${useOcr ? " und ausgelesen" : ""} …`
            : useOcr
              ? "Dokument wird gespeichert und ausgelesen – das dauert einige Sekunden."
              : "Dokument wird gespeichert …"}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onFinish} disabled={pending}>
          {entries.length > 0 ? "Fertig" : "Abbrechen"}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : useOcr ? (
            <ScanText aria-hidden />
          ) : (
            <Upload aria-hidden />
          )}
          {several ? `${selectedCount} Dokumente hochladen` : "Hochladen"}
          {useOcr ? " und auslesen" : ""}
        </Button>
      </div>
    </form>
  );
}

/** Was in diesem Dialog bereits hochgeladen wurde – und was nicht geklappt hat. */
function UploadLog({ entries, submission }: { entries: UploadEntry[]; submission?: boolean }) {
  const saved = entries.filter((entry) => entry.ok).length;
  const failed = entries.length - saved;
  const verb = submission ? "eingereicht" : "hochgeladen";

  return (
    <div className="rounded-lg border border-border" role="status">
      <p className="border-b border-border px-3 py-2 text-sm font-medium">
        {saved === 1 ? `1 Dokument ${verb}` : `${saved} Dokumente ${verb}`}
        {failed > 0 ? ` · ${failed} nicht gespeichert` : ""}
      </p>
      <ul className="max-h-40 divide-y divide-border overflow-y-auto text-sm">
        {entries.map((entry, index) => (
          <li key={index} className="flex items-start gap-2 px-3 py-2">
            {entry.ok ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="block font-medium wrap-anywhere">
                <span className="sr-only">{entry.ok ? "Gespeichert: " : "Nicht gespeichert: "}</span>
                {entry.fileName}
              </span>
              {entry.note ? <span className="block text-muted">{entry.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
 * Danach geht es zurück zum Upload – für das nächste Dokument.
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
