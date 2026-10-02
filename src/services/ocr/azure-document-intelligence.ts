import "server-only";

import type { OcrFields } from "@/types/billing";

import { OcrError, type OcrDocument, type OCRService, type OcrResult } from "./types";

const DEFAULT_MODEL = "prebuilt-invoice";
const DEFAULT_API_VERSION = "2024-11-30";
const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS = 45_000;

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/heif",
  "image/heic",
]);

/** Ausschnitt der Azure-Antwort – nur die Felder, die hier gelesen werden. */
interface AzureField {
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  valueCurrency?: { amount?: number; currencyCode?: string };
}

interface AzureAnalyzeOperation {
  status?: "notStarted" | "running" | "succeeded" | "failed";
  error?: { message?: string };
  analyzeResult?: { documents?: { fields?: Record<string, AzureField | undefined> }[] };
}

/**
 * Azure Document Intelligence (Modell „prebuilt-invoice“) über die REST-API.
 * Konfiguration ausschließlich über Umgebungsvariablen:
 *   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT, AZURE_DOCUMENT_INTELLIGENCE_KEY,
 *   optional AZURE_DOCUMENT_INTELLIGENCE_MODEL und AZURE_DOCUMENT_INTELLIGENCE_API_VERSION.
 */
export class AzureDocumentIntelligenceOcrService implements OCRService {
  readonly provider = "azure-document-intelligence";

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
    if (!this.isConfigured()) throw new OcrError("OCR ist nicht konfiguriert.");
    if (!this.supports(document.mimeType)) {
      throw new OcrError("Dieses Dateiformat kann nicht per OCR ausgelesen werden.");
    }

    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const operationUrl = await this.startAnalysis(document, signal);
    const operation = await this.waitForResult(operationUrl, signal);

    return {
      provider: this.provider,
      model: this.model,
      fields: mapInvoiceFields(operation.analyzeResult?.documents?.[0]?.fields ?? {}),
    };
  }

  private async startAnalysis(document: OcrDocument, signal: AbortSignal): Promise<string> {
    const url =
      `${this.endpoint}/documentintelligence/documentModels/${encodeURIComponent(this.model)}:analyze` +
      `?api-version=${encodeURIComponent(this.apiVersion)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Content-Type": document.mimeType,
      },
      body: new Uint8Array(document.bytes),
      signal,
    }).catch((error) => {
      throw new OcrError(`OCR-Dienst nicht erreichbar: ${describe(error)}`);
    });

    const operationUrl = response.headers.get("operation-location");
    if (response.status !== 202 || !operationUrl) {
      throw new OcrError(`OCR-Dienst antwortet mit ${response.status}: ${await readError(response)}`);
    }
    return operationUrl;
  }

  /** Die Analyse läuft asynchron – das Ergebnis wird über die Operation-URL abgeholt. */
  private async waitForResult(operationUrl: string, signal: AbortSignal) {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await fetch(operationUrl, {
        headers: { "Ocp-Apim-Subscription-Key": this.apiKey },
        signal,
      }).catch((error) => {
        throw new OcrError(
          signal.aborted ? "Die OCR-Auswertung hat zu lange gedauert." : describe(error),
        );
      });
      if (!response.ok) {
        throw new OcrError(`OCR-Dienst antwortet mit ${response.status}: ${await readError(response)}`);
      }

      const operation = (await response.json()) as AzureAnalyzeOperation;
      if (operation.status === "succeeded") return operation;
      if (operation.status === "failed") {
        throw new OcrError(operation.error?.message ?? "Die OCR-Auswertung ist fehlgeschlagen.");
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

/** Übersetzt die Felder des Rechnungsmodells in das anbieterneutrale Format. */
export function mapInvoiceFields(fields: Record<string, AzureField | undefined>): OcrFields {
  const date = fields.InvoiceDate;
  const number = fields.InvoiceId;
  const vendor = fields.VendorName;
  // Nicht jede Rechnung weist einen Gesamtbetrag aus – dann den fälligen Betrag nehmen.
  const total = fields.InvoiceTotal?.valueCurrency?.amount !== undefined
    ? fields.InvoiceTotal
    : fields.AmountDue;

  const amount = total?.valueCurrency?.amount;
  const used = [date, number, vendor, total].filter(
    (field): field is AzureField => typeof field?.confidence === "number",
  );

  return {
    documentDate: /^\d{4}-\d{2}-\d{2}$/.test(date?.valueDate ?? "") ? date!.valueDate! : null,
    invoiceNumber: (number?.valueString ?? number?.content)?.trim() || null,
    supplier: (vendor?.valueString ?? vendor?.content)?.replace(/\s+/g, " ").trim() || null,
    amountCents: typeof amount === "number" ? Math.round(amount * 100) : null,
    currency: total?.valueCurrency?.currencyCode ?? null,
    confidence:
      used.length > 0 ? used.reduce((acc, f) => acc + (f.confidence ?? 0), 0) / used.length : null,
  };
}
