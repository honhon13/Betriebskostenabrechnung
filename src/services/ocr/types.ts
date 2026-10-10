import type { OcrFields } from "@/types/billing";

export interface OcrDocument {
  bytes: Buffer;
  mimeType: string;
}

/** Ein vom Anbieter erkanntes Feld im Original – für Nachvollziehbarkeit mitgespeichert. */
export interface OcrRawField {
  content: string | null;
  confidence: number | null;
}

export interface OcrResult {
  /** Anbieterunabhängige Felder, die in die Formularfelder übernommen werden. */
  fields: OcrFields;
  provider: string;
  model: string;
  /** Alle vom Anbieter gelieferten Felder mit erkanntem Text und Sicherheit. */
  raw: Record<string, OcrRawField>;
  /**
   * Volltext des Dokuments in Lesereihenfolge. Dient nur der Auswertung (Rechnung oder
   * Gutschrift, Kostenart) und wird nicht mit dem Ergebnis gespeichert.
   */
  text?: string | null;
}

/**
 * Texterkennung für Dokumente. Ein weiterer Anbieter ist eine neue Klasse mit diesem
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

/** Fehler der Texterkennung mit einer Meldung, die dem Benutzer angezeigt werden darf. */
export class OcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrError";
  }
}
