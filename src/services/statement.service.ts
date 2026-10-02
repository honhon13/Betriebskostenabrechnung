import "server-only";

import { asc, count, eq, inArray } from "drizzle-orm";

import { authorize, getDataScope } from "@/auth/rbac";
import { getDb } from "@/db/client";
import {
  allocationKeys,
  allocationValues,
  costCategories,
  costs,
  costUnits,
  payments,
  receipts,
  units,
} from "@/db/schema";
import { buildStatement, restrictStatementToUnit } from "@/lib/billing/allocation";
import type { SessionUser } from "@/types/auth";
import type { Statement } from "@/types/billing";

import { getVisiblePeriod } from "./periods.service";

/**
 * Abrechnung eines Jahres. Gerechnet wird immer über alle TOPs; ohne scope:all_units
 * bekommt der Aufrufer nur die Positionen und den Anteil seiner eigenen TOP zurück.
 */
export async function getStatement(actor: SessionUser, periodId: number): Promise<Statement> {
  authorize(actor, "cost:read");
  await getVisiblePeriod(actor, periodId);

  const db = getDb();
  const [unitRows, costRows, valueRows, paymentRows] = await Promise.all([
    db.select({ id: units.id, name: units.name }).from(units).orderBy(asc(units.number)),
    db
      .select({
        id: costs.id,
        description: costs.description,
        categoryId: costs.categoryId,
        categoryName: costCategories.name,
        categoryOrder: costCategories.sortOrder,
        costDate: costs.costDate,
        amountCents: costs.amountCents,
        keyId: allocationKeys.id,
        keyName: allocationKeys.name,
        keyUnitLabel: allocationKeys.unitLabel,
        keySource: allocationKeys.source,
      })
      .from(costs)
      .innerJoin(costCategories, eq(costCategories.id, costs.categoryId))
      .innerJoin(allocationKeys, eq(allocationKeys.id, costs.allocationKeyId))
      .where(eq(costs.periodId, periodId))
      .orderBy(asc(costCategories.sortOrder), asc(costCategories.name), asc(costs.costDate), asc(costs.id)),
    db.select().from(allocationValues).where(eq(allocationValues.periodId, periodId)),
    db
      .select({ unitId: payments.unitId, amountCents: payments.amountCents })
      .from(payments)
      .where(eq(payments.periodId, periodId)),
  ]);

  const costIds = costRows.map((row) => row.id);
  const [costUnitRows, receiptRows] =
    costIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.select().from(costUnits).where(inArray(costUnits.costId, costIds)),
          db
            .select({ costId: receipts.costId, n: count() })
            .from(receipts)
            .where(inArray(receipts.costId, costIds))
            .groupBy(receipts.costId),
        ]);
  const receiptCount = new Map(receiptRows.map((row) => [row.costId, row.n]));

  const statement = buildStatement({
    units: unitRows,
    costs: costRows.map((cost) => ({
      ...cost,
      unitIds: costUnitRows.filter((cu) => cu.costId === cost.id).map((cu) => cu.unitId),
      receiptCount: receiptCount.get(cost.id) ?? 0,
    })),
    values: valueRows,
    payments: paymentRows,
  });

  const scope = getDataScope(actor);
  return scope.allUnits ? statement : restrictStatementToUnit(statement, scope.unitId);
}
