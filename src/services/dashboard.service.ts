import "server-only";

import { authorize, can, getDataScope } from "@/auth/rbac";
import { summarizeStatement } from "@/lib/billing/allocation";
import type { SessionUser } from "@/types/auth";
import type { DocumentDto, PeriodDto, Statement, UnitBalance } from "@/types/billing";

import { listDocuments } from "./documents.service";
import { listPayments } from "./payments.service";
import { getVisiblePeriod } from "./periods.service";
import { getStatement } from "./statement.service";

const EMPTY_STATEMENT: Statement = {
  lines: [],
  balances: [],
  costBeforeCreditsCents: 0,
  creditCents: 0,
  creditCount: 0,
  totalCostCents: 0,
  totalPaymentCents: 0,
  undistributedCents: 0,
};

export interface CategoryTotal {
  categoryId: number;
  categoryName: string;
  /** Kosten der Kostenart im Sichtbereich – ohne Gutschriften. */
  costCents: number;
  /** Gutschriften der Kostenart im Sichtbereich, als positiver Betrag. */
  creditCents: number;
  creditCount: number;
}

/** Was im Abrechnungsjahr noch zu erledigen ist. */
export interface OpenItems {
  /** TOPs, deren Einzahlungen den Kostenanteil nicht decken. */
  unitsWithBalanceDue: UnitBalance[];
  /** Erwartete, noch nicht eingegangene Einzahlungen. */
  pendingPayments: { count: number; cents: number };
  /** Kostenpositionen ohne verknüpftes Dokument (nur mit Blick auf alle TOPs). */
  costsWithoutDocument: number;
  /** Dokumente ohne Kostenposition, Einzahlung und TOP (nur mit Blick auf alle TOPs). */
  unassignedDocuments: number;
  undistributedCents: number;
}

export interface Activity {
  /** credit = Gutschrift: eine Kostenposition mit negativem Betrag. */
  kind: "cost" | "credit" | "payment" | "document";
  id: number;
  title: string;
  detail: string;
  amountCents: number | null;
  /** Zeitpunkt der Erfassung. */
  at: string;
}

export interface DashboardData {
  period: PeriodDto;
  /** Kostenpositionen im Sichtbereich – ohne Gutschriften: alle Kosten bzw. der Anteil der eigenen TOP. */
  costBeforeCreditsCents: number;
  /** Gutschriften im Sichtbereich, als positiver Betrag. */
  creditCents: number;
  /** Nettokosten: Kosten minus Gutschriften. */
  costCents: number;
  paymentCents: number;
  /** Einzahlungen minus Nettokosten: positiv = Guthaben, negativ = Nachzahlung. */
  balanceCents: number;
  balances: UnitBalance[];
  categories: CategoryTotal[];
  /** Anzahl der Kostenpositionen – Gutschriften zählen eigens. */
  costCount: number;
  creditCount: number;
  documentCount: number;
  openItems: OpenItems;
  activities: Activity[];
  recentDocuments: DocumentDto[];
}

/**
 * Kennzahlen eines Abrechnungsjahres. Baut ausschließlich auf den anderen Services
 * auf – deren Rechte- und Sichtbereichsprüfung gilt damit automatisch auch hier.
 */
export async function getDashboard(actor: SessionUser, periodId: number): Promise<DashboardData> {
  authorize(actor, "dashboard:view");
  const allUnits = getDataScope(actor).allUnits;

  // Bereiche, für die der Rolle das Leserecht fehlt, bleiben im Dashboard einfach leer.
  const [period, statement, payments, documents] = await Promise.all([
    getVisiblePeriod(actor, periodId),
    can(actor, "cost:read") ? getStatement(actor, periodId) : EMPTY_STATEMENT,
    can(actor, "payment:read") ? listPayments(actor, { periodId }) : [],
    can(actor, "document:read") ? listDocuments(actor, { periodId }) : [],
  ]);

  const categories = new Map<number, CategoryTotal>();
  for (const line of statement.lines) {
    const entry = categories.get(line.categoryId) ?? {
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      costCents: 0,
      creditCents: 0,
      creditCount: 0,
    };
    // Für die Verwaltung zählt der volle Betrag – auch solange Schlüsselwerte fehlen und die
    // Position noch nicht verteilt ist. Sonst stünde die Kostenart neben den Gesamtkosten mit € 0.
    const cents = allUnits
      ? line.amountCents
      : line.shares.reduce((acc, share) => acc + share.cents, 0);
    // Gutschriften stehen je Kostenart neben den Kosten, nicht darin.
    if (line.credit) {
      entry.creditCents -= cents;
      entry.creditCount += 1;
    } else {
      entry.costCents += cents;
    }
    categories.set(line.categoryId, entry);
  }

  // Offiziell zählt nur Geprüftes; eigene, noch ungeprüfte Einträge stehen unter „Meine Eingaben“.
  const official = payments.filter((payment) => payment.reviewStatus === "approved");
  const officialDocuments = documents.filter((d) => d.reviewStatus === "approved");
  const pending = official.filter((payment) => payment.status === "pending");
  const totals = summarizeStatement(statement, allUnits);

  const activities: Activity[] = [
    ...statement.lines.map((line) => ({
      kind: line.credit ? ("credit" as const) : ("cost" as const),
      id: line.costId,
      title: line.description,
      detail: line.categoryName,
      amountCents: allUnits ? line.amountCents : (line.shares[0]?.cents ?? 0),
      at: line.createdAt,
    })),
    ...official.map((payment) => ({
      kind: "payment" as const,
      id: payment.id,
      title: allUnits ? `Einzahlung ${payment.unitName}` : "Einzahlung",
      detail: payment.purpose ?? "",
      amountCents: payment.amountCents,
      at: payment.createdAt,
    })),
    ...officialDocuments.map((document) => ({
      kind: "document" as const,
      id: document.id,
      title: document.fileName,
      detail: document.description ?? document.costs[0]?.label ?? "",
      amountCents: null,
      at: document.createdAt,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return {
    period,
    costBeforeCreditsCents: totals.costBeforeCreditsCents,
    creditCents: totals.creditCents,
    costCents: totals.costCents,
    paymentCents: totals.paymentCents,
    balanceCents: totals.balanceCents,
    balances: statement.balances,
    categories: [...categories.values()].sort(
      (a, b) => b.costCents - a.costCents || b.creditCents - a.creditCents,
    ),
    costCount: statement.lines.length - statement.creditCount,
    creditCount: statement.creditCount,
    documentCount: officialDocuments.length,
    openItems: {
      unitsWithBalanceDue: statement.balances.filter((balance) => balance.balanceCents < 0),
      pendingPayments: {
        count: pending.length,
        cents: pending.reduce((acc, payment) => acc + payment.amountCents, 0),
      },
      costsWithoutDocument: allUnits
        ? statement.lines.filter((line) => line.documents.length === 0).length
        : 0,
      unassignedDocuments: allUnits
        ? officialDocuments.filter(
            (d) => d.costs.length === 0 && d.payments.length === 0 && d.unitId === null,
          ).length
        : 0,
      undistributedCents: statement.undistributedCents,
    },
    activities,
    recentDocuments: officialDocuments.slice(0, 5),
  };
}
