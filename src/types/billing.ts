export type PeriodStatus = "draft" | "released";
export type AllocationSource = "unit_area" | "unit_persons" | "equal" | "manual";
export type OcrStatus = "none" | "pending" | "done" | "failed";
export type DocumentType = "invoice" | "credit_note" | "payment_proof" | "contract" | "other";
/** Belege, die zu einer Kostenposition gehören: Rechnung oder Gutschrift. */
export type ReceiptType = Extract<DocumentType, "invoice" | "credit_note">;
export type PaymentStatus = "received" | "pending" | "cancelled";
/** pending = ausstehende Prüfung, approved = freigegeben, rejected = abgelehnt. */
export type ReviewStatus = "pending" | "approved" | "rejected";
/** fixed = fester Betrag je Zeitraum, variable = der Betrag wird beim Erzeugen eingegeben. */
export type RecurringAmountType = "fixed" | "variable";
export type RecurringInterval = "monthly" | "quarterly" | "yearly";

/** Prüfstand eines Eintrags. Nur „approved“ zählt offiziell. */
export interface ReviewInfo {
  reviewStatus: ReviewStatus;
  reviewedAt: string | null;
  reviewComment: string | null;
}

/** Kurzform eines Dokuments für Listen von Kosten und Einzahlungen. */
export interface DocumentRef {
  id: number;
  fileName: string;
  type: DocumentType;
  mimeType: string;
}

export interface UnitDto {
  id: number;
  number: number;
  name: string;
  areaSqm: number | null;
  persons: number | null;
  notes: string | null;
}

export interface PeriodDto extends ReviewInfo {
  id: number;
  year: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  releasedAt: string | null;
  notes: string | null;
}

export interface AllocationKeyDto {
  id: number;
  code: string;
  name: string;
  unitLabel: string;
  source: AllocationSource;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

/** Schlüsselwert einer TOP in einem Abrechnungsjahr. */
export interface AllocationValueDto {
  keyId: number;
  unitId: number;
  value: number;
}

export interface CategoryDto {
  id: number;
  name: string;
  description: string | null;
  defaultAllocationKeyId: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface CostDto extends ReviewInfo {
  id: number;
  periodId: number;
  categoryId: number;
  categoryName: string;
  description: string;
  amountCents: number;
  costDate: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  netAmountCents: number | null;
  /** MwSt.-Betrag. */
  taxAmountCents: number | null;
  allocationKeyId: number;
  allocationKeyName: string;
  notes: string | null;
  unitIds: number[];
  documents: DocumentRef[];
  createdAt: string;
}

/** Vorlage für wiederkehrende Kosten. */
export interface RecurringCostDto {
  id: number;
  categoryId: number;
  categoryName: string;
  /** Beschreibung der erzeugten Kostenpositionen – der Zeitraum wird angehängt. */
  description: string;
  amountType: RecurringAmountType;
  /** Betrag je Zeitraum; bei „variable“ ein Richtwert oder null. */
  amountCents: number | null;
  interval: RecurringInterval;
  supplier: string | null;
  allocationKeyId: number;
  allocationKeyName: string;
  unitIds: number[];
  notes: string | null;
  isActive: boolean;
  /**
   * Je Abrechnungsjahr (periodId) der Beginn der Zeiträume, für die es aus dieser Vorlage
   * schon eine Kostenposition gibt – abgelehnte Einreichungen zählen nicht.
   */
  generated: Record<number, string[]>;
}

export interface PaymentDto extends ReviewInfo {
  id: number;
  periodId: number;
  year: number;
  unitId: number;
  unitName: string;
  paymentDate: string;
  amountCents: number;
  purpose: string | null;
  note: string | null;
  status: PaymentStatus;
  /** Zahlungsnachweise und andere verknüpfte Dokumente. */
  documents: DocumentRef[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Abrechnungskonto
// ---------------------------------------------------------------------------

/** Eine Kontobewegung: Einzahlung (positiv) oder Auszahlung (negativ). */
export interface AccountMovement {
  /** ID der Einzahlung, aus der die Bewegung stammt. */
  id: number;
  date: string;
  /** Abrechnungsjahr, dem die Zahlung zugeordnet ist. */
  year: number;
  purpose: string | null;
  amountCents: number;
  /** Saldo der TOP nach dieser Bewegung. */
  balanceCents: number;
}

/** Laufendes Konto einer TOP seit dem Stichtag. */
export interface UnitAccount {
  unitId: number;
  unitName: string;
  /** Anfangssaldo zum Stichtag: positiv = Guthaben, negativ = Rückstand. */
  openingCents: number;
  openingNote: string | null;
  /** Summe der Einzahlungen seit dem Stichtag. */
  inflowCents: number;
  /** Summe der Auszahlungen seit dem Stichtag – als positiver Betrag. */
  outflowCents: number;
  /** Anfangssaldo + Einzahlungen − Auszahlungen. */
  balanceCents: number;
  /** Chronologisch, älteste zuerst. */
  movements: AccountMovement[];
}

export interface AccountOverview {
  /** Stichtag der Kontoführung – null, solange das Konto nicht eingerichtet ist. */
  startDate: string | null;
  /** Konten im Sichtbereich: alle TOPs bzw. nur die eigene. */
  units: UnitAccount[];
  /** Summen über die sichtbaren Konten; der Gesamtbestand ist die Summe der Salden. */
  openingCents: number;
  inflowCents: number;
  outflowCents: number;
  balanceCents: number;
}

/** Normalisierte OCR-Felder – unabhängig vom OCR-Anbieter. Nicht Erkanntes ist null. */
export interface OcrFields {
  /** Rechnungssteller. */
  supplier: string | null;
  invoiceNumber: string | null;
  /** Rechnungsdatum. */
  documentDate: string | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  netAmountCents: number | null;
  /** MwSt.-Betrag. */
  taxAmountCents: number | null;
  /** Bruttobetrag. */
  amountCents: number | null;
  /** MwSt.-Satz wie auf der Rechnung gedruckt, z. B. „20 %“. */
  taxRate: string | null;
  /** Aus den Rechnungspositionen abgeleitete Kurzbeschreibung. */
  description: string | null;
  currency: string | null;
  /** Mittlere Erkennungssicherheit der gefundenen Felder (0–1). */
  confidence: number | null;
}

/** Vorschlag für die Kostenart eines Belegs. */
export interface CategorySuggestion {
  categoryId: number;
  categoryName: string;
  /** Sicherheit 0–1. Ab CATEGORY_AUTO_ASSIGN_CONFIDENCE wird automatisch zugeordnet. */
  confidence: number;
  /** Kurze Begründung, z. B. „Rechnungssteller bisher 3× dieser Kostenart zugeordnet“. */
  reason: string;
}

/**
 * Was die Auswertung eines ausgelesenen Belegs ergeben hat: Rechnung oder Gutschrift und die
 * passende Kostenart. Wird mit dem OCR-Ergebnis am Dokument gespeichert.
 */
export interface OcrClassification {
  /** Erkannte Belegart – null, wenn das Dokument weder nach Rechnung noch nach Gutschrift aussieht. */
  documentType: ReceiptType | null;
  /** false = nur ein schwacher Hinweis; der Dokumenttyp wird dann nicht umgestellt. */
  documentTypeCertain: boolean;
  /** Woran die Belegart erkannt wurde, z. B. „Titel „Gutschrift““ oder „negativer Gesamtbetrag“. */
  documentTypeSignals: string[];
  /** Beste Kostenart – null, wenn nichts passt. */
  category: CategorySuggestion | null;
  /** true = sicher genug für die automatische Zuordnung; sonst bleibt die Auswahl offen. */
  categoryCertain: boolean;
  /** Weitere Kandidaten, beste zuerst – als Hilfe für die Auswahl von Hand. */
  alternatives: CategorySuggestion[];
}

/** Ergebnis eines OCR-Laufs für die Oberfläche. */
export interface OcrOutcome {
  status: "done" | "failed";
  /** Was die OCR erkannt hat – null, wenn sie fehlgeschlagen ist. Beträge einer Gutschrift sind negativ. */
  fields: OcrFields | null;
  /** Beschriftungen der Formularfelder, die mit erkannten Werten gefüllt wurden. */
  filled: string[];
  /** Belegart und Kostenart – nur für Rechnungen und Gutschriften, sonst null. */
  classification: OcrClassification | null;
  /** true = die vorgeschlagene Kostenart wurde am Dokument eingetragen (sie war offen und sicher genug). */
  categoryAssigned: boolean;
  error: string | null;
}

/** Verknüpfung eines Dokuments, mit fertigem Anzeigetext. */
export interface DocumentLinkRef {
  id: number;
  label: string;
}

export interface DocumentDto extends ReviewInfo {
  id: number;
  periodId: number;
  year: number;
  type: DocumentType;
  description: string | null;
  unitId: number | null;
  unitName: string | null;
  /** Kostenart des Belegs – null = (noch) offen. Nur für Rechnungen und Gutschriften. */
  categoryId: number | null;
  categoryName: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentDate: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  netAmountCents: number | null;
  taxAmountCents: number | null;
  /** Bruttobetrag. */
  amountCents: number | null;
  ocrStatus: OcrStatus;
  /** Von der OCR erkannte Werte – unabhängig davon, was inzwischen im Formular steht. */
  ocr: OcrFields | null;
  /** Von der OCR erkannte Belegart und vorgeschlagene Kostenart – unabhängig von späteren Korrekturen. */
  classification: OcrClassification | null;
  /** Grund, falls der letzte OCR-Lauf fehlgeschlagen ist. */
  ocrError: string | null;
  /** Upload-Datum. */
  createdAt: string;
  costs: DocumentLinkRef[];
  payments: DocumentLinkRef[];
}

// ---------------------------------------------------------------------------
// Abrechnungsergebnis
// ---------------------------------------------------------------------------

export interface StatementShare {
  unitId: number;
  cents: number;
  /** Schlüsselwert der TOP (z. B. m²), der in die Verteilung eingeht. */
  weight: number;
}

export interface StatementLine {
  costId: number;
  description: string;
  categoryId: number;
  categoryName: string;
  costDate: string | null;
  amountCents: number;
  /**
   * Gutschrift (negativer Betrag): mindert die Kosten und wird überall getrennt von den
   * Kostenpositionen ausgewiesen.
   */
  credit: boolean;
  keyName: string;
  keyUnitLabel: string;
  /** Summe der Schlüsselwerte aller beteiligten TOPs. */
  totalWeight: number;
  shares: StatementShare[];
  /** false, wenn die Summe der Schlüsselwerte 0 ist – der Betrag bleibt dann unverteilt. */
  distributable: boolean;
  documents: DocumentRef[];
  createdAt: string;
}

export interface UnitBalance {
  unitId: number;
  unitName: string;
  /** Anteil an den Kostenpositionen – ohne Gutschriften. */
  costBeforeCreditsCents: number;
  /** Anteil an den Gutschriften, als positiver Betrag. */
  creditCents: number;
  /** Nettokosten der TOP: Kostenanteil minus Gutschriften. */
  costCents: number;
  /** Nur eingegangene Einzahlungen. */
  paymentCents: number;
  /** Erwartete, noch nicht eingegangene Einzahlungen – zählen nicht in den Saldo. */
  pendingPaymentCents: number;
  /** Einzahlungen minus Kostenanteil: positiv = Guthaben, negativ = Nachzahlung. */
  balanceCents: number;
}

export interface Statement {
  /** Kostenpositionen und Gutschriften (`credit`). */
  lines: StatementLine[];
  balances: UnitBalance[];
  /** Summe der sichtbaren Kostenpositionen – ohne Gutschriften. */
  costBeforeCreditsCents: number;
  /** Summe der sichtbaren Gutschriften, als positiver Betrag. */
  creditCents: number;
  /** Anzahl der sichtbaren Gutschriften. */
  creditCount: number;
  /** Nettokosten: Kostenpositionen minus Gutschriften. */
  totalCostCents: number;
  /** Summe der sichtbaren Einzahlungen. */
  totalPaymentCents: number;
  /** Kosten, die mangels Schlüsselwerten keiner TOP zugeordnet werden konnten. */
  undistributedCents: number;
}
