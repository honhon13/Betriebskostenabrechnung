import "server-only";

import { asc, count, desc, eq, inArray } from "drizzle-orm";

import { ForbiddenError } from "@/auth/errors";
import { authorize, authorizeGlobalWrite, getDataScope } from "@/auth/rbac";
import { getDb, type DbExecutor } from "@/db/client";
import {
  allocationKeys,
  costCategories,
  costs,
  costUnits,
  documentLinks,
  units,
} from "@/db/schema";
import { diffSnapshots, snapshotValues } from "@/lib/audit";
import { DomainError, NotFoundError } from "@/lib/errors";
import type { CostInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type { CostDto, OcrFields } from "@/types/billing";

import { describeCost } from "./audit-snapshots";
import { recordAudit } from "./audit.service";
import { getDocumentRefs } from "./documents.service";
import { assertDraft, getVisiblePeriod } from "./periods.service";

/** Vollständige Kostenliste eines Jahres – Sicht der Verwaltung auf alle TOPs. */
export async function listCosts(actor: SessionUser, periodId: number): Promise<CostDto[]> {
  authorize(actor, "cost:read");
  if (!getDataScope(actor).allUnits) throw new ForbiddenError();
  await getVisiblePeriod(actor, periodId);

  const db = getDb();
  const rows = await db
    .select({
      cost: costs,
      categoryName: costCategories.name,
      allocationKeyName: allocationKeys.name,
    })
    .from(costs)
    .innerJoin(costCategories, eq(costCategories.id, costs.categoryId))
    .innerJoin(allocationKeys, eq(allocationKeys.id, costs.allocationKeyId))
    .where(eq(costs.periodId, periodId))
    .orderBy(desc(costs.costDate), desc(costs.id));
  if (rows.length === 0) return [];

  const costIds = rows.map((row) => row.cost.id);
  const [unitRows, documentRefs] = await Promise.all([
    db
      .select()
      .from(costUnits)
      .where(inArray(costUnits.costId, costIds))
      .orderBy(asc(costUnits.unitId)),
    getDocumentRefs("cost", costIds),
  ]);

  return rows.map(({ cost, categoryName, allocationKeyName }) => ({
    id: cost.id,
    periodId: cost.periodId,
    categoryId: cost.categoryId,
    categoryName,
    description: cost.description,
    amountCents: cost.amountCents,
    costDate: cost.costDate,
    supplier: cost.supplier,
    invoiceNumber: cost.invoiceNumber,
    servicePeriodStart: cost.servicePeriodStart,
    servicePeriodEnd: cost.servicePeriodEnd,
    netAmountCents: cost.netAmountCents,
    taxAmountCents: cost.taxAmountCents,
    allocationKeyId: cost.allocationKeyId,
    allocationKeyName,
    notes: cost.notes,
    unitIds: unitRows.filter((u) => u.costId === cost.id).map((u) => u.unitId),
    documents: documentRefs.get(cost.id) ?? [],
    createdAt: cost.createdAt.toISOString(),
    reviewStatus: cost.reviewStatus,
    reviewedAt: cost.reviewedAt?.toISOString() ?? null,
    reviewComment: cost.reviewComment,
  }));
}

/** Prüft, dass Kostenart, Schlüssel und TOPs existieren – IDs kommen vom Client. */
async function assertReferences(tx: DbExecutor, input: CostInput): Promise<void> {
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

  const unitRows = await tx
    .select({ id: units.id })
    .from(units)
    .where(inArray(units.id, input.unitIds));
  if (unitRows.length !== new Set(input.unitIds).size) {
    throw new DomainError("Mindestens eine ausgewählte TOP wurde nicht gefunden.");
  }
}

function toColumns(input: CostInput) {
  return {
    categoryId: input.categoryId,
    description: input.description,
    amountCents: input.amount,
    costDate: input.costDate,
    supplier: input.supplier,
    invoiceNumber: input.invoiceNumber,
    servicePeriodStart: input.servicePeriodStart,
    servicePeriodEnd: input.servicePeriodEnd,
    netAmountCents: input.netAmount,
    taxAmountCents: input.taxAmount,
    allocationKeyId: input.allocationKeyId,
    notes: input.notes,
  };
}

/** Legt eine Kostenposition im Abrechnungsjahr `input.periodId` an und gibt ihre ID zurück. */
export async function createCost(actor: SessionUser, input: CostInput): Promise<number> {
  authorizeGlobalWrite(actor, "cost:write");
  assertDraft(await getVisiblePeriod(actor, input.periodId));

  return getDb().transaction(async (tx) => {
    await assertReferences(tx, input);
    const [row] = await tx
      .insert(costs)
      .values({ ...toColumns(input), periodId: input.periodId, createdBy: actor.id })
      .returning({ id: costs.id });
    await tx
      .insert(costUnits)
      .values([...new Set(input.unitIds)].map((unitId) => ({ costId: row.id, unitId })));

    const created = await describeCost(tx, row.id);
    if (created) {
      await recordAudit(
        actor,
        {
          action: "cost.created",
          entity: { type: "cost", id: row.id },
          summary: created.summary,
          details: { values: snapshotValues(created.snapshot) },
        },
        tx,
      );
    }
    return row.id;
  });
}

async function getCostPeriod(costId: number) {
  const [row] = await getDb()
    .select({ periodId: costs.periodId })
    .from(costs)
    .where(eq(costs.id, costId))
    .limit(1);
  if (!row) throw new NotFoundError("Die Kostenposition wurde nicht gefunden.");
  return row.periodId;
}

export async function updateCost(
  actor: SessionUser,
  costId: number,
  input: CostInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "cost:write");
  const currentPeriodId = await getCostPeriod(costId);
  assertDraft(await getVisiblePeriod(actor, currentPeriodId));

  const moving = input.periodId !== currentPeriodId;
  if (moving) {
    // Auch das Zieljahr muss noch bearbeitbar sein.
    assertDraft(await getVisiblePeriod(actor, input.periodId));
    // Dokumente gehören zu einem Abrechnungsjahr – eine verknüpfte Position kann nicht wandern.
    const [{ n }] = await getDb()
      .select({ n: count() })
      .from(documentLinks)
      .where(eq(documentLinks.costId, costId));
    if (n > 0) {
      throw new DomainError(
        "Die Kostenposition hat verknüpfte Dokumente. Bitte zuerst die Verknüpfung lösen, " +
          "dann das Abrechnungsjahr ändern.",
      );
    }
  }

  await getDb().transaction(async (tx) => {
    await assertReferences(tx, input);
    const before = await describeCost(tx, costId);
    await tx
      .update(costs)
      .set({ ...toColumns(input), periodId: input.periodId })
      .where(eq(costs.id, costId));
    await tx.delete(costUnits).where(eq(costUnits.costId, costId));
    await tx
      .insert(costUnits)
      .values([...new Set(input.unitIds)].map((unitId) => ({ costId, unitId })));

    const after = await describeCost(tx, costId);
    if (before && after) {
      await recordAudit(
        actor,
        {
          action: "cost.updated",
          entity: { type: "cost", id: costId },
          summary: after.summary,
          details: { changes: diffSnapshots(before.snapshot, after.snapshot) },
        },
        tx,
      );
    }
  });
}

/** Verknüpfte Dokumente bleiben erhalten und verlieren nur die Zuordnung. */
export async function deleteCost(actor: SessionUser, costId: number): Promise<void> {
  authorizeGlobalWrite(actor, "cost:delete");
  assertDraft(await getVisiblePeriod(actor, await getCostPeriod(costId)));

  await getDb().transaction(async (tx) => {
    const deleted = await describeCost(tx, costId);
    await tx.delete(costs).where(eq(costs.id, costId));
    if (deleted) {
      await recordAudit(
        actor,
        {
          action: "cost.deleted",
          entity: { type: "cost", id: costId },
          summary: deleted.summary,
          details: { values: snapshotValues(deleted.snapshot) },
        },
        tx,
      );
    }
  });
}

/**
 * Ergänzt leere Rechnungsfelder einer Kostenposition (Datum, Rechnungssteller, Rechnungsnummer,
 * Leistungszeitraum, Netto, MwSt.) mit den Werten, die die OCR im angehängten Beleg erkannt hat.
 * Eingetragenes bleibt stehen; Beschreibung und Betrag stammen immer aus dem Formular.
 *
 * Für Belege, die erst beim Speichern mitgeschickt werden. Liest das Formular den Beleg schon
 * vorher aus (ReceiptCapture), stehen die erkannten Werte bereits in den Feldern.
 */
export async function fillCostFromOcr(
  actor: SessionUser,
  costId: number,
  fields: Pick<
    OcrFields,
    | "documentDate"
    | "supplier"
    | "invoiceNumber"
    | "servicePeriodStart"
    | "servicePeriodEnd"
    | "netAmountCents"
    | "taxAmountCents"
  >,
): Promise<void> {
  authorizeGlobalWrite(actor, "cost:write");
  const db = getDb();
  const [cost] = await db.select().from(costs).where(eq(costs.id, costId)).limit(1);
  if (!cost) throw new NotFoundError("Die Kostenposition wurde nicht gefunden.");

  const patch = {
    ...(cost.costDate === null && fields.documentDate ? { costDate: fields.documentDate } : {}),
    ...(cost.supplier === null && fields.supplier ? { supplier: fields.supplier } : {}),
    ...(cost.invoiceNumber === null && fields.invoiceNumber
      ? { invoiceNumber: fields.invoiceNumber }
      : {}),
    // Den Leistungszeitraum nur als Paar übernehmen – ein halb erkannter könnte dem Eingetragenen widersprechen.
    ...(cost.servicePeriodStart === null && cost.servicePeriodEnd === null
      ? {
          ...(fields.servicePeriodStart ? { servicePeriodStart: fields.servicePeriodStart } : {}),
          ...(fields.servicePeriodEnd ? { servicePeriodEnd: fields.servicePeriodEnd } : {}),
        }
      : {}),
    ...(cost.netAmountCents === null && fields.netAmountCents !== null
      ? { netAmountCents: fields.netAmountCents }
      : {}),
    ...(cost.taxAmountCents === null && fields.taxAmountCents !== null
      ? { taxAmountCents: fields.taxAmountCents }
      : {}),
  };
  if (Object.keys(patch).length === 0) return;

  await db.transaction(async (tx) => {
    const before = await describeCost(tx, costId);
    await tx.update(costs).set(patch).where(eq(costs.id, costId));
    const after = await describeCost(tx, costId);
    if (before && after) {
      await recordAudit(
        actor,
        {
          action: "cost.updated",
          entity: { type: "cost", id: costId },
          summary: after.summary,
          details: {
            changes: diffSnapshots(before.snapshot, after.snapshot),
            note: "Leere Rechnungsfelder per OCR aus dem Beleg ergänzt.",
          },
        },
        tx,
      );
    }
  });
}
