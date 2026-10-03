import type {
  DocumentType,
  PaymentStatus,
  RecurringAmountType,
  RecurringInterval,
  ReviewStatus,
} from "@/types/billing";

export const DOCUMENT_TYPES: DocumentType[] = ["invoice", "payment_proof", "contract", "other"];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice: "Rechnung",
  payment_proof: "Zahlungsnachweis",
  contract: "Vertrag",
  other: "Sonstiges",
};

export const PAYMENT_STATUSES: PaymentStatus[] = ["received", "pending", "cancelled"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  received: "Eingegangen",
  pending: "Offen",
  cancelled: "Storniert",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Ausstehende Prüfung",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};

export const RECURRING_INTERVALS: RecurringInterval[] = ["monthly", "quarterly", "yearly"];

export const RECURRING_INTERVAL_LABELS: Record<RecurringInterval, string> = {
  monthly: "Monatlich",
  quarterly: "Quartalsweise",
  yearly: "Jährlich",
};

export const RECURRING_AMOUNT_TYPE_LABELS: Record<RecurringAmountType, string> = {
  fixed: "Fixbetrag",
  variable: "Variabel – Betrag beim Erzeugen",
};

export const MONTH_NAMES = [
  "Jänner",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
