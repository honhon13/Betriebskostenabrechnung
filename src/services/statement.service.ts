import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { authorize, getDataScope } from "@/auth/rbac";
import { getDb } from "@/db/client";
import {
  allocationKeys,
  allocationValues,
  costCategories,
  costs,
  costUnits,
  payments,
  units,
} from "@/db/schema";
import { buildStatement, restrictStatementToUnit } from "@/lib/billing/allocation";
import type { SessionUser } from "@/types/auth";
import type { Statement } from "@/types/billing";

import { getDocumentRefs } from "./documents.service";
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
        createdAt: costs.createdAt,
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
      .select({
        unitId: payments.unitId,
        amountCents: payments.amountCents,
        status: payments.status,
      })
      .from(payments)
      .where(eq(payments.periodId, periodId)),
  ]);

  const costIds = costRows.map((row) => row.id);
  const [costUnitRows, documentRefs] = await Promise.all([
    costIds.length === 0
      ? []
      : db.select().from(costUnits).where(inArray(costUnits.costId, costIds)),
    getDocumentRefs("cost", costIds),
  ]);

  const statement = buildStatement({
    units: unitRows,
    costs: costRows.map((cost) => ({
      ...cost,
      createdAt: cost.createdAt.toISOString(),
      unitIds: costUnitRows.filter((cu) => cu.costId === cost.id).map((cu) => cu.unitId),
      documents: documentRefs.get(cost.id) ?? [],
    })),
    values: valueRows,
    payments: paymentRows,
  });

  const scope = getDataScope(actor);
  return scope.allUnits ? statement : restrictStatementToUnit(statement, scope.unitId);
}
