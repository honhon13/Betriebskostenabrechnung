import "server-only";

import { authorize, can } from "@/auth/rbac";
import type { SessionUser } from "@/types/auth";
import type { PaymentDto, PeriodDto, ReceiptDto, Statement, UnitBalance } from "@/types/billing";

import { listPayments } from "./payments.service";
import { getVisiblePeriod } from "./periods.service";
import { listReceipts } from "./receipts.service";
import { getStatement } from "./statement.service";

const EMPTY_STATEMENT: Statement = {
  lines: [],
  balances: [],
  totalCostCents: 0,
  totalPaymentCents: 0,
  undistributedCents: 0,
};

export interface CategoryTotal {
  categoryId: number;
  categoryName: string;
  /** Gesamtbetrag der Kostenart (über alle beteiligten TOPs). */
  totalCents: number;
  /** Anteil der sichtbaren TOPs – für die Verwaltung identisch mit totalCents. */
  shareCents: number;
}

export interface DashboardData {
  period: PeriodDto;
  /** Kosten im Sichtbereich: alle Kosten bzw. der Anteil der eigenen TOP. */
  costCents: number;
  paymentCents: number;
  /** Einzahlungen minus Kosten: positiv = Guthaben, negativ = offen. */
  balanceCents: number;
  undistributedCents: number;
  balances: UnitBalance[];
  categories: CategoryTotal[];
  costCount: number;
  costsWithoutReceipt: number;
  receiptCount: number;
  recentPayments: PaymentDto[];
  recentReceipts: ReceiptDto[];
}

/**
 * Kennzahlen eines Abrechnungsjahres. Baut ausschließlich auf den anderen Services
 * auf – deren Rechte- und Sichtbereichsprüfung gilt damit automatisch auch hier.
 */
export async function getDashboard(actor: SessionUser, periodId: number): Promise<DashboardData> {
  authorize(actor, "dashboard:view");

  // Bereiche, für die der Rolle das Leserecht fehlt, bleiben im Dashboard einfach leer.
  const [period, statement, payments, receipts] = await Promise.all([
    getVisiblePeriod(actor, periodId),
    can(actor, "cost:read") ? getStatement(actor, periodId) : EMPTY_STATEMENT,
    can(actor, "payment:read") ? listPayments(actor, { periodId }) : [],
    can(actor, "receipt:read") ? listReceipts(actor, periodId) : [],
  ]);

  const categories = new Map<number, CategoryTotal>();
  for (const line of statement.lines) {
    const entry = categories.get(line.categoryId) ?? {
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      totalCents: 0,
      shareCents: 0,
    };
    entry.totalCents += line.amountCents;
    entry.shareCents += line.shares.reduce((acc, share) => acc + share.cents, 0);
    categories.set(line.categoryId, entry);
  }

  const costCents = statement.balances.reduce((acc, b) => acc + b.costCents, 0);
  const paymentCents = statement.balances.reduce((acc, b) => acc + b.paymentCents, 0);

  return {
    period,
    costCents,
    paymentCents,
    balanceCents: paymentCents - costCents,
    undistributedCents: statement.undistributedCents,
    balances: statement.balances,
    categories: [...categories.values()].sort((a, b) => b.shareCents - a.shareCents),
    costCount: statement.lines.length,
    costsWithoutReceipt: statement.lines.filter((line) => line.receiptCount === 0).length,
    receiptCount: receipts.length,
    recentPayments: payments.slice(0, 5),
    recentReceipts: receipts.slice(0, 5),
  };
}
