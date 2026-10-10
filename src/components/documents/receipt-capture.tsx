"use client";

import { Camera, CircleCheck, CircleX, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { use, useEffect, useId, useRef, useState } from "react";

import { deleteDocumentAction } from "@/app/actions/documents";
import { FormLifecycleContext } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Checkbox, fileInputClass } from "@/components/ui/input";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/files";
import { formatFileSize } from "@/lib/format";
import { shrinkImage } from "@/lib/image-resize";
import { cn } from "@/lib/utils";
import type { DocumentDto, OcrFields, OcrOutcome } from "@/types/billing";

/** Ein Formularfeld, das sich aus dem erkannten Beleg füllen lässt. */
export interface ReceiptField {
  /** `name` des Eingabefelds im umgebenden Formular. */
  name: string;
  /** Beschriftung für die Rückmeldung „übernommen: …“. */
  label: string;
  /** Wert für das Feld – so, wie er im Eingabefeld steht – oder null, wenn nicht erkannt. */
  from: (fields: OcrFields) => string | null;
}

interface ReceiptCaptureProps {
  /** Der Eintrag hat bereits Belege – das Dateifeld heißt dann „Weiteren Beleg hochladen“. */
  more?: boolean;
  /** Formularfelder, in die erkannte Werte übernommen werden. */
  fields: ReceiptField[];
  /** OCR ist eingerichtet: Belege werden beim Hochladen ausgelesen, solange das Häkchen gesetzt ist. */
  ocr: boolean;
  /** `name` des Feldes mit dem Abrechnungsjahr, in dem der Beleg abgelegt wird. */
  periodField?: string;
  /** Wird aufgerufen, sobald erkannte Werte in Felder übernommen wurden. */
  onRecognized?: () => void;
  /**
   * Wird nach jedem ausgelesenen Beleg aufgerufen – die Felder sind dann schon gefüllt. Das
   * Formular übernimmt daraus, was über einfache Felder hinausgeht (Gutschrift, Kostenart), und
   * gibt zurück, was dazu beim Beleg stehen soll.
   */
  onOcr?: (outcome: OcrOutcome) => string[];
}

/** Antwort von POST /api/dokumente. */
interface UploadResponse {
  document: DocumentDto;
  ocr: OcrOutcome | null;
}

interface Receipt {
  key: number;
  /** ID des gespeicherten Dokuments – null, wenn der Upload gescheitert ist. */
  id: number | null;
  fileName: string;
  tone: "success" | "warning" | "danger";
  note: string;
}

const TONE = {
  success: { icon: CircleCheck, className: "text-success" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  danger: { icon: CircleX, className: "text-danger" },
};

/** Trägt den Wert ein, wenn das Feld noch leer ist – Eingetragenes überschreibt die OCR nie. */
function fillIfEmpty(form: HTMLFormElement, name: string, value: string | null): boolean {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false;
  if (!value || field.value.trim() !== "") return false;
  field.value = value;
  return true;
}

/**
 * Beleg-Upload am Anfang eines Formulars – aufgebaut wie der Dialog „Dokument hochladen“:
 * Liste des Hochgeladenen, „Beleg fotografieren“, Dateifeld, OCR-Häkchen. Die Datei wird sofort
 * als Dokument gespeichert und – wenn OCR eingerichtet und angehakt ist – ausgelesen; erkannte
 * Werte stehen danach in den noch leeren Formularfeldern und lassen sich vor dem Speichern prüfen
 * und korrigieren. Beim Speichern verknüpft das Formular die Belege über die versteckten Felder
 * `documentIds`.
 *
 * Wird das Formular ohne Speichern geschlossen, verschwinden die hier hochgeladenen Belege wieder.
 */
export function ReceiptCapture({
  more = false,
  fields,
  ocr,
  periodField = "periodId",
  onRecognized,
  onOcr,
}: ReceiptCaptureProps) {
  const lifecycle = use(FormLifecycleContext);
  const camera = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const ocrHint = useId();
  const [useOcr, setUseOcr] = useState(ocr);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const nextKey = useRef(0);

  // Was hier hochgeladen, aber nie mit einem gespeicherten Eintrag verknüpft wurde, räumt der
  // Baustein beim Schließen des Formulars wieder ab.
  const uploaded = useRef(new Set<number>());
  const saved = useRef(false);
  useEffect(() => lifecycle?.onSaved(() => (saved.current = true)), [lifecycle]);
  useEffect(() => {
    const ids = uploaded.current;
    return () => {
      if (saved.current) return;
      for (const id of ids) void deleteDocumentAction(id);
    };
  }, []);

  // Das Ergebnis steht oben im Formular – wer inzwischen weitergescrollt hat, sieht es sonst nicht.
  useEffect(() => {
    log.current?.scrollIntoView({ block: "nearest" });
  }, [progress, receipts.length]);

  async function upload(form: HTMLFormElement, selected: File): Promise<Omit<Receipt, "key">> {
    const failed = (note: string) => ({ id: null, fileName: selected.name, tone: "danger" as const, note });
    try {
      const file = await shrinkImage(selected, MAX_UPLOAD_BYTES);
      if (file.size > MAX_UPLOAD_BYTES) {
        return failed(`Nicht gespeichert: größer als ${formatFileSize(MAX_UPLOAD_BYTES)}.`);
      }
      const body = new FormData();
      body.set("file", file);
      body.set("type", "invoice");
      body.set("periodId", String(new FormData(form).get(periodField) ?? ""));
      if (useOcr) body.set("ocr", "on");

      const response = await fetch("/api/dokumente", { method: "POST", body });
      if (!response.ok) {
        const error = ((await response.json().catch(() => null)) as { error?: string } | null)?.error;
        return failed(`Nicht gespeichert: ${error ?? "Der Upload ist fehlgeschlagen."}`);
      }

      const result = (await response.json()) as UploadResponse;
      uploaded.current.add(result.document.id);
      const base = { id: result.document.id, fileName: result.document.fileName };
      if (!result.ocr) return { ...base, tone: "success", note: "Gespeichert." };
      if (result.ocr.status === "failed" || !result.ocr.fields) {
        // Der Beleg ist gespeichert – die Felder lassen sich von Hand ausfüllen.
        return {
          ...base,
          tone: "warning",
          note: `Gespeichert – OCR-Fehler: ${result.ocr.error ?? "nicht ausgelesen."} Bitte die Felder von Hand ausfüllen.`,
        };
      }

      const recognized = result.ocr.fields;
      const filled = fields.filter((field) => fillIfEmpty(form, field.name, field.from(recognized)));
      // Erst danach: das Formular sieht die gefüllten Felder und ergänzt Gutschrift und Kostenart.
      const evaluation = (onOcr?.(result.ocr) ?? []).join(" ");
      if (filled.length === 0) {
        return {
          ...base,
          tone: "warning",
          note:
            "Ausgelesen – nichts übernommen: keine Rechnungsdaten erkannt oder die Felder waren bereits ausgefüllt." +
            (evaluation ? ` ${evaluation}` : ""),
        };
      }
      onRecognized?.();
      return {
        ...base,
        tone: "success",
        note:
          `Ausgelesen – übernommen: ${filled.map((field) => field.label).join(", ")}.` +
          `${evaluation ? ` ${evaluation}` : ""} Bitte prüfen.`,
      };
    } catch {
      return failed("Nicht gespeichert: keine Verbindung zum Server.");
    }
  }

  async function capture(input: HTMLInputElement) {
    const form = input.form;
    const files = [...(input.files ?? [])];
    if (!form || files.length === 0) return;

    lifecycle?.setBusy(true);
    try {
      // Nacheinander: der erste Beleg füllt die Felder, weitere ergänzen nur noch Leeres.
      for (const [index, file] of files.entries()) {
        setProgress({ current: index + 1, total: files.length, fileName: file.name });
        const receipt = await upload(form, file);
        setReceipts((current) => [...current, { ...receipt, key: nextKey.current++ }]);
      }
    } finally {
      setProgress(null);
      lifecycle?.setBusy(false);
      // Dieselbe Datei soll sich nach dem Entfernen erneut wählen lassen.
      input.value = "";
    }
  }

  async function remove(receipt: Receipt) {
    if (receipt.id !== null) {
      // Erst löschen, dann aus der Liste nehmen: dieselbe Datei lässt sich danach sofort wieder wählen.
      setRemoving(true);
      lifecycle?.setBusy(true);
      try {
        await deleteDocumentAction(receipt.id);
        uploaded.current.delete(receipt.id);
      } finally {
        setRemoving(false);
        lifecycle?.setBusy(false);
      }
    }
    setReceipts((current) => current.filter((entry) => entry.key !== receipt.key));
  }

  const busy = progress !== null || removing;
  const stored = receipts.filter((receipt) => receipt.id !== null).length;
  const failed = receipts.length - stored;

  return (
    <div className="space-y-4">
      {receipts.length > 0 || progress ? (
        <div ref={log} className="rounded-lg border border-border">
          <p className="border-b border-border px-3 py-2 text-sm font-medium">
            {receipts.length === 0
              ? "Beleg wird hochgeladen …"
              : `${stored === 1 ? "1 Beleg" : `${stored} Belege`} hochgeladen` +
                (failed > 0 ? ` · ${failed} nicht gespeichert` : "")}
          </p>
          <ul className="max-h-60 divide-y divide-border overflow-y-auto text-sm">
            {receipts.map((receipt) => {
              const tone = TONE[receipt.tone];
              return (
                <li key={receipt.key} className="flex items-start gap-2 px-3 py-2">
                  <tone.icon className={cn("mt-0.5 size-4 shrink-0", tone.className)} aria-hidden />
                  <span className="min-w-0 flex-1" role={receipt.tone === "danger" ? "alert" : "status"}>
                    <span className="block font-medium wrap-anywhere">{receipt.fileName}</span>
                    <span className="block text-muted">{receipt.note}</span>
                  </span>
                  {receipt.id === null ? null : (
                    <input type="hidden" name="documentIds" value={receipt.id} />
                  )}
                  <button
                    type="button"
                    aria-label={`${receipt.fileName} entfernen`}
                    title="Entfernen"
                    onClick={() => remove(receipt)}
                    disabled={busy}
                    className="disabled:opacity-50 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
            {progress ? (
              <li className="flex items-start gap-2 px-3 py-2" role="status">
                <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium wrap-anywhere">{progress.fileName}</span>
                  <span className="block text-muted">
                    {progress.total > 1
                      ? `Beleg ${progress.current} von ${progress.total} wird`
                      : "Wird"}{" "}
                    gespeichert{useOcr ? " und ausgelesen – das dauert einige Sekunden" : ""} …
                  </span>
                </span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* Nur auf Handy und Tablet sichtbar: Kamera öffnen, Foto wird sofort hochgeladen. */}
      <div className="camera-only w-full flex-col gap-1.5">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => camera.current?.click()}
          disabled={busy}
        >
          <Camera aria-hidden />
          Beleg fotografieren
        </Button>
        {/* capture: das Handy öffnet direkt die Kamera statt der Dateiauswahl. */}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={busy}
          onChange={(event) => capture(event.currentTarget)}
        />
        <p className="text-xs text-subtle">
          Das Foto wird sofort gespeichert
          {useOcr ? " und ausgelesen – danach kannst du die erkannten Daten prüfen" : ""}. Oder
          wähle unten eine Datei.
        </p>
      </div>

      {/* Ohne `name`: die Datei geht nicht mit dem Formular mit, sondern sofort an /api/dokumente. */}
      <Field
        label={more || stored > 0 ? "Weiteren Beleg hochladen" : "Beleg hochladen"}
        name="documentIds"
        optional
        hint={
          `PDF oder Foto (JPEG, PNG, WebP, HEIC, TIFF) bis ${formatFileSize(MAX_UPLOAD_BYTES)} je Datei – ` +
          "auch mehrere auf einmal. Größere Fotos werden automatisch verkleinert. Jede Datei wird sofort " +
          `als Rechnung gespeichert${useOcr ? " und ausgelesen" : ""} und beim Speichern mit dem Eintrag verknüpft.`
        }
      >
        <input
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          className={fileInputClass}
          disabled={busy}
          onChange={(event) => capture(event.currentTarget)}
        />
      </Field>

      {ocr ? (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm">
          {/* Der Erklärtext steht außerhalb des Labels, damit das Kästchen kurz „OCR auslesen“ heißt. */}
          <label className="flex items-center gap-2 font-medium">
            <Checkbox
              checked={useOcr}
              onChange={(event) => setUseOcr(event.target.checked)}
              disabled={busy}
              aria-describedby={ocrHint}
            />
            Automatisch per OCR auslesen
          </label>
          <p id={ocrHint} className="mt-1 pl-6 text-xs text-muted">
            Rechnungssteller, Rechnungsnummer, Datum, Leistungszeitraum, Beträge und Beschreibung
            werden erkannt und in leere Felder übernommen; Gutschriften und die passende Kostenart
            werden nach Möglichkeit automatisch zugeordnet. Die Datei wird dazu an Azure Document
            Intelligence übertragen.
          </p>
        </div>
      ) : null}
    </div>
  );
}
