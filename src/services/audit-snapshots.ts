import "server-only";

import { asc, eq } from "drizzle-orm";

import type { DbExecutor } from "@/db/client";
import {
  allocationKeys,
  billingPeriods,
  costCategories,
  costs,
  costUnits,
  documentLinks,
  documents,
  payments,
  recurringCosts,
  recurringCostUnits,
  roles,
  units,
  users,
} from "@/db/schema";
import type { AuditSnapshot } from "@/lib/audit";
import { isCredit } from "@/lib/billing/allocation";
import { formatCents, formatDate } from "@/lib/format";
import {
  DOCUMENT_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  RECURRING_AMOUNT_TYPE_LABELS,
  RECURRING_INTERVAL_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/labels";

/**
 * Momentaufnahmen von Datensätzen fürs Audit-Log: eine lesbare Bezeichnung und die
 * Anzeigewerte je Feld. Vor und nach einer Änderung aufgenommen, ergibt ihr Vergleich
 * „vorher → nachher“ – mit Namen statt IDs, damit das Protokoll für sich lesbar bleibt.
 *
 * Die Abfragen laufen nacheinander: in einer Transaktion teilen sie sich eine Verbindung.
 */
export interface Described {
  summary: string;
  snapshot: AuditSnapshot;
}

const cents = (value: number | null) => (value === null ? null : formatCents(value));
const date = (value: string | null) => (value === null ? null : formatDate(value));
const yesNo = (value: boolean) => (value ? "Ja" : "Nein");

function dateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  return [start, end].map((value) => (value ? formatDate(value) : "…")).join(" – ");
}

export async function describeCost(executor: DbExecutor, costId: number): Promise<Described | null> {
  const [row] = await executor
    .select({
      cost: costs,
      year: billingPeriods.year,
      categoryName: costCategories.name,
      keyName: allocationKeys.name,
    })
    .from(costs)
    .innerJoin(billingPeriods, eq(billingPeriods.id, costs.periodId))
    .innerJoin(costCategories, eq(costCategories.id, costs.categoryId))
    .innerJoin(allocationKeys, eq(allocationKeys.id, costs.allocationKeyId))
    .where(eq(costs.id, costId))
    .limit(1);
  if (!row) return null;

  const unitRows = await executor
    .select({ name: units.name })
    .from(costUnits)
    .innerJoin(units, eq(units.id, costUnits.unitId))
    .where(eq(costUnits.costId, costId))
    .orderBy(asc(units.number));

  const { cost, year, categoryName, keyName } = row;
  return {
    summary: `${cost.description} · ${formatCents(cost.amountCents)} · ${year}`,
    snapshot: {
      Abrechnungsjahr: String(year),
      // Wechselt das Vorzeichen des Betrags, wird aus Kosten eine Gutschrift – das soll im Protokoll stehen.
      "Art der Position": isCredit(cost.amountCents) ? "Gutschrift" : "Kosten",
      Kostenart: categoryName,
      Beschreibung: cost.description,
      Betrag: formatCents(cost.amountCents),
      Rechnungsdatum: date(cost.costDate),
      Rechnungssteller: cost.supplier,
      Rechnungsnummer: cost.invoiceNumber,
      Leistungszeitraum: dateRange(cost.servicePeriodStart, cost.servicePeriodEnd),
      Netto: cents(cost.netAmountCents),
      "MwSt.": cents(cost.taxAmountCents),
      Umlageschlüssel: keyName,
      TOPs: unitRows.map((unit) => unit.name).join(", ") || null,
      Notiz: cost.notes,
      Prüfstand: REVIEW_STATUS_LABELS[cost.reviewStatus],
    },
  };
}

export async function describePayment(
  executor: DbExecutor,
  paymentId: number,
): Promise<Described | null> {
  const [row] = await executor
    .select({ payment: payments, year: billingPeriods.year, unitName: units.name })
    .from(payments)
    .innerJoin(billingPeriods, eq(billingPeriods.id, payments.periodId))
    .innerJoin(units, eq(units.id, payments.unitId))
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!row) return null;

  const { payment, year, unitName } = row;
  return {
    summary: `Einzahlung ${unitName} · ${formatDate(payment.paymentDate)} · ${formatCents(payment.amountCents)}`,
    snapshot: {
      Abrechnungsjahr: String(year),
      TOP: unitName,
      Datum: formatDate(payment.paymentDate),
      Betrag: formatCents(payment.amountCents),
      Verwendungszweck: payment.purpose,
      Zahlungsstatus: PAYMENT_STATUS_LABELS[payment.status],
      Notiz: payment.note,
      Prüfstand: REVIEW_STATUS_LABELS[payment.reviewStatus],
    },
  };
}

export async function describeDocument(
  executor: DbExecutor,
  documentId: number,
): Promise<Described | null> {
  const [row] = await executor
    .select({
      document: documents,
      year: billingPeriods.year,
      unitName: units.name,
      categoryName: costCategories.name,
    })
    .from(documents)
    .innerJoin(billingPeriods, eq(billingPeriods.id, documents.periodId))
    .leftJoin(units, eq(units.id, documents.unitId))
    .leftJoin(costCategories, eq(costCategories.id, documents.categoryId))
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!row) return null;

  const links = await executor
    .select({
      costDescription: costs.description,
      paymentDate: payments.paymentDate,
      paymentAmount: payments.amountCents,
    })
    .from(documentLinks)
    .leftJoin(costs, eq(costs.id, documentLinks.costId))
    .leftJoin(payments, eq(payments.id, documentLinks.paymentId))
    .where(eq(documentLinks.documentId, documentId))
    .orderBy(asc(documentLinks.id));

  const { document, year, unitName, categoryName } = row;
  const payment = links.find((link) => link.paymentDate !== null);
  return {
    summary: `${document.fileName} · ${DOCUMENT_TYPE_LABELS[document.type]} · ${year}`,
    snapshot: {
      Abrechnungsjahr: String(year),
      Dokumenttyp: DOCUMENT_TYPE_LABELS[document.type],
      Datei: document.fileName,
      Beschreibung: document.description,
      TOP: unitName,
      Kostenart: categoryName,
      Rechnungssteller: document.supplier,
      Rechnungsnummer: document.invoiceNumber,
      Rechnungsdatum: date(document.documentDate),
      Leistungszeitraum: dateRange(document.servicePeriodStart, document.servicePeriodEnd),
      Netto: cents(document.netAmountCents),
      "MwSt.": cents(document.taxAmountCents),
      Brutto: cents(document.amountCents),
      Kostenpositionen:
        links
          .flatMap((link) => (link.costDescription === null ? [] : [link.costDescription]))
          .join(", ") || null,
      Einzahlung: payment
        ? `${formatDate(payment.paymentDate)} · ${formatCents(payment.paymentAmount ?? 0)}`
        : null,
      Prüfstand: REVIEW_STATUS_LABELS[document.reviewStatus],
    },
  };
}

export async function describeRecurringCost(
  executor: DbExecutor,
  recurringCostId: number,
): Promise<Described | null> {
  const [row] = await executor
    .select({
      template: recurringCosts,
      categoryName: costCategories.name,
      keyName: allocationKeys.name,
    })
    .from(recurringCosts)
    .innerJoin(costCategories, eq(costCategories.id, recurringCosts.categoryId))
    .innerJoin(allocationKeys, eq(allocationKeys.id, recurringCosts.allocationKeyId))
    .where(eq(recurringCosts.id, recurringCostId))
    .limit(1);
  if (!row) return null;

  const unitRows = await executor
    .select({ name: units.name })
    .from(recurringCostUnits)
    .innerJoin(units, eq(units.id, recurringCostUnits.unitId))
    .where(eq(recurringCostUnits.recurringCostId, recurringCostId))
    .orderBy(asc(units.number));

  const { template, categoryName, keyName } = row;
  return {
    summary: `${template.description} · ${RECURRING_INTERVAL_LABELS[template.interval]}`,
    snapshot: {
      Kostenart: categoryName,
      Beschreibung: template.description,
      Betragstyp: RECURRING_AMOUNT_TYPE_LABELS[template.amountType],
      Betrag: cents(template.amountCents),
      Intervall: RECURRING_INTERVAL_LABELS[template.interval],
      Rechnungssteller: template.supplier,
      Umlageschlüssel: keyName,
      TOPs: unitRows.map((unit) => unit.name).join(", ") || null,
      Notiz: template.notes,
      Aktiv: yesNo(template.isActive),
    },
  };
}

export async function describeUser(executor: DbExecutor, userId: number): Promise<Described | null> {
  const [row] = await executor
    .select({ user: users, roleName: roles.name, unitName: units.name })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .leftJoin(units, eq(units.id, users.unitId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;

  const { user, roleName, unitName } = row;
  return {
    summary: `Benutzer ${user.username}`,
    snapshot: {
      Benutzername: user.username,
      Name: user.displayName,
      Rolle: roleName,
      TOP: unitName,
      Aktiv: yesNo(user.isActive),
    },
  };
}
