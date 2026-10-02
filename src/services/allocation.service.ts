import "server-only";

import { eq } from "drizzle-orm";

import { ForbiddenError } from "@/auth/errors";
import { authorize, authorizeGlobalWrite, getDataScope } from "@/auth/rbac";
import { seedAllocationValues } from "@/db/allocation-defaults";
import { getDb } from "@/db/client";
import { allocationKeys, allocationValues, units } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import type { SessionUser } from "@/types/auth";
import type { AllocationValueDto } from "@/types/billing";

import { assertDraft, getVisiblePeriod } from "./periods.service";

/** Schlüsselwerte aller TOPs eines Jahres – nur mit Blick auf alle TOPs. */
export async function listAllocationValues(
  actor: SessionUser,
  periodId: number,
): Promise<AllocationValueDto[]> {
  authorize(actor, "period:read");
  if (!getDataScope(actor).allUnits) throw new ForbiddenError();
  await getVisiblePeriod(actor, periodId);

  const rows = await getDb()
    .select()
    .from(allocationValues)
    .where(eq(allocationValues.periodId, periodId));
  return rows.map((row) => ({ keyId: row.keyId, unitId: row.unitId, value: Number(row.value) }));
}

export async function saveAllocationValues(
  actor: SessionUser,
  periodId: number,
  values: { keyId: number; unitId: number; value: string }[],
): Promise<void> {
  authorizeGlobalWrite(actor, "period:write");
  assertDraft(await getVisiblePeriod(actor, periodId));

  const db = getDb();
  const [keyRows, unitRows] = await Promise.all([
    db.select({ id: allocationKeys.id, source: allocationKeys.source }).from(allocationKeys),
    db.select({ id: units.id }).from(units),
  ]);
  const editableKeys = new Set(keyRows.filter((k) => k.source !== "equal").map((k) => k.id));
  const unitIds = new Set(unitRows.map((u) => u.id));

  for (const value of values) {
    if (!editableKeys.has(value.keyId) || !unitIds.has(value.unitId)) {
      throw new DomainError("Ungültiger Umlageschlüssel oder ungültige TOP.");
    }
  }
  if (values.length === 0) return;

  await db.transaction(async (tx) => {
    for (const value of values) {
      await tx
        .insert(allocationValues)
        .values({ periodId, ...value })
        .onConflictDoUpdate({
          target: [allocationValues.periodId, allocationValues.keyId, allocationValues.unitId],
          set: { value: value.value },
        });
    }
  });
}

/** Übernimmt Wohnfläche und Personen erneut aus den Stammdaten (Verbrauchswerte bleiben). */
export async function resetAllocationValuesFromUnits(
  actor: SessionUser,
  periodId: number,
): Promise<void> {
  authorizeGlobalWrite(actor, "period:write");
  assertDraft(await getVisiblePeriod(actor, periodId));
  await getDb().transaction((tx) => seedAllocationValues(tx, periodId, { overwrite: true }));
}
