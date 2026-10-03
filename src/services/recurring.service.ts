import "server-only";

import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { authorize, authorizeGlobalWrite, can, getDataScope } from "@/auth/rbac";
import { getDb, type DbExecutor } from "@/db/client";
import {
  allocationKeys,
  costCategories,
  costs,
  costUnits,
  recurringCosts,
  recurringCostUnits,
  units,
} from "@/db/schema";
import { diffSnapshots, snapshotValues } from "@/lib/audit";
import { recurringDescription, recurringSlots } from "@/lib/billing/recurring";
import { DomainError, NotFoundError } from "@/lib/errors";
import type { RecurringCostInput, RecurringGenerateInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type { RecurringCostDto } from "@/types/billing";

import { describeCost, describeRecurringCost } from "./audit-snapshots";
import { recordAudit } from "./audit.service";
import { assertDraft, getSubmittablePeriod, getVisiblePeriod } from "./periods.service";

/**
 * Vorlagen für wiederkehrende Kosten. Eine Vorlage zählt in keiner Abrechnung – aus ihr
 * entstehen gewöhnliche Kostenpositionen, die danach unabhängig von der Vorlage bleiben:
 * Änderungen an der Vorlage wirken nur auf künftig erzeugte Positionen.
 *
 * Sehen und verwenden darf Vorlagen, wer `recurring:read` hat – ohne Blick auf alle TOPs nur
 * aktive Vorlagen, an denen die eigene TOP beteiligt ist. Anlegen, Ändern und Löschen sind
 * eigene Rechte der Verwaltung.
 */
export async function listRecurringCosts(actor: SessionUser): Promise<RecurringCostDto[]> {
  authorize(actor, "recurring:read");
  const scope = getDataScope(actor);
  const db = getDb();

  const rows = await db
    .select({
      template: recurringCosts,
      categoryName: costCategories.name,
      allocationKeyName: allocationKeys.name,
    })
    .from(recurringCosts)
    .innerJoin(costCategories, eq(costCategories.id, recurringCosts.categoryId))
    .innerJoin(allocationKeys, eq(allocationKeys.id, recurringCosts.allocationKeyId))
    .orderBy(asc(costCategories.sortOrder), asc(recurringCosts.description), asc(recurringCosts.id));
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.template.id);
  const [unitRows, generatedRows] = await Promise.all([
    db
      .select()
      .from(recurringCostUnits)
      .where(inArray(recurringCostUnits.recurringCostId, ids))
      .orderBy(asc(recurringCostUnits.unitId)),
    db
      .select({
        recurringCostId: costs.recurringCostId,
        periodId: costs.periodId,
        start: costs.servicePeriodStart,
      })
      .from(costs)
      .where(and(inArray(costs.recurringCostId, ids), ne(costs.reviewStatus, "rejected"))),
  ]);

  return rows
    .map(({ template, categoryName, allocationKeyName }) => {
      const generated: Record<number, string[]> = {};
      for (const row of generatedRows) {
        if (row.recurringCostId !== template.id || row.start === null) continue;
        (generated[row.periodId] ??= []).push(row.start);
      }
      return {
        id: template.id,
        categoryId: template.categoryId,
        categoryName,
        description: template.description,
        amountType: template.amountType,
        amountCents: template.amountCents,
        interval: template.interval,
        supplier: template.supplier,
        allocationKeyId: template.allocationKeyId,
        allocationKeyName,
        unitIds: unitRows
          .filter((row) => row.recurringCostId === template.id)
          .map((row) => row.unitId),
        notes: template.notes,
        isActive: template.isActive,
        generated,
      };
    })
    .filter(
      (template) =>
        scope.allUnits ||
        (template.isActive && scope.unitId !== null && template.unitIds.includes(scope.unitId)),
    );
}

/** Prüft, dass Kostenart, Schlüssel und TOPs existieren – IDs kommen vom Client. */
async function assertReferences(tx: DbExecutor, input: RecurringCostInput): Promise<void> {
  const [category] = await tx
    .select({ id: costCategories.id })
    .from(costCategories)
    .where(eq(costCategories.id, input.categoryId))
    .limit(1);
  if (!category) throw new DomainError("Die Kostenart wurde nicht gefunden.");

  const [key] = await tx
    .select({ id: allocationKeys.id })
    .from(allocationKeys)
    .where(eq(allocationKeys.id, input.allocationKeyId))
    .limit(1);
  if (!key) throw new DomainError("Der Umlageschlüssel wurde nicht gefunden.");

  const unitRows = await tx.select({ id: units.id }).from(units).where(inArray(units.id, input.unitIds));
  if (unitRows.length !== new Set(input.unitIds).size) {
    throw new DomainError("Mindestens eine ausgewählte TOP wurde nicht gefunden.");
  }
}

function toColumns(input: RecurringCostInput) {
  return {
    categoryId: input.categoryId,
    description: input.description,
    amountType: input.amountType,
    amountCents: input.amount,
    interval: input.interval,
    supplier: input.supplier,
    allocationKeyId: input.allocationKeyId,
    notes: input.notes,
    isActive: input.isActive,
  };
}

async function replaceUnits(tx: DbExecutor, recurringCostId: number, unitIds: number[]) {
  await tx.delete(recurringCostUnits).where(eq(recurringCostUnits.recurringCostId, recurringCostId));
  await tx
    .insert(recurringCostUnits)
    .values([...new Set(unitIds)].map((unitId) => ({ recurringCostId, unitId })));
}

export async function createRecurringCost(
  actor: SessionUser,
  input: RecurringCostInput,
): Promise<number> {
  authorizeGlobalWrite(actor, "recurring:write");

  return getDb().transaction(async (tx) => {
    await assertReferences(tx, input);
    const [row] = await tx
      .insert(recurringCosts)
      .values({ ...toColumns(input), createdBy: actor.id })
      .returning({ id: recurringCosts.id });
    await replaceUnits(tx, row.id, input.unitIds);

    const created = await describeRecurringCost(tx, row.id);
    if (created) {
      await recordAudit(
        actor,
        {
          action: "recurring.created",
          entity: { type: "recurring_cost", id: row.id },
          summary: created.summary,
          details: { values: snapshotValues(created.snapshot) },
        },
        tx,
      );
    }
    return row.id;
  });
}

/** Ändert die Vorlage. Bereits erzeugte Kostenpositionen bleiben, wie sie sind. */
export async function updateRecurringCost(
  actor: SessionUser,
  recurringCostId: number,
  input: RecurringCostInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "recurring:write");

  await getDb().transaction(async (tx) => {
    await assertReferences(tx, input);
    const before = await describeRecurringCost(tx, recurringCostId);
    if (!before) throw new NotFoundError("Die Vorlage wurde nicht gefunden.");

    await tx.update(recurringCosts).set(toColumns(input)).where(eq(recurringCosts.id, recurringCostId));
    await replaceUnits(tx, recurringCostId, input.unitIds);

    const after = await describeRecurringCost(tx, recurringCostId);
    if (after) {
      await recordAudit(
        actor,
        {
          action: "recurring.updated",
          entity: { type: "recurring_cost", id: recurringCostId },
          summary: after.summary,
          details: { changes: diffSnapshots(before.snapshot, after.snapshot) },
        },
        tx,
      );
    }
  });
}

/**
 * Löscht die Vorlage. Daraus erzeugte Kostenpositionen bleiben bestehen und verlieren nur den
 * Herkunftsvermerk (ON DELETE SET NULL).
 */
export async function deleteRecurringCost(actor: SessionUser, recurringCostId: number): Promise<void> {
  authorizeGlobalWrite(actor, "recurring:delete");

  await getDb().transaction(async (tx) => {
    const deleted = await describeRecurringCost(tx, recurringCostId);
    if (!deleted) throw new NotFoundError("Die Vorlage wurde nicht gefunden.");

    await tx.delete(recurringCosts).where(eq(recurringCosts.id, recurringCostId));
    await recordAudit(
      actor,
      {
        action: "recurring.deleted",
        entity: { type: "recurring_cost", id: recurringCostId },
        summary: deleted.summary,
        details: { values: snapshotValues(deleted.snapshot) },
      },
      tx,
    );
  });
}

/**
 * Erzeugt aus einer Vorlage je gewähltem Zeitraum eine Kostenposition: Kostenart, Beschreibung
 * (mit angehängtem Zeitraum), Rechnungssteller, Umlageschlüssel und TOP-Zuordnung kommen aus
 * der Vorlage, der Betrag aus dem Formular (vorbelegt mit dem Betrag der Vorlage). Der
 * Zeitraum wird zum Leistungszeitraum, sein erster Tag zum Rechnungsdatum.
 *
 * Wer Kosten direkt erfassen darf, legt freigegebene Positionen an. Alle anderen reichen sie –
 * wie jede Kostenposition – zur Prüfung ein; Schlüssel und TOPs stammen dann aus der Vorlage
 * statt aus der Vorbelegung der Kostenart.
 *
 * Gibt die Zahl der erzeugten Positionen zurück.
 */
export async function generateCostsFromTemplate(
  actor: SessionUser,
  recurringCostId: number,
  input: RecurringGenerateInput,
): Promise<number> {
  authorize(actor, "recurring:read");
  const direct = can(actor, "cost:write") && getDataScope(actor).allUnits;
  if (!direct) authorize(actor, "cost:submit");

  // Über listRecurringCosts: was der Benutzer nicht sieht, kann er auch nicht verwenden.
  const template = (await listRecurringCosts(actor)).find((entry) => entry.id === recurringCostId);
  if (!template) throw new NotFoundError("Die Vorlage wurde nicht gefunden.");
  if (!template.isActive) {
    throw new DomainError("Die Vorlage ist deaktiviert. Aktiviere sie, um Kosten daraus zu erzeugen.");
  }

  const period = direct
    ? await getVisiblePeriod(actor, input.periodId)
    : await getSubmittablePeriod(actor, input.periodId);
  assertDraft(period);

  const available = recurringSlots(template.interval, period.year);
  const slots = [...new Set(input.slots)]
    .sort((a, b) => a - b)
    .map((index) => available.find((slot) => slot.index === index));
  if (slots.some((slot) => slot === undefined)) throw new DomainError("Ungültiger Zeitraum.");

  return getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ start: costs.servicePeriodStart })
      .from(costs)
      .where(
        and(
          eq(costs.recurringCostId, recurringCostId),
          eq(costs.periodId, period.id),
          ne(costs.reviewStatus, "rejected"),
        ),
      );
    const taken = new Set(existing.map((row) => row.start));
    const duplicates = slots.filter((slot) => taken.has(slot!.start));
    if (duplicates.length > 0) {
      throw new DomainError(
        `Für ${duplicates.map((slot) => slot!.label).join(", ")} gibt es bereits eine Kostenposition aus dieser Vorlage.`,
      );
    }

    for (const slot of slots) {
      const [row] = await tx
        .insert(costs)
        .values({
          periodId: period.id,
          categoryId: template.categoryId,
          description: recurringDescription(template.description, slot!),
          amountCents: input.amount,
          costDate: slot!.start,
          supplier: template.supplier,
          servicePeriodStart: slot!.start,
          servicePeriodEnd: slot!.end,
          allocationKeyId: template.allocationKeyId,
          recurringCostId,
          createdBy: actor.id,
          // Eingereichtes zählt erst nach der Prüfung durch die Verwaltung.
          ...(direct ? {} : { reviewStatus: "pending" as const }),
        })
        .returning({ id: costs.id });
      await tx
        .insert(costUnits)
        .values(template.unitIds.map((unitId) => ({ costId: row.id, unitId })));

      const created = await describeCost(tx, row.id);
      if (created) {
        await recordAudit(
          actor,
          {
            action: direct ? "cost.created" : "cost.submitted",
            entity: { type: "cost", id: row.id },
            summary: created.summary,
            details: {
              values: snapshotValues(created.snapshot),
              note: `Aus der Vorlage „${template.description}“ erzeugt.`,
            },
          },
          tx,
        );
      }
    }
    return slots.length;
  });
}
