import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { ForbiddenError } from "@/auth/errors";
import { authorize } from "@/auth/rbac";
import { seedAllocationValues } from "@/db/allocation-defaults";
import { getDb, type DbExecutor } from "@/db/client";
import {
  allocationKeys,
  billingPeriods,
  costCategories,
  costs,
  costUnits,
  documentFiles,
  documentLinks,
  documents,
  payments,
  units,
} from "@/db/schema";
import { DomainError, NotFoundError } from "@/lib/errors";
import { sanitizeFileName } from "@/lib/files";
import { formatCents, formatDate } from "@/lib/format";
import type {
  CostSubmissionInput,
  DocumentMetaInput,
  PaymentSubmissionInput,
  PeriodInput,
} from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type { DocumentDto, DocumentRef, PeriodDto, PeriodStatus, ReviewInfo } from "@/types/billing";

import {
  checkUpload,
  getDocumentRefs,
  listDocuments,
  type LinkOption,
  type UploadedFile,
} from "./documents.service";
import { assertDraft, getSubmittablePeriod, toPeriodDto } from "./periods.service";

/**
 * Einreichen durch Benutzer: Jeder Eintrag entsteht mit „ausstehender Prüfung“ und zählt
 * erst nach Freigabe durch die Verwaltung. Bearbeiten darf man nur eigene Einträge – und
 * jede Änderung setzt den Eintrag zurück auf „ausstehende Prüfung“, auch wenn er schon
 * freigegeben war. Löschen können Benutzer nichts.
 */
const PENDING = {
  reviewStatus: "pending",
  reviewedAt: null,
  reviewedBy: null,
  reviewComment: null,
} as const;

function review(row: {
  reviewStatus: ReviewInfo["reviewStatus"];
  reviewedAt: Date | null;
  reviewComment: string | null;
}): ReviewInfo {
  return {
    reviewStatus: row.reviewStatus,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewComment: row.reviewComment,
  };
}

// ---------------------------------------------------------------------------
// Abrechnungsjahre
// ---------------------------------------------------------------------------

/** Schlägt ein neues Abrechnungsjahr vor. Bis zur Prüfung sieht es nur der Einreicher und die Verwaltung. */
export async function submitPeriod(actor: SessionUser, input: PeriodInput): Promise<PeriodDto> {
  authorize(actor, "period:submit");

  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: billingPeriods.id })
      .from(billingPeriods)
      .where(eq(billingPeriods.year, input.year))
      .limit(1);
    if (existing) throw new DomainError(`Das Abrechnungsjahr ${input.year} gibt es bereits.`);

    const [row] = await tx
      .insert(billingPeriods)
      .values({
        year: input.year,
        startDate: `${input.year}-01-01`,
        endDate: `${input.year}-12-31`,
        notes: input.notes,
        createdBy: actor.id,
        ...PENDING,
      })
      .returning();
    await seedAllocationValues(tx, row.id, { overwrite: false });
    return toPeriodDto(row);
  });
}

// ---------------------------------------------------------------------------
// Kosten
// ---------------------------------------------------------------------------

function costColumns(input: CostSubmissionInput) {
  return {
    categoryId: input.categoryId,
    description: input.description,
    amountCents: input.amount,
    costDate: input.costDate,
    supplier: input.supplier,
    invoiceNumber: input.invoiceNumber,
    notes: input.notes,
  };
}

async function assertActiveCategory(tx: DbExecutor, categoryId: number) {
  const [category] = await tx
    .select()
    .from(costCategories)
    .where(and(eq(costCategories.id, categoryId), eq(costCategories.isActive, true)))
    .limit(1);
  if (!category) throw new DomainError("Die Kostenart wurde nicht gefunden.");
  return category;
}

/**
 * Reicht eine Kostenposition ein. Umlageschlüssel und TOP-Zuordnung sind Sache der
 * Verwaltung: vorbelegt wird der Standardschlüssel der Kostenart (sonst „Gleiche Teile“)
 * über alle TOPs; bei der Prüfung lässt sich beides anpassen.
 */
export async function submitCost(actor: SessionUser, input: CostSubmissionInput): Promise<number> {
  authorize(actor, "cost:submit");
  assertDraft(await getSubmittablePeriod(actor, input.periodId));

  return getDb().transaction(async (tx) => {
    const category = await assertActiveCategory(tx, input.categoryId);
    const keys = await tx.select().from(allocationKeys).orderBy(asc(allocationKeys.sortOrder));
    const key =
      keys.find((k) => k.id === category.defaultAllocationKeyId) ??
      keys.find((k) => k.source === "equal") ??
      keys[0];
    if (!key) throw new DomainError("Es ist kein Umlageschlüssel eingerichtet.");

    const [row] = await tx
      .insert(costs)
      .values({
        ...costColumns(input),
        periodId: input.periodId,
        allocationKeyId: key.id,
        createdBy: actor.id,
        ...PENDING,
      })
      .returning({ id: costs.id });

    const unitRows = await tx.select({ id: units.id }).from(units);
    await tx.insert(costUnits).values(unitRows.map((unit) => ({ costId: row.id, unitId: unit.id })));
    return row.id;
  });
}

/** Ändert eine selbst eingereichte Kostenposition – sie muss danach erneut geprüft werden. */
export async function updateOwnCost(
  actor: SessionUser,
  costId: number,
  input: CostSubmissionInput,
): Promise<void> {
  authorize(actor, "cost:submit");
  const db = getDb();
  const [cost] = await db.select().from(costs).where(eq(costs.id, costId)).limit(1);
  // Fremde Einträge verhalten sich wie nicht vorhandene.
  if (!cost || cost.createdBy !== actor.id) {
    throw new NotFoundError("Die Kostenposition wurde nicht gefunden.");
  }
  // Das Abrechnungsjahr bleibt, wie es ist – in veröffentlichten Jahren ändert sich nichts mehr.
  assertDraft(await getSubmittablePeriod(actor, cost.periodId));

  await db.transaction(async (tx) => {
    await assertActiveCategory(tx, input.categoryId);
    await tx
      .update(costs)
      .set({ ...costColumns(input), ...PENDING })
      .where(eq(costs.id, costId));
  });
}

// ---------------------------------------------------------------------------
// Einzahlungen
// ---------------------------------------------------------------------------

function requireOwnUnit(actor: SessionUser): number {
  if (actor.unitId === null) {
    throw new ForbiddenError("Deinem Konto ist keine TOP zugeordnet.");
  }
  return actor.unitId;
}

function paymentColumns(input: PaymentSubmissionInput) {
  return {
    paymentDate: input.paymentDate,
    amountCents: input.amount,
    purpose: input.purpose,
    note: input.note,
  };
}

/** Reicht eine Einzahlung für die eigene TOP ein. */
export async function submitPayment(
  actor: SessionUser,
  input: PaymentSubmissionInput,
): Promise<number> {
  authorize(actor, "payment:submit");
  const unitId = requireOwnUnit(actor);
  await getSubmittablePeriod(actor, input.periodId);

  const [row] = await getDb()
    .insert(payments)
    .values({
      ...paymentColumns(input),
      periodId: input.periodId,
      unitId,
      createdBy: actor.id,
      ...PENDING,
    })
    .returning({ id: payments.id });
  return row.id;
}

/** Ändert eine selbst eingereichte Einzahlung – sie muss danach erneut geprüft werden. */
export async function updateOwnPayment(
  actor: SessionUser,
  paymentId: number,
  input: PaymentSubmissionInput,
): Promise<void> {
  authorize(actor, "payment:submit");
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment || payment.createdBy !== actor.id) {
    throw new NotFoundError("Die Einzahlung wurde nicht gefunden.");
  }

  await db
    .update(payments)
    .set({ ...paymentColumns(input), ...PENDING })
    .where(eq(payments.id, paymentId));
}

// ---------------------------------------------------------------------------
// Dokumente
// ---------------------------------------------------------------------------

/** Benutzer dürfen ein Dokument nur mit eigenen Kosten und Einzahlungen desselben Jahres verknüpfen. */
async function assertOwnTargets(
  tx: DbExecutor,
  actor: SessionUser,
  periodId: number,
  meta: DocumentMetaInput,
): Promise<void> {
  const costIds = [...new Set(meta.costIds)];
  if (costIds.length > 0) {
    const found = await tx
      .select({ id: costs.id })
      .from(costs)
      .where(
        and(inArray(costs.id, costIds), eq(costs.periodId, periodId), eq(costs.createdBy, actor.id)),
      );
    if (found.length !== costIds.length) {
      throw new DomainError("Du kannst ein Dokument nur mit eigenen Kostenpositionen dieses Jahres verknüpfen.");
    }
  }
  if (meta.paymentId !== null) {
    const [payment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.id, meta.paymentId),
          eq(payments.periodId, periodId),
          eq(payments.createdBy, actor.id),
        ),
      )
      .limit(1);
    if (!payment) {
      throw new DomainError("Du kannst ein Dokument nur mit eigenen Einzahlungen dieses Jahres verknüpfen.");
    }
  }
}

function documentColumns(meta: DocumentMetaInput) {
  return {
    type: meta.type,
    description: meta.description,
    documentDate: meta.documentDate,
    supplier: meta.supplier,
    invoiceNumber: meta.invoiceNumber,
    servicePeriodStart: meta.servicePeriodStart,
    servicePeriodEnd: meta.servicePeriodEnd,
    netAmountCents: meta.netAmount,
    taxAmountCents: meta.taxAmount,
    amountCents: meta.amount,
  };
}

async function replaceOwnLinks(tx: DbExecutor, documentId: number, meta: DocumentMetaInput) {
  await tx.delete(documentLinks).where(eq(documentLinks.documentId, documentId));
  const rows = [
    ...[...new Set(meta.costIds)].map((costId) => ({ documentId, costId, paymentId: null })),
    ...(meta.paymentId === null ? [] : [{ documentId, costId: null, paymentId: meta.paymentId }]),
  ];
  if (rows.length > 0) await tx.insert(documentLinks).values(rows);
}

/**
 * Reicht ein Dokument ein. Es wird der eigenen TOP zugeordnet (die Angabe im Formular zählt
 * nicht) und ist bis zur Freigabe nur für den Einreicher und die Verwaltung sichtbar.
 */
export async function submitDocument(
  actor: SessionUser,
  periodId: number,
  file: UploadedFile,
  meta: DocumentMetaInput,
): Promise<number> {
  authorize(actor, "document:submit");
  await getSubmittablePeriod(actor, periodId);
  const { mimeType, sha256 } = await checkUpload(periodId, file);

  return getDb().transaction(async (tx) => {
    await assertOwnTargets(tx, actor, periodId, meta);
    const [row] = await tx
      .insert(documents)
      .values({
        ...documentColumns(meta),
        periodId,
        unitId: actor.unitId,
        fileName: sanitizeFileName(file.name),
        mimeType,
        sizeBytes: file.bytes.length,
        sha256,
        uploadedBy: actor.id,
        ...PENDING,
      })
      .returning({ id: documents.id });
    await tx.insert(documentFiles).values({ documentId: row.id, content: file.bytes });
    await replaceOwnLinks(tx, row.id, meta);
    return row.id;
  });
}

/** Ändert die Angaben zu einem selbst hochgeladenen Dokument – es muss danach erneut geprüft werden. */
export async function updateOwnDocument(
  actor: SessionUser,
  documentId: number,
  meta: DocumentMetaInput,
): Promise<void> {
  authorize(actor, "document:submit");
  const db = getDb();
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!document || document.uploadedBy !== actor.id) {
    throw new NotFoundError("Das Dokument wurde nicht gefunden.");
  }

  await db.transaction(async (tx) => {
    await assertOwnTargets(tx, actor, document.periodId, meta);
    await tx
      .update(documents)
      .set({ ...documentColumns(meta), ...PENDING })
      .where(eq(documents.id, documentId));
    await replaceOwnLinks(tx, documentId, meta);
  });
}

// ---------------------------------------------------------------------------
// Eigene Eingaben lesen
// ---------------------------------------------------------------------------

export interface OwnCostDto extends ReviewInfo {
  id: number;
  periodId: number;
  year: number;
  periodStatus: PeriodStatus;
  categoryId: number;
  categoryName: string;
  description: string;
  amountCents: number;
  costDate: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  documents: DocumentRef[];
  createdAt: string;
}

export interface OwnPaymentDto extends ReviewInfo {
  id: number;
  periodId: number;
  year: number;
  paymentDate: string;
  amountCents: number;
  purpose: string | null;
  note: string | null;
  documents: DocumentRef[];
  createdAt: string;
}

export interface OwnSubmissions {
  periods: PeriodDto[];
  costs: OwnCostDto[];
  payments: OwnPaymentDto[];
  documents: DocumentDto[];
  /** Eigene Kosten und Einzahlungen als Verknüpfungsziele für Dokumente. */
  linkOptions: { costs: LinkOption[]; payments: LinkOption[] };
}

/** Alles, was der Benutzer selbst eingereicht hat – in jedem Prüfstand. */
export async function listOwnSubmissions(actor: SessionUser): Promise<OwnSubmissions> {
  const db = getDb();
  const [periodRows, costRows, paymentRows, ownDocuments] = await Promise.all([
    db
      .select()
      .from(billingPeriods)
      .where(eq(billingPeriods.createdBy, actor.id))
      .orderBy(desc(billingPeriods.year)),
    db
      .select({
        cost: costs,
        year: billingPeriods.year,
        periodStatus: billingPeriods.status,
        categoryName: costCategories.name,
      })
      .from(costs)
      .innerJoin(billingPeriods, eq(billingPeriods.id, costs.periodId))
      .innerJoin(costCategories, eq(costCategories.id, costs.categoryId))
      .where(eq(costs.createdBy, actor.id))
      .orderBy(desc(costs.createdAt)),
    db
      .select({ payment: payments, year: billingPeriods.year })
      .from(payments)
      .innerJoin(billingPeriods, eq(billingPeriods.id, payments.periodId))
      .where(eq(payments.createdBy, actor.id))
      .orderBy(desc(payments.paymentDate), desc(payments.id)),
    // Dokumente laufen über listDocuments – dort ist das Leserecht geprüft.
    listDocuments(actor, { ownOnly: true }),
  ]);

  const [costDocuments, paymentDocuments] = await Promise.all([
    getDocumentRefs(
      "cost",
      costRows.map((row) => row.cost.id),
    ),
    getDocumentRefs(
      "payment",
      paymentRows.map((row) => row.payment.id),
    ),
  ]);

  const ownCosts = costRows.map(({ cost, year, periodStatus, categoryName }) => ({
    id: cost.id,
    periodId: cost.periodId,
    year,
    periodStatus,
    categoryId: cost.categoryId,
    categoryName,
    description: cost.description,
    amountCents: cost.amountCents,
    costDate: cost.costDate,
    supplier: cost.supplier,
    invoiceNumber: cost.invoiceNumber,
    notes: cost.notes,
    documents: costDocuments.get(cost.id) ?? [],
    createdAt: cost.createdAt.toISOString(),
    ...review(cost),
  }));
  const ownPayments = paymentRows.map(({ payment, year }) => ({
    id: payment.id,
    periodId: payment.periodId,
    year,
    paymentDate: payment.paymentDate,
    amountCents: payment.amountCents,
    purpose: payment.purpose,
    note: payment.note,
    documents: paymentDocuments.get(payment.id) ?? [],
    createdAt: payment.createdAt.toISOString(),
    ...review(payment),
  }));

  return {
    periods: periodRows.map(toPeriodDto),
    costs: ownCosts,
    payments: ownPayments,
    documents: ownDocuments,
    linkOptions: {
      costs: ownCosts.map((cost) => ({
        id: cost.id,
        periodId: cost.periodId,
        label: `${cost.categoryName} – ${cost.description} (${formatCents(cost.amountCents)})`,
      })),
      payments: ownPayments.map((payment) => ({
        id: payment.id,
        periodId: payment.periodId,
        label: `${formatDate(payment.paymentDate)} · ${formatCents(payment.amountCents)}`,
      })),
    },
  };
}
