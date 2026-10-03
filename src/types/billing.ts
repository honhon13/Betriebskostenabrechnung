export type PeriodStatus = "draft" | "released";
export type AllocationSource = "unit_area" | "unit_persons" | "equal" | "manual";
export type OcrStatus = "none" | "pending" | "done" | "failed";
export type DocumentType = "invoice" | "payment_proof" | "contract" | "other";
export type PaymentStatus = "received" | "pending" | "cancelled";
/** pending = ausstehende Prüfung, approved = freigegeben, rejected = abgelehnt. */
export type ReviewStatus = "pending" | "approved" | "rejected";

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
  allocationKeyId: number;
  allocationKeyName: string;
  notes: string | null;
  unitIds: number[];
  documents: DocumentRef[];
  createdAt: string;
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

/** Ergebnis eines OCR-Laufs für die Oberfläche. */
export interface OcrOutcome {
  status: "done" | "failed";
  /** Was die OCR erkannt hat – null, wenn sie fehlgeschlagen ist. */
  fields: OcrFields | null;
  /** Beschriftungen der Formularfelder, die mit erkannten Werten gefüllt wurden. */
  filled: string[];
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
  costCents: number;
  /** Nur eingegangene Einzahlungen. */
  paymentCents: number;
  /** Erwartete, noch nicht eingegangene Einzahlungen – zählen nicht in den Saldo. */
  pendingPaymentCents: number;
  /** Einzahlungen minus Kostenanteil: positiv = Guthaben, negativ = Nachzahlung. */
  balanceCents: number;
}

export interface Statement {
  lines: StatementLine[];
  balances: UnitBalance[];
  /** Summe aller sichtbaren Kostenpositionen. */
  totalCostCents: number;
  /** Summe der sichtbaren Einzahlungen. */
  totalPaymentCents: number;
  /** Kosten, die mangels Schlüsselwerten keiner TOP zugeordnet werden konnten. */
  undistributedCents: number;
}
