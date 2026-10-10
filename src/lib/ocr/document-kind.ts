import type { OcrFields, ReceiptType } from "@/types/billing";

/** Was die OCR über einen Beleg geliefert hat – unabhängig vom Anbieter. */
export interface DocumentKindInput {
  fields: OcrFields;
  /** Volltext des Dokuments in Lesereihenfolge, soweit der Anbieter ihn liefert. */
  text: string | null;
}

export interface DocumentKind {
  /** null = das Dokument sieht weder nach Rechnung noch nach Gutschrift aus. */
  documentType: ReceiptType | null;
  /** false = nur ein schwacher Hinweis auf eine Gutschrift – bitte von Hand prüfen. */
  certain: boolean;
  /** Woran die Belegart erkannt wurde. */
  signals: string[];
}

/** Bezeichnungen, unter denen eine Gutschrift ausgestellt wird. */
const CREDIT_TERMS: { pattern: RegExp; label: string }[] = [
  { pattern: /gutschrift/i, label: "Gutschrift" },
  { pattern: /rechnungskorrektur|korrekturrechnung/i, label: "Rechnungskorrektur" },
  { pattern: /storno-?rechnung|rechnungs-?storno/i, label: "Stornorechnung" },
  { pattern: /credit\s?(?:note|memo)/i, label: "Credit Note" },
];

/** Beginn der Positionstabelle – was davor steht, ist der Kopf des Belegs. */
const TABLE_HEADER = /^(?:pos\.?|position|menge|anzahl|bezeichnung|beschreibung|artikel|leistung|einzelpreis)\b/i;
const HEAD_LINES = 25;
const TITLE_MAX_LENGTH = 60;

/** Die Zeilen vor der Positionstabelle: dort steht der Titel des Belegs. */
function headOf(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const table = lines.findIndex((line) => TABLE_HEADER.test(line));
  return lines.slice(0, table === -1 ? HEAD_LINES : Math.min(table, HEAD_LINES));
}

/** Eine kurze Zeile, die mit dem Begriff beginnt – „Gutschrift Nr. 7“, nicht „abzüglich Gutschrift“. */
const startsWith = (line: string, pattern: RegExp) =>
  line.length <= TITLE_MAX_LENGTH && new RegExp(`^(?:${pattern.source})`, "i").test(line);

/**
 * Erkennt, ob ein ausgelesener Beleg eine Rechnung oder eine Gutschrift ist.
 *
 * Sicher ist eine Gutschrift bei einem negativen Gesamtbetrag oder wenn der Beleg im Kopf als
 * Gutschrift, Rechnungskorrektur oder Stornorechnung betitelt ist. Kommt der Begriff nur irgendwo
 * im Text vor (z. B. „abzüglich Gutschrift“ als Position einer Rechnung), bleibt es bei der
 * Rechnung – mit einem Hinweis zum Prüfen.
 */
export function detectDocumentKind({ fields, text }: DocumentKindInput): DocumentKind {
  const strong: string[] = [];
  const weak: string[] = [];

  if (fields.amountCents !== null && fields.amountCents < 0) strong.push("negativer Gesamtbetrag");

  const head = text ? headOf(text) : [];
  // „Rechnung“ als eigenes Wort – nicht „Rechnungskorrektur“ oder „Rechnungsnummer: …“.
  const invoiceTitle = head.some((line) => startsWith(line, /(?:rechnung|invoice|faktura)\b/));
  for (const term of CREDIT_TERMS) {
    if (head.some((line) => startsWith(line, term.pattern))) {
      // Trägt der Kopf beide Titel, entscheidet der Begriff allein nicht.
      (invoiceTitle ? weak : strong).push(`Titel „${term.label}“`);
    } else if (term.pattern.test(text ?? "") || term.pattern.test(fields.description ?? "")) {
      weak.push(`„${term.label}“ im Text`);
    }
  }

  if (strong.length > 0) return { documentType: "credit_note", certain: true, signals: strong };
  if (weak.length > 0) return { documentType: "invoice", certain: false, signals: weak };

  const hasInvoiceData =
    fields.amountCents !== null || fields.invoiceNumber !== null || fields.supplier !== null;
  return { documentType: hasInvoiceData ? "invoice" : null, certain: hasInvoiceData, signals: [] };
}

const negative = (cents: number | null) => (cents === null ? null : -Math.abs(cents) || 0);

/**
 * Beträge einer Gutschrift mit negativem Vorzeichen. Gutschriften weisen ihre Beträge je nach
 * Aussteller positiv („Gutschrift über € 50,00“) oder negativ aus – in der Anwendung ist eine
 * Gutschrift immer ein negativer Betrag.
 */
export function asCreditAmounts(fields: OcrFields): OcrFields {
  return {
    ...fields,
    netAmountCents: negative(fields.netAmountCents),
    taxAmountCents: negative(fields.taxAmountCents),
    amountCents: negative(fields.amountCents),
  };
}
