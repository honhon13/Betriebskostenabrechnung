import type { DocumentType, PaymentStatus } from "@/types/billing";

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
