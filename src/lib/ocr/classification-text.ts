import type { OcrClassification } from "@/types/billing";

/** Eine sicher erkannte Gutschrift – nur dann stellt die OCR Dokumenttyp und Vorzeichen um. */
export function isCreditNoteDetected(classification: OcrClassification | null | undefined): boolean {
  return classification?.documentType === "credit_note" && classification.documentTypeCertain;
}

/**
 * Was die Auswertung zur Belegart sagt: eine erkannte Gutschrift oder ein Hinweis darauf.
 * Für eine gewöhnliche Rechnung gibt es nichts zu melden (null).
 */
export function documentTypeNote(classification: OcrClassification): string | null {
  const signals = classification.documentTypeSignals.join(", ");
  if (isCreditNoteDetected(classification)) return `Als Gutschrift erkannt (${signals}).`;
  if (classification.documentType === "invoice" && !classification.documentTypeCertain && signals) {
    return `Hinweis auf eine Gutschrift (${signals}) – bitte den Dokumenttyp prüfen.`;
  }
  return null;
}

/**
 * Was die Auswertung zur Kostenart sagt. `assigned`: die Kostenart wurde tatsächlich gesetzt –
 * sonst ist es nur ein Vorschlag (z. B. weil schon eine eingetragen war).
 */
export function categoryNote(classification: OcrClassification, assigned: boolean): string {
  const { category } = classification;
  if (category && classification.categoryCertain) {
    const lead = assigned ? "Kostenart automatisch zugeordnet" : "Vorgeschlagene Kostenart";
    return `${lead}: ${category.categoryName} – ${category.reason}.`;
  }
  if (category) {
    const candidates = [category, ...classification.alternatives].map((c) => c.categoryName);
    return `Keine sichere Kostenart – möglich: ${candidates.join(", ")}.`;
  }
  return "Keine passende Kostenart erkannt.";
}
