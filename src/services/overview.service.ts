import "server-only";

import { authorize, getDataScope } from "@/auth/rbac";
import { summarizeStatement, type StatementTotals } from "@/lib/billing/allocation";
import { buildMonthlyOverview, type MonthlyOverview } from "@/lib/billing/monthly";
import { buildMonthlyTrend, buildYearlyTrend, type CostTrend } from "@/lib/billing/trend";
import type { SessionUser } from "@/types/auth";
import type { PeriodDto } from "@/types/billing";

import { listPayments } from "./payments.service";
import { listPeriods } from "./periods.service";
import { getStatement } from "./statement.service";

export interface YearSummary extends StatementTotals {
  period: PeriodDto;
  costCount: number;
}

/**
 * Jahresübersicht: Kosten, Einzahlungen und Differenz je sichtbarem Abrechnungsjahr –
 * für die Verwaltung über alle TOPs, sonst für die eigene TOP.
 */
export async function getYearOverview(actor: SessionUser): Promise<YearSummary[]> {
  authorize(actor, "cost:read");
  const allUnits = getDataScope(actor).allUnits;
  const periods = await listPeriods(actor);

  return Promise.all(
    periods.map(async (period) => {
      const statement = await getStatement(actor, period.id);
      return {
        period,
        costCount: statement.lines.length,
        ...summarizeStatement(statement, allUnits),
      };
    }),
  );
}

/**
 * Monatsübersicht eines Abrechnungsjahres. Mit `unitId` (nur für die Verwaltung wirksam)
 * die Sicht einer einzelnen TOP: ihr Kostenanteil und ihre Einzahlungen je Monat.
 */
export async function getMonthlyOverview(
  actor: SessionUser,
  period: PeriodDto,
  unitId?: number,
): Promise<MonthlyOverview> {
  authorize(actor, "cost:read");
  authorize(actor, "payment:read");
  const scope = getDataScope(actor);

  // Eingeschränkte Benutzer bekommen von den Services ohnehin nur die eigene TOP.
  const focusUnitId = scope.allUnits ? unitId : (scope.unitId ?? undefined);

  const [statement, payments] = await Promise.all([
    getStatement(actor, period.id),
    listPayments(actor, {
      periodId: period.id,
      unitId: focusUnitId,
      status: "received",
      reviewStatus: "approved",
    }),
  ]);

  const costs = statement.lines.map((line) => ({
    date: line.costDate,
    cents:
      focusUnitId === undefined
        ? line.amountCents
        : (line.shares.find((share) => share.unitId === focusUnitId)?.cents ?? 0),
  }));

  return buildMonthlyOverview(
    period.year,
    costs,
    payments.map((payment) => ({ date: payment.paymentDate, cents: payment.amountCents })),
  );
}

/**
 * Kostenverlauf fürs Dashboard: mit einem Jahr die Monate dieses Abrechnungsjahres, ohne
 * die Entwicklung über alle sichtbaren Jahre. Gerechnet wird aus der Abrechnung – es zählen
 * also nur freigegebene Einträge, und ohne Blick auf alle TOPs nur der eigene Anteil.
 */
export async function getCostTrend(actor: SessionUser, period: PeriodDto | null): Promise<CostTrend> {
  authorize(actor, "cost:read");
  if (period) return buildMonthlyTrend(period.year, await getStatement(actor, period.id));

  const periods = await listPeriods(actor);
  return buildYearlyTrend(
    await Promise.all(
      periods.map(async (p) => ({ year: p.year, statement: await getStatement(actor, p.id) })),
    ),
  );
}
