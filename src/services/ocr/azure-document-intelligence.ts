import "server-only";

import type { OcrFields } from "@/types/billing";

import {
  OcrError,
  type OcrDocument,
  type OcrRawField,
  type OCRService,
  type OcrResult,
} from "./types";

const DEFAULT_MODEL = "prebuilt-invoice";
const DEFAULT_API_VERSION = "2024-11-30";
const TIMEOUT_MS = 50_000;
/** Für die Auswertung reicht der Anfang – Titel, Rechnungssteller und Positionen stehen vorne. */
const MAX_TEXT_LENGTH = 20_000;

/** Formate, die die vorgefertigten Modelle annehmen (kein WebP, keine Office-Dateien). */
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/heif",
  "image/heic",
]);

/** Ausschnitt der Azure-Antwort – nur die Teile, die hier gelesen werden. */
interface AzureField {
  type?: string;
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  valueCurrency?: { amount?: number; currencyCode?: string };
  valueArray?: AzureField[];
  valueObject?: Record<string, AzureField | undefined>;
}

interface AzureError {
  code?: string;
  message?: string;
  innererror?: AzureError;
}

interface AzureAnalyzeOperation {
  status?: "notStarted" | "running" | "succeeded" | "failed" | "canceled";
  error?: AzureError;
  analyzeResult?: {
    /** Erkannter Text des ganzen Dokuments, Zeilen durch Zeilenumbrüche getrennt. */
    content?: string;
    documents?: { fields?: Record<string, AzureField | undefined> }[];
  };
}

/**
 * Azure Document Intelligence (Modell „prebuilt-invoice“) über die REST-API v4.0.
 * Konfiguration ausschließlich über Umgebungsvariablen:
 *   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT, AZURE_DOCUMENT_INTELLIGENCE_KEY,
 *   optional AZURE_DOCUMENT_INTELLIGENCE_MODEL und AZURE_DOCUMENT_INTELLIGENCE_API_VERSION.
 */
export class AzureDocumentIntelligenceOcrService implements OCRService {
  readonly provider = "azure-document-intelligence";

  /** `pollIntervalMs` gibt es nur, damit Tests nicht sekundenlang warten müssen. */
  constructor(private readonly options: { pollIntervalMs?: number } = {}) {}

  private get endpoint() {
    return process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim().replace(/\/+$/, "") ?? "";
  }
  private get apiKey() {
    return process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim() ?? "";
  }
  private get model() {
    return process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL?.trim() || DEFAULT_MODEL;
  }
  private get apiVersion() {
    return process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION?.trim() || DEFAULT_API_VERSION;
  }

  isConfigured(): boolean {
    return Boolean(this.endpoint && this.apiKey);
  }

  supports(mimeType: string): boolean {
    return SUPPORTED_MIME_TYPES.has(mimeType);
  }

  async analyzeInvoice(document: OcrDocument): Promise<OcrResult> {
    if (!this.isConfigured()) throw new OcrError("OCR ist nicht eingerichtet.");
    if (!this.supports(document.mimeType)) {
      throw new OcrError("Dieses Dateiformat kann nicht per OCR ausgelesen werden.");
    }

    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const operationUrl = await this.startAnalysis(document, signal);
    const operation = await this.waitForResult(operationUrl, signal);
    const fields = operation.analyzeResult?.documents?.[0]?.fields ?? {};

    return {
      provider: this.provider,
      model: this.model,
      fields: mapInvoiceFields(fields),
      raw: mapRawFields(fields),
      text: operation.analyzeResult?.content?.slice(0, MAX_TEXT_LENGTH) || null,
    };
  }

  /** Schickt das Dokument zur Analyse und liefert die URL, unter der das Ergebnis abholbar ist. */
  private async startAnalysis(document: OcrDocument, signal: AbortSignal): Promise<string> {
    const url =
      `${this.endpoint}/documentintelligence/documentModels/${encodeURIComponent(this.model)}:analyze` +
      `?api-version=${encodeURIComponent(this.apiVersion)}`;

    const response = await this.request(
      url,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ base64Source: document.bytes.toString("base64") }),
      },
      signal,
    );

    const operationUrl = response.headers.get("operation-location");
    if (response.status !== 202 || !operationUrl) throw await toOcrError(response);
    return operationUrl;
  }

  /** Die Analyse läuft asynchron – das Ergebnis wird über die Operation-URL abgeholt. */
  private async waitForResult(operationUrl: string, signal: AbortSignal) {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, this.options.pollIntervalMs ?? 1000));

      const response = await this.request(
        operationUrl,
        { headers: { "Ocp-Apim-Subscription-Key": this.apiKey } },
        signal,
      );
      if (!response.ok) throw await toOcrError(response);

      const operation = (await response.json()) as AzureAnalyzeOperation;
      if (operation.status === "succeeded") return operation;
      if (operation.status === "failed" || operation.status === "canceled") {
        throw new OcrError(describeAzureError(operation.error, 0));
      }
    }
  }

  private async request(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal });
    } catch {
      throw new OcrError(
        signal.aborted
          ? "Die OCR-Auswertung hat zu lange gedauert. Bitte später erneut versuchen."
          : "Der OCR-Dienst ist nicht erreichbar. Bitte später erneut versuchen.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

async function toOcrError(response: Response): Promise<OcrError> {
  let error: AzureError | undefined;
  try {
    error = ((await response.json()) as { error?: AzureError }).error;
  } catch {
    // Antwort ohne JSON-Körper – dann entscheidet allein der Statuscode.
  }
  return new OcrError(describeAzureError(error, response.status));
}

/** Übersetzt Azure-Fehler in eine Meldung, mit der der Benutzer etwas anfangen kann. */
export function describeAzureError(error: AzureError | undefined, status: number): string {
  // Der konkrete Grund steckt meist im innersten Fehler.
  const codes: string[] = [];
  let detail = error?.message;
  for (let current = error; current; current = current.innererror) {
    if (current.code) codes.push(current.code);
    if (current.message) detail = current.message;
  }

  if (codes.some((code) => ["InvalidContent", "UnsupportedContent"].includes(code))) {
    return "Das Dokument ist nicht lesbar oder das Format wird nicht unterstützt (z. B. beschädigte oder passwortgeschützte Datei).";
  }
  if (codes.some((code) => ["InvalidContentLength", "InvalidContentDimensions"].includes(code))) {
    return "Das Dokument ist für die OCR zu groß oder hat unzulässige Abmessungen.";
  }
  if (status === 401 || status === 403) {
    return "Der OCR-Dienst lehnt die Zugangsdaten ab. Bitte Endpoint und Key prüfen.";
  }
  if (status === 404) {
    return "Der OCR-Dienst kennt das Modell oder den Endpoint nicht. Bitte die Konfiguration prüfen.";
  }
  if (status === 429) {
    return "Das OCR-Kontingent ist ausgeschöpft. Bitte später erneut versuchen.";
  }
  return detail
    ? `Die OCR-Auswertung ist fehlgeschlagen: ${detail}`
    : `Die OCR-Auswertung ist fehlgeschlagen${status ? ` (Status ${status})` : ""}.`;
}

// ---------------------------------------------------------------------------
// Feld-Zuordnung
// ---------------------------------------------------------------------------

const isIsoDate = (value: string | undefined): value is string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");

const text = (field: AzureField | undefined): string | null =>
  (field?.valueString ?? field?.content)?.replace(/\s+/g, " ").trim() || null;

/** Azure liefert den Steuersatz samt umgebendem Text („20 %:“, „MwSt. 20%“) – übrig bleibt „20 %“. */
const percent = (field: AzureField | undefined): string | null => {
  const value = text(field);
  const match = value?.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return match ? `${match[1]} %` : value;
};

const cents = (field: AzureField | undefined): number | null => {
  const amount = field?.valueCurrency?.amount;
  return typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : null;
};

/** Übersetzt die Felder des Rechnungsmodells in das anbieterneutrale Format. */
export function mapInvoiceFields(fields: Record<string, AzureField | undefined>): OcrFields {
  // Nicht jede Rechnung weist einen Gesamtbetrag aus – dann den fälligen Betrag nehmen.
  const total = cents(fields.InvoiceTotal) !== null ? fields.InvoiceTotal : fields.AmountDue;

  // Beschreibung = die ersten Rechnungspositionen, z. B. „Kehrung, Abgasmessung“.
  const items = (fields.Items?.valueArray ?? [])
    .map((item) => text(item.valueObject?.Description))
    .filter((value): value is string => value !== null);
  const description = items.slice(0, 3).join(", ").slice(0, 300) || null;

  const taxRate = percent(fields.TaxDetails?.valueArray?.[0]?.valueObject?.Rate);

  const used = [
    fields.InvoiceDate,
    fields.InvoiceId,
    fields.VendorName,
    total,
    fields.SubTotal,
    fields.TotalTax,
    fields.ServiceStartDate,
    fields.ServiceEndDate,
  ].filter((field): field is AzureField => typeof field?.confidence === "number");

  return {
    supplier: text(fields.VendorName) ?? text(fields.VendorAddressRecipient),
    invoiceNumber: text(fields.InvoiceId),
    documentDate: isIsoDate(fields.InvoiceDate?.valueDate) ? fields.InvoiceDate.valueDate : null,
    servicePeriodStart: isIsoDate(fields.ServiceStartDate?.valueDate)
      ? fields.ServiceStartDate.valueDate
      : null,
    servicePeriodEnd: isIsoDate(fields.ServiceEndDate?.valueDate)
      ? fields.ServiceEndDate.valueDate
      : null,
    netAmountCents: cents(fields.SubTotal),
    taxAmountCents: cents(fields.TotalTax),
    amountCents: cents(total),
    taxRate,
    description,
    currency: total?.valueCurrency?.currencyCode ?? null,
    confidence:
      used.length > 0 ? used.reduce((acc, f) => acc + (f.confidence ?? 0), 0) / used.length : null,
  };
}

/** Erkannter Text und Sicherheit je Azure-Feld – kompakt genug, um ihn mitzuspeichern. */
export function mapRawFields(fields: Record<string, AzureField | undefined>): Record<string, OcrRawField> {
  const raw: Record<string, OcrRawField> = {};
  for (const [name, field] of Object.entries(fields)) {
    if (!field) continue;
    raw[name] = {
      content: field.content?.slice(0, 500) ?? null,
      confidence: typeof field.confidence === "number" ? field.confidence : null,
    };
  }
  return raw;
}
