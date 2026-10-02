import type { OcrFields } from "@/types/billing";

export interface OcrDocument {
  bytes: Buffer;
  mimeType: string;
}

export interface OcrResult {
  /** Anbieterunabhängige Felder: Datum, Rechnungsnummer, Lieferant, Betrag. */
  fields: OcrFields;
  provider: string;
  model: string;
}

/**
 * Texterkennung für Belege. Ein weiterer Anbieter ist eine neue Klasse mit diesem
 * Interface plus ein Eintrag in src/services/ocr/index.ts.
 */
export interface OCRService {
  readonly provider: string;
  /** false, solange Zugangsdaten fehlen – die Oberfläche blendet OCR dann aus. */
  isConfigured(): boolean;
  /** MIME-Typen, die der Anbieter verarbeiten kann. */
  supports(mimeType: string): boolean;
  analyzeInvoice(document: OcrDocument): Promise<OcrResult>;
}

export class OcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrError";
  }
}
