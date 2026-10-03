import "server-only";

import { eq } from "drizzle-orm";

import { ForbiddenError } from "@/auth/errors";
import { authorize, authorizeGlobalWrite, getDataScope } from "@/auth/rbac";
import { seedAllocationValues } from "@/db/allocation-defaults";
import { getDb } from "@/db/client";
import { allocationKeys, allocationValues, units } from "@/db/schema";
import type { AuditChange } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import type { SessionUser } from "@/types/auth";
import type { AllocationValueDto } from "@/types/billing";

import { recordAudit } from "./audit.service";
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
  const period = await getVisiblePeriod(actor, periodId);
  assertDraft(period);

  const db = getDb();
  const [keyRows, unitRows] = await Promise.all([
    db
      .select({ id: allocationKeys.id, source: allocationKeys.source, name: allocationKeys.name })
      .from(allocationKeys),
    db.select({ id: units.id, name: units.name }).from(units),
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
    const current = await tx
      .select()
      .from(allocationValues)
      .where(eq(allocationValues.periodId, periodId));
    const previous = new Map(current.map((row) => [`${row.keyId}:${row.unitId}`, Number(row.value)]));

    for (const value of values) {
      await tx
        .insert(allocationValues)
        .values({ periodId, ...value })
        .onConflictDoUpdate({
          target: [allocationValues.periodId, allocationValues.keyId, allocationValues.unitId],
          set: { value: value.value },
        });
    }

    // Das Formular schickt immer die ganze Matrix – protokolliert wird nur, was sich geändert hat.
    const changes: AuditChange[] = values.flatMap((value) => {
      const from = previous.get(`${value.keyId}:${value.unitId}`);
      const to = Number(value.value);
      if (from === to) return [];
      const key = keyRows.find((row) => row.id === value.keyId)?.name ?? "";
      const unit = unitRows.find((row) => row.id === value.unitId)?.name ?? "";
      return [
        {
          field: `${key} · ${unit}`,
          from: from === undefined ? null : formatNumber(from, 3),
          to: formatNumber(to, 3),
        },
      ];
    });
    if (changes.length > 0) {
      await recordAudit(
        actor,
        {
          action: "allocation.updated",
          entity: { type: "period", id: periodId },
          summary: `Umlageschlüssel ${period.year}`,
          details: { changes },
        },
        tx,
      );
    }
  });
}

/** Übernimmt Wohnfläche und Personen erneut aus den Stammdaten (Verbrauchswerte bleiben). */
export async function resetAllocationValuesFromUnits(
  actor: SessionUser,
  periodId: number,
): Promise<void> {
  authorizeGlobalWrite(actor, "period:write");
  const period = await getVisiblePeriod(actor, periodId);
  assertDraft(period);

  await getDb().transaction(async (tx) => {
    await seedAllocationValues(tx, periodId, { overwrite: true });
    await recordAudit(
      actor,
      {
        action: "allocation.reset",
        entity: { type: "period", id: periodId },
        summary: `Umlageschlüssel ${period.year}`,
        details: { note: "Wohnfläche und Personen aus den Stammdaten der TOPs übernommen." },
      },
      tx,
    );
  });
}
