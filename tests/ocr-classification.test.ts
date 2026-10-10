import { describe, expect, it } from "vitest";

import {
  CATEGORY_AUTO_ASSIGN_CONFIDENCE,
  normalizeSupplier,
  suggestCategory,
  type CategoryHistoryEntry,
  type CategorySuggestionInput,
} from "@/lib/ocr/category-suggestion";
import {
  categoryNote,
  documentTypeNote,
  isCreditNoteDetected,
} from "@/lib/ocr/classification-text";
import { asCreditAmounts, detectDocumentKind } from "@/lib/ocr/document-kind";
import { receiptTypeOf } from "@/lib/labels";
import type { OcrClassification, OcrFields } from "@/types/billing";

const EMPTY: OcrFields = {
  supplier: null,
  invoiceNumber: null,
  documentDate: null,
  servicePeriodStart: null,
  servicePeriodEnd: null,
  netAmountCents: null,
  taxAmountCents: null,
  amountCents: null,
  taxRate: null,
  description: null,
  currency: null,
  confidence: null,
};
const fields = (values: Partial<OcrFields>): OcrFields => ({ ...EMPTY, ...values });

// ---------------------------------------------------------------------------
// Rechnung oder Gutschrift
// ---------------------------------------------------------------------------

describe("detectDocumentKind", () => {
  const invoice = fields({ supplier: "Rauchfangkehrer Muster GmbH", invoiceNumber: "RE-1", amountCents: 214_80 });

  it("erkennt eine gewöhnliche Rechnung", () => {
    const text = "Rauchfangkehrer Muster GmbH\nRechnung Nr. RE-1\nPos Bezeichnung Betrag\n1 Kehrung 214,80";
    expect(detectDocumentKind({ fields: invoice, text })).toEqual({
      documentType: "invoice",
      certain: true,
      signals: [],
    });
    // Auch ohne Volltext: Rechnungsdaten genügen.
    expect(detectDocumentKind({ fields: invoice, text: null }).documentType).toBe("invoice");
  });

  it("erkennt eine Gutschrift am Titel – auch wenn der Betrag positiv gedruckt ist", () => {
    const text = "Rauchfangkehrer Muster GmbH\nGutschrift Nr. GS-2026-0007\nzur Rechnung RE-2026-0042\nPos Bezeichnung Betrag\n1 Abgasmessung 60,00";
    expect(detectDocumentKind({ fields: fields({ ...invoice, amountCents: 60_00 }), text })).toEqual({
      documentType: "credit_note",
      certain: true,
      signals: ["Titel „Gutschrift“"],
    });
  });

  it.each([
    ["GUTSCHRIFT", "Gutschrift"],
    ["Gutschriftsanzeige 2026/17", "Gutschrift"],
    ["Rechnungskorrektur Nr. 12", "Rechnungskorrektur"],
    ["Korrekturrechnung KR-5", "Rechnungskorrektur"],
    ["Stornorechnung zu RE-88", "Stornorechnung"],
    ["Storno-Rechnung 2026-3", "Stornorechnung"],
    ["Credit Note CN-0042", "Credit Note"],
  ])("kennt die Bezeichnung „%s“", (title, label) => {
    const kind = detectDocumentKind({ fields: invoice, text: `Muster GmbH\n${title}\nBetrag 50,00` });
    expect(kind).toMatchObject({ documentType: "credit_note", certain: true });
    expect(kind.signals).toEqual([`Titel „${label}“`]);
  });

  it("erkennt eine Gutschrift am negativen Gesamtbetrag – auch ohne jedes Stichwort", () => {
    expect(detectDocumentKind({ fields: fields({ amountCents: -123_45 }), text: null })).toEqual({
      documentType: "credit_note",
      certain: true,
      signals: ["negativer Gesamtbetrag"],
    });
  });

  it("stellt bei einer bloßen Erwähnung nichts um, weist aber darauf hin", () => {
    // „Gutschrift“ als Position einer Rechnung – hinter dem Tabellenkopf.
    const text = "Muster GmbH\nRechnung Nr. 7\nPos Bezeichnung Betrag\n1 Wartung 300,00\nGutschrift Pfand -10,00\nSumme 290,00";
    expect(detectDocumentKind({ fields: invoice, text })).toEqual({
      documentType: "invoice",
      certain: false,
      signals: ["„Gutschrift“ im Text"],
    });
    // Mitten im Satz und in einer langen Zeile ist es ebenfalls kein Titel.
    const sentence = "Muster GmbH\nWir bestätigen die Gutschrift Ihrer Zahlung auf unserem Konto.";
    expect(detectDocumentKind({ fields: invoice, text: sentence })).toMatchObject({
      documentType: "invoice",
      certain: false,
    });
    // Nur in der Positionsbeschreibung (ohne Volltext).
    expect(
      detectDocumentKind({ fields: fields({ ...invoice, description: "Wartung, Gutschrift Pfand" }), text: null }),
    ).toMatchObject({ documentType: "invoice", certain: false });
  });

  it("entscheidet nicht allein nach dem Titel, wenn der Kopf auch „Rechnung“ trägt", () => {
    const text = "Muster GmbH\nRechnung\nGutschrift aus Vorjahr berücksichtigt\nBetrag 80,00";
    expect(detectDocumentKind({ fields: invoice, text })).toMatchObject({
      documentType: "invoice",
      certain: false,
      signals: ["Titel „Gutschrift“"],
    });
    // „Rechnungskorrektur“ und „Rechnungsnummer: …“ sind dagegen kein Rechnungstitel.
    const correction = "Muster GmbH\nRechnungskorrektur\nRechnungsnummer: RK-9\nBetrag 80,00";
    expect(detectDocumentKind({ fields: invoice, text: correction })).toMatchObject({
      documentType: "credit_note",
      certain: true,
    });
  });

  it("legt sich bei einem Dokument ohne Rechnungsdaten nicht fest", () => {
    expect(detectDocumentKind({ fields: EMPTY, text: "Sehr geehrte Damen und Herren, anbei der Vertrag." })).toEqual({
      documentType: null,
      certain: false,
      signals: [],
    });
  });
});

describe("asCreditAmounts", () => {
  it("führt die Beträge einer Gutschrift negativ – egal, wie sie gedruckt sind", () => {
    expect(asCreditAmounts(fields({ netAmountCents: 50_00, taxAmountCents: 10_00, amountCents: 60_00 }))).toMatchObject({
      netAmountCents: -50_00,
      taxAmountCents: -10_00,
      amountCents: -60_00,
    });
    expect(asCreditAmounts(fields({ netAmountCents: -50_00, taxAmountCents: 10_00, amountCents: -60_00 }))).toMatchObject({
      netAmountCents: -50_00,
      taxAmountCents: -10_00,
      amountCents: -60_00,
    });
  });

  it("lässt nicht Erkanntes leer und macht aus 0 kein -0", () => {
    const result = asCreditAmounts(fields({ taxAmountCents: 0, supplier: "Muster" }));
    expect(result.amountCents).toBeNull();
    expect(result.netAmountCents).toBeNull();
    expect(Object.is(result.taxAmountCents, 0)).toBe(true);
    expect(result.supplier).toBe("Muster");
  });

  it("der Beleg zu einem negativen Betrag ist eine Gutschrift, sonst eine Rechnung", () => {
    expect(receiptTypeOf(-1)).toBe("credit_note");
    expect(receiptTypeOf(100)).toBe("invoice");
  });
});

// ---------------------------------------------------------------------------
// Kostenart
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: 1, name: "Wasser / Abwasser", description: null },
  { id: 2, name: "Kanalgebühr", description: null },
  { id: 3, name: "Müllabfuhr", description: null },
  { id: 4, name: "Grundsteuer", description: null },
  { id: 5, name: "Gebäudeversicherung", description: null },
  { id: 6, name: "Rauchfangkehrer", description: null },
  { id: 7, name: "Allgemeinstrom", description: null },
  { id: 8, name: "Heizung", description: null },
  { id: 9, name: "Hausbetreuung / Reinigung", description: null },
  { id: 10, name: "Winterdienst", description: null },
  { id: 11, name: "Gartenpflege", description: null },
  { id: 12, name: "Wartung / Instandhaltung", description: null },
  { id: 13, name: "Verwaltung", description: null },
  { id: 14, name: "Sonstiges", description: null },
];

const suggest = (input: Partial<CategorySuggestionInput>) =>
  suggestCategory({
    supplier: null,
    description: null,
    text: null,
    categories: CATEGORIES,
    history: [],
    ...input,
  });

describe("suggestCategory: Stichwörter", () => {
  it("ordnet nach dem Rechnungssteller zu", () => {
    const result = suggest({ supplier: "Rauchfangkehrer Muster GmbH", description: "Kehrung, Abgasmessung" });
    expect(result.category).toMatchObject({ categoryId: 6, categoryName: "Rauchfangkehrer" });
    expect(result.certain).toBe(true);
    expect(result.category!.confidence).toBeGreaterThanOrEqual(CATEGORY_AUTO_ASSIGN_CONFIDENCE);
    expect(result.category!.reason).toBe("Stichwort „Rauchfangkehrer“ im Beleg");
  });

  it("ordnet nach der Beschreibung zu – auch über verwandte Begriffe und Umlaute hinweg", () => {
    // „Kehrung“ kommt im Namen der Kostenart nicht vor.
    expect(suggest({ supplier: "Huber KG", description: "Kehrung laut Kehrordnung" }).category?.categoryId).toBe(6);
    expect(suggest({ supplier: "Gemeinde", description: "MUELLGEBUEHR 2026" })).toMatchObject({
      category: { categoryId: 3 },
      certain: true,
    });
    expect(suggest({ supplier: "Gemeinde", description: "Kanalbenützungsgebühr" }).category?.categoryId).toBe(2);
    expect(suggest({ supplier: "Versicherung AG", description: "Jahresprämie Polizze 4711" }).category?.categoryId).toBe(5);
    expect(suggest({ supplier: "Grün & Blatt", description: "Heckenschnitt und Rasen mähen" }).category?.categoryId).toBe(11);
    expect(suggest({ supplier: "Hausservice", description: "Schneeräumung Dezember" }).category?.categoryId).toBe(10);
  });

  it("lässt die Auswahl offen, wenn nichts passt", () => {
    expect(suggest({ supplier: "Muster Handels GmbH", description: "Diverse Leistungen" })).toEqual({
      category: null,
      certain: false,
      alternatives: [],
    });
  });

  it("lässt die Auswahl offen, wenn zwei Kostenarten gleich gut passen – und nennt beide", () => {
    const result = suggest({ supplier: "Haustechnik Huber", description: "Wartung Heizung" });
    expect(result.certain).toBe(false);
    expect([result.category!, ...result.alternatives].map((c) => c.categoryId).sort()).toEqual([12, 8].sort());
    expect(result.category!.confidence).toBeLessThan(CATEGORY_AUTO_ASSIGN_CONFIDENCE);
  });

  it("vertraut einem Treffer irgendwo im Text nicht – etwa einem Straßennamen", () => {
    const result = suggest({
      supplier: "Muster Handels GmbH",
      description: "Lieferung",
      text: "Muster Handels GmbH\nGartenweg 5\n4020 Linz\nRechnung",
    });
    expect(result.certain).toBe(false);
    expect(result.category).toMatchObject({ categoryId: 11 });
  });

  it("schlägt den Sammelposten „Sonstiges“ nie aus Stichwörtern vor", () => {
    const result = suggest({ supplier: "Sonstiges & Allgemein GmbH", description: "Sonstige Kosten, diverse Gebühren" });
    expect(result.category).toBeNull();
  });

  it("nutzt Stichwörter aus der Beschreibung einer eigenen Kostenart", () => {
    const categories = [...CATEGORIES, { id: 20, name: "Gemeinschaftsanlage", description: "Photovoltaik, Wechselrichter" }];
    const result = suggest({ categories, supplier: "Sonnenkraft GmbH", description: "Wartung Wechselrichter" });
    // „Wartung“ spricht für die Instandhaltung, „Wechselrichter“ für die eigene Kostenart: offen.
    expect(result.certain).toBe(false);
    expect(
      suggest({ categories, supplier: "Sonnenkraft GmbH", description: "Tausch Wechselrichter" }),
    ).toMatchObject({ category: { categoryId: 20 }, certain: true });
  });

  it("bietet nur die übergebenen (aktiven) Kostenarten an", () => {
    const withoutChimney = CATEGORIES.filter((category) => category.id !== 6);
    expect(suggest({ categories: withoutChimney, supplier: "Rauchfangkehrer Muster GmbH" }).category).toBeNull();
    expect(suggest({ categories: [] , supplier: "Rauchfangkehrer Muster GmbH" }).category).toBeNull();
  });
});

describe("suggestCategory: bisherige Zuordnungen", () => {
  const history: CategoryHistoryEntry[] = [
    { supplier: "Muster Handels GmbH", categoryId: 13, count: 3 },
    { supplier: "Gemeinde Musterdorf", categoryId: 2, count: 2 },
    { supplier: "Gemeinde Musterdorf", categoryId: 3, count: 2 },
    { supplier: "Gemeinde Musterdorf", categoryId: 4, count: 2 },
    { supplier: "Installateur Huber", categoryId: 12, count: 1 },
  ];

  it("übernimmt die Kostenart, der ein Rechnungssteller bisher immer zugeordnet wurde", () => {
    const result = suggest({ history, supplier: "Muster Handels GmbH", description: "Diverse Leistungen" });
    expect(result).toMatchObject({ category: { categoryId: 13, confidence: 0.95 }, certain: true });
    expect(result.category!.reason).toBe("Rechnungssteller bisher 3× dieser Kostenart zugeordnet");
  });

  it("erkennt den Rechnungssteller trotz abweichender Schreibweise wieder", () => {
    expect(normalizeSupplier("MUSTER Handels Ges.m.b.H. & Co KG")).toBe("muster handels");
    expect(normalizeSupplier("Müller & Söhne e.U.")).toBe("mueller soehne");
    expect(suggest({ history, supplier: "MUSTER HANDELS GMBH & CO KG" }).category?.categoryId).toBe(13);
    // Ein Name steckt ganz im anderen.
    expect(suggest({ history, supplier: "Installateur Huber Linz", description: "Arbeitszeit" })).toMatchObject({
      category: { categoryId: 12 },
      certain: true,
    });
    // Ein anderer Rechnungssteller erbt nichts.
    expect(suggest({ history, supplier: "Muster Bau GmbH" }).category).toBeNull();
  });

  it("entscheidet bei mehreren bisherigen Kostenarten nach dem Inhalt des Belegs", () => {
    const result = suggest({ history, supplier: "Gemeinde Musterdorf", description: "Müllgebühr Jahresvorschreibung" });
    expect(result).toMatchObject({ category: { categoryId: 3, confidence: 0.85 }, certain: true });
    expect(result.category!.reason).toContain("mehreren Kostenarten zugeordnet");
    expect(result.alternatives.map((c) => c.categoryId).sort()).toEqual([2, 4]);
  });

  it("lässt die Auswahl offen, wenn auch der Inhalt nicht entscheidet – mit den bisherigen als Kandidaten", () => {
    const result = suggest({ history, supplier: "Gemeinde Musterdorf", description: "Vorschreibung 2026" });
    expect(result.certain).toBe(false);
    expect([result.category!, ...result.alternatives].map((c) => c.categoryId).sort()).toEqual([2, 3, 4]);
    expect(result.category!.reason).toBe("Rechnungssteller bisher 2× dieser Kostenart zugeordnet");
  });

  it("fragt nach, wenn der Beleg der Gewohnheit klar widerspricht", () => {
    const result = suggest({ history, supplier: "Installateur Huber", description: "Schneeräumung und Streudienst" });
    expect(result.certain).toBe(false);
    expect(result.category).toMatchObject({ categoryId: 12 });
    expect(result.alternatives.map((c) => c.categoryId)).toContain(10);
    // Passt der Beleg zur Gewohnheit, bleibt es bei ihr.
    expect(suggest({ history, supplier: "Installateur Huber", description: "Reparatur Wasserleitung" })).toMatchObject({
      category: { categoryId: 12 },
      certain: true,
    });
  });

  it("ignoriert Zuordnungen zu Kostenarten, die es nicht mehr gibt", () => {
    const withoutAdministration = CATEGORIES.filter((category) => category.id !== 13);
    expect(suggest({ history, categories: withoutAdministration, supplier: "Muster Handels GmbH" }).category).toBeNull();
  });

  it("eine einzige frühere Zuordnung genügt, eine überwiegende auch", () => {
    expect(suggest({ history, supplier: "Installateur Huber" })).toMatchObject({
      category: { categoryId: 12, confidence: 0.85 },
      certain: true,
    });
    const mostly: CategoryHistoryEntry[] = [
      { supplier: "Stadtwerke", categoryId: 1, count: 9 },
      { supplier: "Stadtwerke", categoryId: 7, count: 1 },
    ];
    expect(suggest({ history: mostly, supplier: "Stadtwerke", description: "Abrechnung" })).toMatchObject({
      category: { categoryId: 1 },
      certain: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Texte für Oberfläche und Audit-Log
// ---------------------------------------------------------------------------

describe("Auswertung in Worten", () => {
  const base: OcrClassification = {
    documentType: "invoice",
    documentTypeCertain: true,
    documentTypeSignals: [],
    category: null,
    categoryCertain: false,
    alternatives: [],
  };
  const chimney = { categoryId: 6, categoryName: "Rauchfangkehrer", confidence: 0.85, reason: "Stichwort „Kehrung“ im Beleg" };

  it("meldet nur Gutschriften und Hinweise darauf", () => {
    expect(documentTypeNote(base)).toBeNull();
    const credit = { ...base, documentType: "credit_note" as const, documentTypeSignals: ["Titel „Gutschrift“"] };
    expect(isCreditNoteDetected(credit)).toBe(true);
    expect(documentTypeNote(credit)).toBe("Als Gutschrift erkannt (Titel „Gutschrift“).");
    const hint = { ...base, documentTypeCertain: false, documentTypeSignals: ["„Gutschrift“ im Text"] };
    expect(isCreditNoteDetected(hint)).toBe(false);
    expect(documentTypeNote(hint)).toContain("bitte den Dokumenttyp prüfen");
    expect(isCreditNoteDetected(null)).toBe(false);
  });

  it("unterscheidet zugeordnet, vorgeschlagen, unsicher und nichts erkannt", () => {
    const certain = { ...base, category: chimney, categoryCertain: true };
    expect(categoryNote(certain, true)).toBe(
      "Kostenart automatisch zugeordnet: Rauchfangkehrer – Stichwort „Kehrung“ im Beleg.",
    );
    expect(categoryNote(certain, false)).toMatch(/^Vorgeschlagene Kostenart: Rauchfangkehrer/);
    const unsure = { ...base, category: { ...chimney, confidence: 0.4 }, alternatives: [{ ...chimney, categoryId: 8, categoryName: "Heizung" }] };
    expect(categoryNote(unsure, false)).toBe("Keine sichere Kostenart – möglich: Rauchfangkehrer, Heizung.");
    expect(categoryNote(base, false)).toBe("Keine passende Kostenart erkannt.");
  });
});
