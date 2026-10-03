import "server-only";

import { asc, count, eq, max } from "drizzle-orm";

import { authorizeGlobalWrite, getDataScope } from "@/auth/rbac";
import { getDb } from "@/db/client";
import { allocationKeys, costCategories, costs, units } from "@/db/schema";
import { diffSnapshots, snapshotValues, type AuditSnapshot } from "@/lib/audit";
import { DomainError, NotFoundError } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import type { AllocationKeyInput, CategoryInput, UnitInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type { AllocationKeyDto, CategoryDto, UnitDto } from "@/types/billing";

import { recordAudit } from "./audit.service";

// Anzeigewerte fürs Audit-Log.
const yesNo = (value: boolean) => (value ? "Ja" : "Nein");

function unitSnapshot(row: typeof units.$inferSelect): AuditSnapshot {
  return {
    Name: row.name,
    Wohnfläche: row.areaSqm === null ? null : `${formatNumber(Number(row.areaSqm))} m²`,
    Personen: row.persons === null ? null : String(row.persons),
    Notiz: row.notes,
  };
}

function keySnapshot(row: typeof allocationKeys.$inferSelect): AuditSnapshot {
  return {
    Name: row.name,
    Einheit: row.unitLabel || null,
    Beschreibung: row.description,
    Aktiv: yesNo(row.isActive),
  };
}

function categorySnapshot(
  row: typeof costCategories.$inferSelect,
  keys: { id: number; name: string }[],
): AuditSnapshot {
  return {
    Name: row.name,
    Beschreibung: row.description,
    "Standard-Umlageschlüssel": keys.find((key) => key.id === row.defaultAllocationKeyId)?.name ?? null,
    Aktiv: yesNo(row.isActive),
  };
}

const keyNames = () => getDb().select({ id: allocationKeys.id, name: allocationKeys.name }).from(allocationKeys);

// ---------------------------------------------------------------------------
// Wohneinheiten
// ---------------------------------------------------------------------------

function toUnitDto(row: typeof units.$inferSelect): UnitDto {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    areaSqm: row.areaSqm === null ? null : Number(row.areaSqm),
    persons: row.persons,
    notes: row.notes,
  };
}

/** Alle TOPs – bzw. nur die eigene, wenn scope:all_units fehlt. */
export async function listUnits(actor: SessionUser): Promise<UnitDto[]> {
  const scope = getDataScope(actor);
  const rows = await getDb().select().from(units).orderBy(asc(units.number));
  return rows.filter((row) => scope.allUnits || row.id === scope.unitId).map(toUnitDto);
}

export async function updateUnit(
  actor: SessionUser,
  unitId: number,
  input: UnitInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "masterdata:write");
  const db = getDb();
  const [before] = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  const [row] = await db
    .update(units)
    .set({
      name: input.name,
      areaSqm: input.areaSqm,
      persons: input.persons,
      notes: input.notes,
    })
    .where(eq(units.id, unitId))
    .returning();
  if (!row) throw new NotFoundError("Die TOP wurde nicht gefunden.");

  await recordAudit(actor, {
    action: "unit.updated",
    entity: { type: "unit", id: unitId },
    summary: row.name,
    details: { changes: diffSnapshots(before ? unitSnapshot(before) : {}, unitSnapshot(row)) },
  });
}

// ---------------------------------------------------------------------------
// Umlageschlüssel
// ---------------------------------------------------------------------------

function toKeyDto(row: typeof allocationKeys.$inferSelect): AllocationKeyDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unitLabel: row.unitLabel,
    source: row.source,
    description: row.description,
    isSystem: row.isSystem,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

export async function listAllocationKeys(): Promise<AllocationKeyDto[]> {
  const rows = await getDb()
    .select()
    .from(allocationKeys)
    .orderBy(asc(allocationKeys.sortOrder), asc(allocationKeys.name));
  return rows.map(toKeyDto);
}

/** Eigene Schlüssel sind immer „manual“ – Werte werden je Abrechnungsjahr erfasst. */
export async function createAllocationKey(
  actor: SessionUser,
  input: AllocationKeyInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "masterdata:write");
  const db = getDb();
  const [{ last }] = await db.select({ last: max(allocationKeys.sortOrder) }).from(allocationKeys);

  const [row] = await db
    .insert(allocationKeys)
    .values({
      code: `custom_${Date.now().toString(36)}`,
      name: input.name,
      unitLabel: input.unitLabel,
      description: input.description,
      source: "manual",
      isActive: input.isActive,
      sortOrder: (last ?? 0) + 10,
    })
    .returning();

  await recordAudit(actor, {
    action: "allocation_key.created",
    entity: { type: "allocation_key", id: row.id },
    summary: `Umlageschlüssel ${row.name}`,
    details: { values: snapshotValues(keySnapshot(row)) },
  });
}

export async function updateAllocationKey(
  actor: SessionUser,
  keyId: number,
  input: AllocationKeyInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "masterdata:write");
  const db = getDb();
  const [before] = await db.select().from(allocationKeys).where(eq(allocationKeys.id, keyId)).limit(1);
  const [row] = await db
    .update(allocationKeys)
    .set({
      name: input.name,
      unitLabel: input.unitLabel,
      description: input.description,
      isActive: input.isActive,
    })
    .where(eq(allocationKeys.id, keyId))
    .returning();
  if (!row) throw new NotFoundError("Der Umlageschlüssel wurde nicht gefunden.");

  await recordAudit(actor, {
    action: "allocation_key.updated",
    entity: { type: "allocation_key", id: keyId },
    summary: `Umlageschlüssel ${row.name}`,
    details: { changes: diffSnapshots(before ? keySnapshot(before) : {}, keySnapshot(row)) },
  });
}

export async function deleteAllocationKey(actor: SessionUser, keyId: number): Promise<void> {
  authorizeGlobalWrite(actor, "masterdata:write");
  const db = getDb();
  const [key] = await db.select().from(allocationKeys).where(eq(allocationKeys.id, keyId)).limit(1);
  if (!key) throw new NotFoundError("Der Umlageschlüssel wurde nicht gefunden.");
  if (key.isSystem) throw new DomainError("Standard-Umlageschlüssel können nicht gelöscht werden.");

  const [{ n }] = await db
    .select({ n: count() })
    .from(costs)
    .where(eq(costs.allocationKeyId, keyId));
  if (n > 0) {
    throw new DomainError(
      `Der Schlüssel wird von ${n} Kostenposition(en) verwendet. Du kannst ihn stattdessen deaktivieren.`,
    );
  }

  await db.delete(allocationKeys).where(eq(allocationKeys.id, keyId));
  await recordAudit(actor, {
    action: "allocation_key.deleted",
    entity: { type: "allocation_key", id: keyId },
    summary: `Umlageschlüssel ${key.name}`,
    details: { values: snapshotValues(keySnapshot(key)) },
  });
}

// ---------------------------------------------------------------------------
// Kostenarten
// ---------------------------------------------------------------------------

function toCategoryDto(row: typeof costCategories.$inferSelect): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultAllocationKeyId: row.defaultAllocationKeyId,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

export async function listCategories(): Promise<CategoryDto[]> {
  const rows = await getDb()
    .select()
    .from(costCategories)
    .orderBy(asc(costCategories.sortOrder), asc(costCategories.name));
  return rows.map(toCategoryDto);
}

export async function createCategory(actor: SessionUser, input: CategoryInput): Promise<void> {
  authorizeGlobalWrite(actor, "masterdata:write");
  const db = getDb();
  const [{ last }] = await db.select({ last: max(costCategories.sortOrder) }).from(costCategories);

  const [row] = await db
    .insert(costCategories)
    .values({
      name: input.name,
      description: input.description,
      defaultAllocationKeyId: input.defaultAllocationKeyId,
      isActive: input.isActive,
      sortOrder: (last ?? 0) + 10,
    })
    .returning();

  await recordAudit(actor, {
    action: "category.created",
    entity: { type: "category", id: row.id },
    summary: `Kostenart ${row.name}`,
    details: { values: snapshotValues(categorySnapshot(row, await keyNames())) },
  });
}

export async function updateCategory(
  actor: SessionUser,
  categoryId: number,
  input: CategoryInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "masterdata:write");
  const db = getDb();
  const [before] = await db
    .select()
    .from(costCategories)
    .where(eq(costCategories.id, categoryId))
    .limit(1);
  const [row] = await db
    .update(costCategories)
    .set({
      name: input.name,
      description: input.description,
      defaultAllocationKeyId: input.defaultAllocationKeyId,
      isActive: input.isActive,
    })
    .where(eq(costCategories.id, categoryId))
    .returning();
  if (!row) throw new NotFoundError("Die Kostenart wurde nicht gefunden.");

  const keys = await keyNames();
  await recordAudit(actor, {
    action: "category.updated",
    entity: { type: "category", id: categoryId },
    summary: `Kostenart ${row.name}`,
    details: {
      changes: diffSnapshots(before ? categorySnapshot(before, keys) : {}, categorySnapshot(row, keys)),
    },
  });
}

export async function deleteCategory(actor: SessionUser, categoryId: number): Promise<void> {
  authorizeGlobalWrite(actor, "masterdata:write");
  const db = getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(costs)
    .where(eq(costs.categoryId, categoryId));
  if (n > 0) {
    throw new DomainError(
      `Die Kostenart wird von ${n} Kostenposition(en) verwendet. Du kannst sie stattdessen deaktivieren.`,
    );
  }

  const [row] = await db
    .delete(costCategories)
    .where(eq(costCategories.id, categoryId))
    .returning();
  if (!row) throw new NotFoundError("Die Kostenart wurde nicht gefunden.");

  await recordAudit(actor, {
    action: "category.deleted",
    entity: { type: "category", id: categoryId },
    summary: `Kostenart ${row.name}`,
    details: { values: snapshotValues(categorySnapshot(row, await keyNames())) },
  });
}
