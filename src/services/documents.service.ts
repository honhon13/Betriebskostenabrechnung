import "server-only";

import { createHash } from "node:crypto";

import { and, asc, count, desc, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { authorize, authorizeGlobalWrite, getDataScope, seesUnreviewed } from "@/auth/rbac";
import { getDb, type DbExecutor } from "@/db/client";
import {
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
import { diffSnapshots, snapshotValues, type AuditSnapshot } from "@/lib/audit";
import { DomainError, NotFoundError } from "@/lib/errors";
import {
  ALLOWED_FILE_TYPES,
  MAX_UPLOAD_BYTES,
  detectFileType,
  sanitizeFileName,
} from "@/lib/files";
import { formatCents, formatDate, formatFileSize } from "@/lib/format";
import type { DocumentMetaInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type {
  DocumentDto,
  DocumentLinkRef,
  DocumentRef,
  DocumentType,
  OcrFields,
  OcrOutcome,
} from "@/types/billing";

import { describeDocument } from "./audit-snapshots";
import { recordAudit } from "./audit.service";
import { getOcrService, OcrError, type OcrResult } from "./ocr";
import { getVisiblePeriod } from "./periods.service";

type DocumentRow = typeof documents.$inferSelect;

// ---------------------------------------------------------------------------
// Sichtbarkeit
// ---------------------------------------------------------------------------

/**
 * Ein Dokument betrifft eine TOP, wenn es ihr direkt zugeordnet ist, an einer
 * Kostenposition hängt, an der sie beteiligt ist, oder an einer ihrer Einzahlungen.
 */
function relevantToUnit(unitId: number): SQL {
  const db = getDb();
  return or(
    eq(documents.unitId, unitId),
    exists(
      db
        .select({ one: sql`1` })
        .from(documentLinks)
        .innerJoin(costUnits, eq(costUnits.costId, documentLinks.costId))
        .where(and(eq(documentLinks.documentId, documents.id), eq(costUnits.unitId, unitId))),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(documentLinks)
        .innerJoin(payments, eq(payments.id, documentLinks.paymentId))
        .where(and(eq(documentLinks.documentId, documents.id), eq(payments.unitId, unitId))),
    ),
  )!;
}

/**
 * Welche Dokumente ein Benutzer sehen darf (Liste, Vorschau, Download – überall dieselbe Regel):
 * – Wer prüft und alle TOPs sieht, sieht alles.
 * – Alle anderen sehen ihre selbst hochgeladenen Dokumente immer, fremde nur, wenn sie
 *   freigegeben sind, die eigene TOP betreffen und das Abrechnungsjahr veröffentlicht ist.
 * Nicht zugeordnete Dokumente sieht nur die Verwaltung.
 * Die Bedingung setzt einen Join auf billing_periods voraus.
 */
function visibilityCondition(actor: SessionUser): SQL | undefined {
  const scope = getDataScope(actor);
  const published = scope.includeDrafts ? undefined : eq(billingPeriods.status, "released");
  if (scope.allUnits && seesUnreviewed(actor)) return published;

  const own = eq(documents.uploadedBy, actor.id);
  if (!scope.allUnits && scope.unitId === null) return own;
  return or(
    own,
    and(
      eq(documents.reviewStatus, "approved"),
      published,
      scope.allUnits ? undefined : relevantToUnit(scope.unitId!),
    ),
  );
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export type DocumentSort = "newest" | "oldest" | "name";

export interface DocumentFilter {
  periodId?: number;
  /** Nur Dokumente, die diese TOP betreffen (nur mit Blick auf alle TOPs wirksam). */
  unitId?: number;
  type?: DocumentType;
  /** Volltext über Dateiname, Beschreibung, Rechnungssteller, Rechnungsnummer, Kostenposition. */
  search?: string;
  sort?: DocumentSort;
  limit?: number;
  /** Genau ein Dokument – für getDocument. */
  documentId?: number;
  /** Nur selbst hochgeladene Dokumente. */
  ownOnly?: boolean;
}

/** Lädt die Verknüpfungen zu Dokumenten – für eingeschränkte Benutzer nur die eigenen. */
async function loadLinks(
  actor: SessionUser,
  documentIds: number[],
): Promise<Map<number, { costs: DocumentLinkRef[]; payments: DocumentLinkRef[] }>> {
  const result = new Map<number, { costs: DocumentLinkRef[]; payments: DocumentLinkRef[] }>();
  for (const id of documentIds) result.set(id, { costs: [], payments: [] });
  if (documentIds.length === 0) return result;

  const db = getDb();
  const scope = getDataScope(actor);
  const rows = await db
    .select({
      documentId: documentLinks.documentId,
      costId: costs.id,
      costDescription: costs.description,
      categoryName: costCategories.name,
      paymentId: payments.id,
      paymentDate: payments.paymentDate,
      paymentAmount: payments.amountCents,
      paymentUnitId: payments.unitId,
      paymentUnitName: units.name,
    })
    .from(documentLinks)
    .leftJoin(costs, eq(costs.id, documentLinks.costId))
    .leftJoin(costCategories, eq(costCategories.id, costs.categoryId))
    .leftJoin(payments, eq(payments.id, documentLinks.paymentId))
    .leftJoin(units, eq(units.id, payments.unitId))
    .where(inArray(documentLinks.documentId, documentIds))
    .orderBy(asc(documentLinks.id));

  // Eine TOP soll an „ihrem“ Dokument keine fremden Kostenpositionen oder Zahlungen ablesen
  // können – sichtbar sind Positionen, an denen sie beteiligt ist oder die sie selbst eingereicht hat.
  let ownCostIds: Set<number> | null = null;
  if (!scope.allUnits) {
    const costIds = rows.flatMap((row) => (row.costId === null ? [] : [row.costId]));
    const participating =
      costIds.length === 0 || scope.unitId === null
        ? []
        : await db
            .select({ costId: costUnits.costId })
            .from(costUnits)
            .innerJoin(costs, eq(costs.id, costUnits.costId))
            .where(
              and(
                inArray(costUnits.costId, costIds),
                eq(costUnits.unitId, scope.unitId),
                eq(costs.reviewStatus, "approved"),
              ),
            );
    const submitted =
      costIds.length === 0
        ? []
        : await db
            .select({ costId: costs.id })
            .from(costs)
            .where(and(inArray(costs.id, costIds), eq(costs.createdBy, actor.id)));
    ownCostIds = new Set([...participating, ...submitted].map((row) => row.costId));
  }

  for (const row of rows) {
    const entry = result.get(row.documentId)!;
    if (row.costId !== null && (ownCostIds === null || ownCostIds.has(row.costId))) {
      entry.costs.push({ id: row.costId, label: `${row.categoryName} – ${row.costDescription}` });
    }
    if (row.paymentId !== null && (scope.allUnits || row.paymentUnitId === scope.unitId)) {
      entry.payments.push({
        id: row.paymentId,
        label: `${row.paymentUnitName} · ${formatDate(row.paymentDate)} · ${formatCents(row.paymentAmount ?? 0)}`,
      });
    }
  }
  return result;
}

const EMPTY_OCR_FIELDS: OcrFields = {
  supplier: null,
  invoiceNumber: null,
  documentDate: null,
  servicePeriodStart: null,
  servicePeriodEnd: null,
  netAmountCents: null,
  taxAmountCents: null,
  amountCents: null,
  taxRate: null,
  description: null,
  currency: null,
  confidence: null,
};

function toDto(
  row: DocumentRow,
  year: number,
  unitName: string | null,
  links: { costs: DocumentLinkRef[]; payments: DocumentLinkRef[] },
): DocumentDto {
  const stored = row.ocrResult as OcrResult | null;
  return {
    id: row.id,
    periodId: row.periodId,
    year,
    type: row.type,
    description: row.description,
    unitId: row.unitId,
    unitName,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    documentDate: row.documentDate,
    supplier: row.supplier,
    invoiceNumber: row.invoiceNumber,
    servicePeriodStart: row.servicePeriodStart,
    servicePeriodEnd: row.servicePeriodEnd,
    netAmountCents: row.netAmountCents,
    taxAmountCents: row.taxAmountCents,
    amountCents: row.amountCents,
    ocrStatus: row.ocrStatus,
    // Ältere Ergebnisse kennen die neueren Felder noch nicht – fehlende gelten als nicht erkannt.
    ocr: stored ? { ...EMPTY_OCR_FIELDS, ...stored.fields } : null,
    ocrError: row.ocrError,
    reviewStatus: row.reviewStatus,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewComment: row.reviewComment,
    createdAt: row.createdAt.toISOString(),
    costs: links.costs,
    payments: links.payments,
  };
}

/** Dokumente im Sichtbereich des Benutzers, gefiltert und sortiert. */
export async function listDocuments(
  actor: SessionUser,
  filter: DocumentFilter = {},
): Promise<DocumentDto[]> {
  authorize(actor, "document:read");
  const db = getDb();
  const scope = getDataScope(actor);

  const search = filter.search?.trim();
  let searchCondition: SQL | undefined;
  if (search) {
    // % und _ sind in LIKE Platzhalter – als normale Zeichen behandeln.
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    searchCondition = or(
      ilike(documents.fileName, pattern),
      ilike(documents.description, pattern),
      ilike(documents.supplier, pattern),
      ilike(documents.invoiceNumber, pattern),
      // Über fremde Kostenpositionen darf eine einzelne TOP nicht suchen können.
      scope.allUnits
        ? exists(
            db
              .select({ one: sql`1` })
              .from(documentLinks)
              .innerJoin(costs, eq(costs.id, documentLinks.costId))
              .where(and(eq(documentLinks.documentId, documents.id), ilike(costs.description, pattern))),
          )
        : undefined,
    );
  }

  const order =
    filter.sort === "oldest"
      ? [asc(documents.createdAt), asc(documents.id)]
      : filter.sort === "name"
        ? [asc(sql`lower(${documents.fileName})`), desc(documents.id)]
        : [desc(documents.createdAt), desc(documents.id)];

  const rows = await db
    .select({ document: documents, year: billingPeriods.year, unitName: units.name })
    .from(documents)
    .innerJoin(billingPeriods, eq(billingPeriods.id, documents.periodId))
    .leftJoin(units, eq(units.id, documents.unitId))
    .where(
      and(
        visibilityCondition(actor),
        filter.ownOnly ? eq(documents.uploadedBy, actor.id) : undefined,
        filter.documentId ? eq(documents.id, filter.documentId) : undefined,
        filter.periodId ? eq(documents.periodId, filter.periodId) : undefined,
        filter.type ? eq(documents.type, filter.type) : undefined,
        filter.unitId && scope.allUnits ? relevantToUnit(filter.unitId) : undefined,
        searchCondition,
      ),
    )
    .orderBy(...order)
    .limit(Math.min(filter.limit ?? 500, 500));

  const links = await loadLinks(
    actor,
    rows.map((row) => row.document.id),
  );
  return rows.map(({ document, year, unitName }) =>
    toDto(document, year, unitName, links.get(document.id)!),
  );
}

/** Ein einzelnes Dokument mit Verknüpfungen – nach derselben Sichtbarkeitsprüfung wie die Liste. */
export async function getDocument(actor: SessionUser, documentId: number): Promise<DocumentDto> {
  const [document] = await listDocuments(actor, { documentId });
  if (!document) throw new NotFoundError("Das Dokument wurde nicht gefunden.");
  return document;
}

/**
 * Kurzreferenzen der Dokumente zu Kostenpositionen bzw. Einzahlungen.
 * Der Aufrufer muss bereits geprüft haben, dass der Benutzer diese Einträge sehen darf –
 * wer eine Kostenposition oder Einzahlung sieht, darf auch deren Dokumente sehen.
 */
export async function getDocumentRefs(
  target: "cost" | "payment",
  ids: number[],
  options: { approvedOnly?: boolean } = {},
): Promise<Map<number, DocumentRef[]>> {
  const result = new Map<number, DocumentRef[]>();
  if (ids.length === 0) return result;

  const column = target === "cost" ? documentLinks.costId : documentLinks.paymentId;
  const rows = await getDb()
    .select({
      targetId: column,
      id: documents.id,
      fileName: documents.fileName,
      type: documents.type,
      mimeType: documents.mimeType,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documents.id, documentLinks.documentId))
    .where(
      and(
        inArray(column, ids),
        options.approvedOnly ? eq(documents.reviewStatus, "approved") : undefined,
      ),
    )
    .orderBy(asc(documents.id));

  for (const { targetId, ...ref } of rows) {
    if (targetId === null) continue;
    result.set(targetId, [...(result.get(targetId) ?? []), ref]);
  }
  return result;
}

export interface LinkOption {
  id: number;
  periodId: number;
  label: string;
}

/**
 * Alle Kostenpositionen und Einzahlungen als Auswahl für die Verknüpfung eines Dokuments.
 * Nur für die Verwaltung – die Liste enthält Daten aller TOPs.
 */
export async function listLinkOptions(
  actor: SessionUser,
): Promise<{ costs: LinkOption[]; payments: LinkOption[] }> {
  authorizeGlobalWrite(actor, "document:write");
  const db = getDb();

  const [costRows, paymentRows] = await Promise.all([
    db
      .select({
        id: costs.id,
        periodId: costs.periodId,
        description: costs.description,
        amountCents: costs.amountCents,
        categoryName: costCategories.name,
      })
      .from(costs)
      .innerJoin(costCategories, eq(costCategories.id, costs.categoryId))
      .orderBy(asc(costCategories.sortOrder), asc(costs.description)),
    db
      .select({
        id: payments.id,
        periodId: payments.periodId,
        paymentDate: payments.paymentDate,
        amountCents: payments.amountCents,
        unitName: units.name,
      })
      .from(payments)
      .innerJoin(units, eq(units.id, payments.unitId))
      .orderBy(desc(payments.paymentDate), asc(units.number)),
  ]);

  return {
    costs: costRows.map((cost) => ({
      id: cost.id,
      periodId: cost.periodId,
      label: `${cost.categoryName} – ${cost.description} (${formatCents(cost.amountCents)})`,
    })),
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      periodId: payment.periodId,
      label: `${formatDate(payment.paymentDate)} · ${payment.unitName} · ${formatCents(payment.amountCents)}`,
    })),
  };
}

/** Lädt ein Dokument im Sichtbereich des Benutzers – sonst „nicht gefunden“. */
async function getAccessibleDocument(actor: SessionUser, documentId: number): Promise<DocumentRow> {
  const [row] = await getDb()
    .select({ document: documents })
    .from(documents)
    .innerJoin(billingPeriods, eq(billingPeriods.id, documents.periodId))
    .where(and(eq(documents.id, documentId), visibilityCondition(actor)))
    .limit(1);
  if (!row) throw new NotFoundError("Das Dokument wurde nicht gefunden.");
  return row.document;
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/** Verknüpfungen müssen existieren und zum selben Abrechnungsjahr gehören wie das Dokument. */
async function assertTargets(
  tx: DbExecutor,
  periodId: number,
  meta: DocumentMetaInput,
): Promise<void> {
  const costIds = [...new Set(meta.costIds)];
  if (costIds.length > 0) {
    const found = await tx
      .select({ id: costs.id })
      .from(costs)
      .where(and(inArray(costs.id, costIds), eq(costs.periodId, periodId)));
    if (found.length !== costIds.length) {
      throw new DomainError("Eine Kostenposition gehört nicht zu diesem Abrechnungsjahr.");
    }
  }
  if (meta.paymentId !== null) {
    const [payment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, meta.paymentId), eq(payments.periodId, periodId)))
      .limit(1);
    if (!payment) throw new DomainError("Die Einzahlung gehört nicht zu diesem Abrechnungsjahr.");
  }
  if (meta.unitId !== null) {
    const [unit] = await tx.select({ id: units.id }).from(units).where(eq(units.id, meta.unitId)).limit(1);
    if (!unit) throw new DomainError("Die TOP wurde nicht gefunden.");
  }
}

async function replaceLinks(tx: DbExecutor, documentId: number, meta: DocumentMetaInput) {
  await tx.delete(documentLinks).where(eq(documentLinks.documentId, documentId));
  const rows = [
    ...[...new Set(meta.costIds)].map((costId) => ({ documentId, costId, paymentId: null })),
    ...(meta.paymentId === null ? [] : [{ documentId, costId: null, paymentId: meta.paymentId }]),
  ];
  if (rows.length > 0) await tx.insert(documentLinks).values(rows);
}

function toColumns(meta: DocumentMetaInput) {
  return {
    type: meta.type,
    description: meta.description,
    unitId: meta.unitId,
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

export interface UploadedFile {
  name: string;
  bytes: Buffer;
}

/**
 * Prüft vor dem Speichern alles, was einen Upload scheitern lassen kann: Größe, Typ
 * (am Inhalt erkannt) und Dubletten im selben Abrechnungsjahr.
 * Getrennt aufrufbar, damit z. B. die Kostenerfassung die Datei prüfen kann,
 * bevor sie die Kostenposition anlegt.
 */
export async function checkUpload(
  periodId: number,
  file: UploadedFile,
): Promise<{ mimeType: string; sha256: string }> {
  if (file.bytes.length === 0) throw new DomainError("Die Datei ist leer.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) {
    throw new DomainError(`Die Datei ist größer als ${formatFileSize(MAX_UPLOAD_BYTES)}.`);
  }
  const mimeType = detectFileType(file.bytes);
  if (!mimeType) {
    const allowed = Object.values(ALLOWED_FILE_TYPES)
      .map((type) => type.label)
      .join(", ");
    throw new DomainError(`Dieses Dateiformat wird nicht unterstützt. Erlaubt sind: ${allowed}.`);
  }

  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const [duplicate] = await getDb()
    .select({ fileName: documents.fileName })
    .from(documents)
    .where(and(eq(documents.periodId, periodId), eq(documents.sha256, sha256)))
    .limit(1);
  if (duplicate) {
    throw new DomainError(`Diese Datei wurde bereits als „${duplicate.fileName}“ hochgeladen.`);
  }
  return { mimeType, sha256 };
}

/**
 * Speichert ein Dokument samt Datei. Metadaten, Dateiinhalt und Verknüpfungen entstehen
 * in einer Transaktion – entweder ist alles da oder nichts.
 */
export async function uploadDocument(
  actor: SessionUser,
  periodId: number,
  file: UploadedFile,
  meta: DocumentMetaInput,
): Promise<number> {
  authorizeGlobalWrite(actor, "document:write");
  await getVisiblePeriod(actor, periodId);
  const { mimeType, sha256 } = await checkUpload(periodId, file);

  return getDb().transaction(async (tx) => {
    await assertTargets(tx, periodId, meta);
    const [row] = await tx
      .insert(documents)
      .values({
        ...toColumns(meta),
        periodId,
        fileName: sanitizeFileName(file.name),
        mimeType,
        sizeBytes: file.bytes.length,
        sha256,
        uploadedBy: actor.id,
      })
      .returning({ id: documents.id });
    await tx.insert(documentFiles).values({ documentId: row.id, content: file.bytes });
    await replaceLinks(tx, row.id, meta);

    const uploaded = await describeDocument(tx, row.id);
    if (uploaded) {
      await recordAudit(
        actor,
        {
          action: "document.uploaded",
          entity: { type: "document", id: row.id },
          summary: uploaded.summary,
          details: { values: snapshotValues(uploaded.snapshot) },
        },
        tx,
      );
    }
    return row.id;
  });
}

export async function updateDocument(
  actor: SessionUser,
  documentId: number,
  periodId: number,
  meta: DocumentMetaInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "document:write");
  await getAccessibleDocument(actor, documentId);
  await getVisiblePeriod(actor, periodId);

  await getDb().transaction(async (tx) => {
    await assertTargets(tx, periodId, meta);
    const before = await describeDocument(tx, documentId);
    await tx
      .update(documents)
      .set({ ...toColumns(meta), periodId })
      .where(eq(documents.id, documentId));
    await replaceLinks(tx, documentId, meta);

    const after = await describeDocument(tx, documentId);
    if (before && after) {
      await recordAudit(
        actor,
        {
          action: "document.updated",
          entity: { type: "document", id: documentId },
          summary: after.summary,
          details: { changes: diffSnapshots(before.snapshot, after.snapshot) },
        },
        tx,
      );
    }
  });
}

/** Im Kostenformular geprüfte Rechnungsdaten – Beträge in Cent. */
export interface ReviewedInvoiceData {
  documentDate: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  netAmountCents: number | null;
  taxAmountCents: number | null;
  amountCents: number | null;
}

/**
 * Verknüpft bereits hochgeladene Belege mit einer Kostenposition. Gedacht für Belege, die im
 * Kostenformular fotografiert bzw. ausgewählt und schon vor dem Speichern per OCR ausgelesen
 * wurden: Original und OCR-Ergebnis liegen dann bereits am Dokument.
 *
 * - Ein Beleg ohne andere Verknüpfung wandert ins Abrechnungsjahr der Kostenposition, falls das
 *   Jahr im Formular nach dem Upload geändert wurde.
 * - `reviewed`: Bei genau einem Beleg gelten die im Formular geprüften Rechnungsdaten auch für
 *   das Dokument – Kostenposition und Beleg widersprechen sich dann nicht. Was die OCR erkannt
 *   hat, bleibt in `ocr_result` unverändert stehen.
 */
export async function attachReceiptsToCost(
  actor: SessionUser,
  costId: number,
  documentIds: number[],
  reviewed: ReviewedInvoiceData | null,
): Promise<void> {
  authorizeGlobalWrite(actor, "document:write");
  const ids = [...new Set(documentIds)];
  if (ids.length === 0) return;

  const db = getDb();
  const [cost] = await db
    .select({ periodId: costs.periodId })
    .from(costs)
    .where(eq(costs.id, costId))
    .limit(1);
  if (!cost) throw new NotFoundError("Die Kostenposition wurde nicht gefunden.");
  await getVisiblePeriod(actor, cost.periodId);

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: documents.id,
        periodId: documents.periodId,
        fileName: documents.fileName,
        sha256: documents.sha256,
      })
      .from(documents)
      .where(inArray(documents.id, ids));
    if (rows.length !== ids.length) throw new NotFoundError("Ein Beleg wurde nicht gefunden.");

    const before = new Map<number, AuditSnapshot>();
    for (const id of ids) {
      const described = await describeDocument(tx, id);
      if (described) before.set(id, described.snapshot);
    }

    for (const document of rows.filter((row) => row.periodId !== cost.periodId)) {
      const [{ links }] = await tx
        .select({ links: count() })
        .from(documentLinks)
        .where(eq(documentLinks.documentId, document.id));
      if (links > 0) {
        throw new DomainError(`„${document.fileName}“ gehört zu einem anderen Abrechnungsjahr.`);
      }
      const [duplicate] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.periodId, cost.periodId), eq(documents.sha256, document.sha256)))
        .limit(1);
      if (duplicate) {
        throw new DomainError(
          `„${document.fileName}“ ist in diesem Abrechnungsjahr bereits vorhanden.`,
        );
      }
      await tx
        .update(documents)
        .set({ periodId: cost.periodId })
        .where(eq(documents.id, document.id));
    }

    await tx
      .insert(documentLinks)
      .values(ids.map((documentId) => ({ documentId, costId, paymentId: null })))
      .onConflictDoNothing();

    if (reviewed && ids.length === 1) {
      await tx.update(documents).set(reviewed).where(eq(documents.id, ids[0]));
    }

    // Verknüpfung und übernommene Rechnungsdaten ändern die Belege – je Beleg ein Eintrag.
    for (const id of ids) {
      const after = await describeDocument(tx, id);
      const changes = after ? diffSnapshots(before.get(id) ?? {}, after.snapshot) : [];
      if (after && changes.length > 0) {
        await recordAudit(
          actor,
          {
            action: "document.updated",
            entity: { type: "document", id },
            summary: after.summary,
            details: { changes, note: "Als Beleg mit einer Kostenposition verknüpft." },
          },
          tx,
        );
      }
    }
  });
}

export async function deleteDocument(actor: SessionUser, documentId: number): Promise<void> {
  authorizeGlobalWrite(actor, "document:delete");
  await getAccessibleDocument(actor, documentId);

  await getDb().transaction(async (tx) => {
    const deleted = await describeDocument(tx, documentId);
    // Dateiinhalt und Verknüpfungen hängen per ON DELETE CASCADE am Dokument.
    await tx.delete(documents).where(eq(documents.id, documentId));
    if (deleted) {
      await recordAudit(
        actor,
        {
          action: "document.deleted",
          entity: { type: "document", id: documentId },
          summary: deleted.summary,
          details: { values: snapshotValues(deleted.snapshot) },
        },
        tx,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Datei & OCR
// ---------------------------------------------------------------------------

export interface DocumentFile {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}

/** Liest den Dateiinhalt – erst nachdem der Zugriff auf das Dokument geprüft wurde. */
async function loadContent(documentId: number): Promise<Buffer> {
  const [file] = await getDb()
    .select({ content: documentFiles.content })
    .from(documentFiles)
    .where(eq(documentFiles.documentId, documentId))
    .limit(1);
  if (!file) throw new NotFoundError("Die Datei zum Dokument ist nicht mehr vorhanden.");
  return file.content;
}

/** Datei eines Dokuments für Vorschau/Download – nach derselben Prüfung wie die Liste. */
export async function getDocumentFile(
  actor: SessionUser,
  documentId: number,
): Promise<DocumentFile> {
  authorize(actor, "document:read");
  const document = await getAccessibleDocument(actor, documentId);

  return {
    bytes: await loadContent(documentId),
    fileName: document.fileName,
    mimeType: document.mimeType,
  };
}

export function isOcrAvailable(): boolean {
  return getOcrService().isConfigured();
}

/** Formularfelder, die die OCR füllen kann: Spalte, Beschriftung und erkannter Wert. */
function ocrCandidates(fields: OcrFields) {
  return [
    { column: "supplier", label: "Rechnungssteller", value: fields.supplier },
    { column: "invoiceNumber", label: "Rechnungsnummer", value: fields.invoiceNumber },
    { column: "documentDate", label: "Rechnungsdatum", value: fields.documentDate },
    { column: "servicePeriodStart", label: "Leistungszeitraum von", value: fields.servicePeriodStart },
    { column: "servicePeriodEnd", label: "Leistungszeitraum bis", value: fields.servicePeriodEnd },
    { column: "netAmountCents", label: "Betrag netto", value: fields.netAmountCents },
    { column: "taxAmountCents", label: "MwSt.", value: fields.taxAmountCents },
    { column: "amountCents", label: "Betrag brutto", value: fields.amountCents },
    { column: "description", label: "Beschreibung", value: fields.description },
  ] as const;
}

/**
 * Führt die OCR für ein Dokument aus und übernimmt erkannte Werte in leere Formularfelder.
 * Bereits ausgefüllte Felder bleiben unangetastet, nicht Erkanntes bleibt leer.
 *
 * Fehler der Texterkennung (nicht lesbar, Format nicht unterstützt, Dienst nicht erreichbar)
 * werden am Dokument gespeichert und als Ergebnis zurückgegeben statt geworfen – das Dokument
 * selbst ist davon unberührt und kann von Hand ergänzt oder später erneut ausgelesen werden.
 */
export async function processDocumentOcr(
  actor: SessionUser,
  documentId: number,
): Promise<OcrOutcome> {
  authorizeGlobalWrite(actor, "document:ocr");
  const document = await getAccessibleDocument(actor, documentId);

  const ocr = getOcrService();
  if (!ocr.isConfigured()) throw new DomainError("OCR ist nicht eingerichtet.");

  const db = getDb();
  const entry = {
    action: "document.ocr",
    entity: { type: "document", id: documentId },
    summary: document.fileName,
  } as const;
  const fail = async (error: string): Promise<OcrOutcome> => {
    await db
      .update(documents)
      .set({ ocrStatus: "failed", ocrError: error, ocrProcessedAt: new Date() })
      .where(eq(documents.id, documentId));
    await recordAudit(actor, { ...entry, details: { note: `Fehlgeschlagen: ${error}` } });
    return { status: "failed", fields: null, filled: [], error };
  };

  if (!ocr.supports(document.mimeType)) {
    const label = ALLOWED_FILE_TYPES[document.mimeType]?.label ?? document.mimeType;
    return fail(`${label}-Dateien können nicht per OCR ausgelesen werden.`);
  }

  const bytes = await loadContent(documentId);
  // „pending“ bleibt stehen, falls die Auswertung abbricht – das Dokument gilt dann weiter als offen.
  await db
    .update(documents)
    .set({ ocrStatus: "pending", ocrError: null })
    .where(eq(documents.id, documentId));

  let result: OcrResult;
  try {
    result = await ocr.analyzeInvoice({ bytes, mimeType: document.mimeType });
  } catch (error) {
    if (error instanceof OcrError) return fail(error.message);
    console.error(`OCR für Dokument ${documentId} fehlgeschlagen:`, error);
    return fail("Die OCR-Auswertung ist fehlgeschlagen. Bitte später erneut versuchen.");
  }

  // Nur leere Felder füllen: was jemand eingetragen hat, überschreibt die OCR nie.
  const fillable = ocrCandidates(result.fields).filter(
    (candidate) => candidate.value !== null && document[candidate.column] === null,
  );
  await db
    .update(documents)
    .set({
      ...Object.fromEntries(fillable.map((candidate) => [candidate.column, candidate.value])),
      ocrStatus: "done",
      ocrResult: result,
      ocrError: null,
      ocrProcessedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
  await recordAudit(actor, {
    ...entry,
    details: {
      note:
        fillable.length > 0
          ? `Übernommen: ${fillable.map((candidate) => candidate.label).join(", ")}.`
          : "Ausgelesen – keine Werte übernommen.",
    },
  });

  return {
    status: "done",
    fields: result.fields,
    filled: fillable.map((candidate) => candidate.label),
    error: null,
  };
}

/** Wie processDocumentOcr, meldet eine fehlgeschlagene Auswertung aber als Fehler (für die Schaltfläche). */
export async function runDocumentOcr(actor: SessionUser, documentId: number): Promise<OcrOutcome> {
  const outcome = await processDocumentOcr(actor, documentId);
  if (outcome.status === "failed") throw new DomainError(outcome.error ?? "OCR fehlgeschlagen.");
  return outcome;
}
