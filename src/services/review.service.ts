import "server-only";

import { and, count, eq, inArray } from "drizzle-orm";

import { authorize } from "@/auth/rbac";
import { getDb } from "@/db/client";
import {
  billingPeriods,
  costCategories,
  costs,
  documentLinks,
  documents,
  payments,
  units,
  users,
} from "@/db/schema";
import { DomainError, NotFoundError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import type { SessionUser } from "@/types/auth";
import type { DocumentRef, ReviewStatus } from "@/types/billing";

import { getDocumentRefs } from "./documents.service";

export type ReviewKind = "period" | "cost" | "payment" | "document";

/** Ein eingereichter Eintrag in der Prüfliste – über alle Arten hinweg einheitlich. */
export interface ReviewItem {
  kind: ReviewKind;
  id: number;
  title: string;
  detail: string;
  year: number;
  /** TOP, die der Eintrag betrifft (Einzahlungen, Dokumente) – sonst null. */
  unitName: string | null;
  amountCents: number | null;
  submittedBy: string | null;
  submittedAt: string;
  reviewStatus: ReviewStatus;
  reviewedAt: string | null;
  reviewComment: string | null;
  /** Belege zur Kostenposition/Einzahlung bzw. das Dokument selbst – zum Ansehen bei der Prüfung. */
  documents: DocumentRef[];
}

/**
 * Prüfliste der Verwaltung. „pending“ und „rejected“ zeigen alle Einträge in diesem Stand;
 * „approved“ nur solche, die tatsächlich geprüft wurden – Einträge der Verwaltung selbst
 * entstehen direkt freigegeben und gehören nicht in die Liste.
 */
export async function listReviewItems(
  actor: SessionUser,
  status: ReviewStatus,
): Promise<ReviewItem[]> {
  authorize(actor, "review:manage");
  const db = getDb();
  const keep = ({ row }: { row: { reviewedAt: Date | null } }) =>
    status !== "approved" || row.reviewedAt !== null;

  const [periodRows, costRows, paymentRows, documentRows] = await Promise.all([
    db
      .select({ row: billingPeriods, submittedBy: users.displayName })
      .from(billingPeriods)
      .leftJoin(users, eq(users.id, billingPeriods.createdBy))
      .where(eq(billingPeriods.reviewStatus, status)),
    db
      .select({
        row: costs,
        year: billingPeriods.year,
        categoryName: costCategories.name,
        submittedBy: users.displayName,
      })
      .from(costs)
      .innerJoin(billingPeriods, eq(billingPeriods.id, costs.periodId))
      .innerJoin(costCategories, eq(costCategories.id, costs.categoryId))
      .leftJoin(users, eq(users.id, costs.createdBy))
      .where(eq(costs.reviewStatus, status)),
    db
      .select({
        row: payments,
        year: billingPeriods.year,
        unitName: units.name,
        submittedBy: users.displayName,
      })
      .from(payments)
      .innerJoin(billingPeriods, eq(billingPeriods.id, payments.periodId))
      .innerJoin(units, eq(units.id, payments.unitId))
      .leftJoin(users, eq(users.id, payments.createdBy))
      .where(eq(payments.reviewStatus, status)),
    db
      .select({
        row: documents,
        year: billingPeriods.year,
        unitName: units.name,
        submittedBy: users.displayName,
      })
      .from(documents)
      .innerJoin(billingPeriods, eq(billingPeriods.id, documents.periodId))
      .leftJoin(units, eq(units.id, documents.unitId))
      .leftJoin(users, eq(users.id, documents.uploadedBy))
      .where(eq(documents.reviewStatus, status)),
  ]);

  const [costDocuments, paymentDocuments] = await Promise.all([
    getDocumentRefs(
      "cost",
      costRows.map(({ row }) => row.id),
    ),
    getDocumentRefs(
      "payment",
      paymentRows.map(({ row }) => row.id),
    ),
  ]);

  const common = (row: {
    createdAt: Date;
    reviewStatus: ReviewStatus;
    reviewedAt: Date | null;
    reviewComment: string | null;
  }) => ({
    submittedAt: row.createdAt.toISOString(),
    reviewStatus: row.reviewStatus,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewComment: row.reviewComment,
  });

  const items: ReviewItem[] = [
    ...periodRows.filter(keep).map(
      ({ row, submittedBy }) => ({
        kind: "period" as const,
        id: row.id,
        title: `Abrechnungsjahr ${row.year}`,
        detail: row.notes ?? "",
        year: row.year,
        unitName: null,
        amountCents: null,
        submittedBy,
        documents: [],
        ...common(row),
      }),
    ),
    ...costRows.filter(keep).map(
      ({ row, year, categoryName, submittedBy }) => ({
        kind: "cost" as const,
        id: row.id,
        title: row.description,
        detail: [categoryName, row.supplier, row.costDate && formatDate(row.costDate)]
          .filter(Boolean)
          .join(" · "),
        year,
        unitName: null,
        amountCents: row.amountCents,
        submittedBy,
        documents: costDocuments.get(row.id) ?? [],
        ...common(row),
      }),
    ),
    ...paymentRows.filter(keep).map(
      ({ row, year, unitName, submittedBy }) => ({
        kind: "payment" as const,
        id: row.id,
        title: `Einzahlung ${unitName}`,
        detail: [formatDate(row.paymentDate), row.purpose].filter(Boolean).join(" · "),
        year,
        unitName,
        amountCents: row.amountCents,
        submittedBy,
        documents: paymentDocuments.get(row.id) ?? [],
        ...common(row),
      }),
    ),
    ...documentRows.filter(keep).map(
      ({ row, year, unitName, submittedBy }) => ({
        kind: "document" as const,
        id: row.id,
        title: row.fileName,
        detail: [DOCUMENT_TYPE_LABELS[row.type], row.description].filter(Boolean).join(" · "),
        year,
        unitName,
        amountCents: row.amountCents,
        submittedBy,
        documents: [{ id: row.id, fileName: row.fileName, type: row.type, mimeType: row.mimeType }],
        ...common(row),
      }),
    ),
  ];

  // Älteste Einreichung zuerst: was am längsten wartet, steht oben.
  return items.sort((a, b) =>
    status === "pending"
      ? a.submittedAt.localeCompare(b.submittedAt)
      : (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""),
  );
}

/** Anzahl der Einträge, die auf Prüfung warten – für den Zähler in der Navigation. */
export async function countPendingReviews(actor: SessionUser): Promise<number> {
  authorize(actor, "review:manage");
  const db = getDb();
  const counts = await Promise.all(
    [billingPeriods, costs, payments, documents].map((table) =>
      db.select({ n: count() }).from(table).where(eq(table.reviewStatus, "pending")),
    ),
  );
  return counts.reduce((total, [{ n }]) => total + n, 0);
}

/**
 * Gibt einen eingereichten Eintrag frei oder lehnt ihn ab. Prüfstand, Prüfdatum, Prüfer und
 * der optionale Kommentar werden am Eintrag gespeichert; der Einreicher sieht Stand und Kommentar.
 */
export async function reviewEntry(
  actor: SessionUser,
  kind: ReviewKind,
  id: number,
  decision: Exclude<ReviewStatus, "pending">,
  comment: string | null,
): Promise<void> {
  authorize(actor, "review:manage");
  const db = getDb();
  const verdict = {
    reviewStatus: decision,
    reviewedAt: new Date(),
    reviewedBy: actor.id,
    reviewComment: comment,
  };

  if (kind === "cost") {
    const [row] = await db
      .select({ year: billingPeriods.year, status: billingPeriods.status })
      .from(costs)
      .innerJoin(billingPeriods, eq(billingPeriods.id, costs.periodId))
      .where(eq(costs.id, id))
      .limit(1);
    if (!row) throw new NotFoundError("Die Kostenposition wurde nicht gefunden.");
    // Eine neue Kostenposition würde eine bereits veröffentlichte Abrechnung verändern.
    if (decision === "approved" && row.status === "released") {
      throw new DomainError(
        `Die Abrechnung ${row.year} ist bereits veröffentlicht. Nimm die Freigabe der Abrechnung zurück, um die Kostenposition aufzunehmen.`,
      );
    }
    await db.update(costs).set(verdict).where(eq(costs.id, id));
    if (decision === "approved") await approveAttachments("cost", id, verdict);
    return;
  }

  const table = kind === "payment" ? payments : kind === "document" ? documents : billingPeriods;
  const [updated] = await db.update(table).set(verdict).where(eq(table.id, id)).returning({ id: table.id });
  if (!updated) throw new NotFoundError("Der Eintrag wurde nicht gefunden.");
  if (kind === "payment" && decision === "approved") await approveAttachments("payment", id, verdict);
}

/**
 * Mit einer Kostenposition bzw. Einzahlung werden auch ihre noch ungeprüften Belege
 * freigegeben – wer den Eintrag anhand des Belegs geprüft hat, muss ihn nicht zweimal bestätigen.
 * Abgelehnte Belege bleiben abgelehnt; eine Ablehnung des Eintrags lässt die Belege unberührt.
 */
async function approveAttachments(
  target: "cost" | "payment",
  id: number,
  verdict: { reviewStatus: ReviewStatus; reviewedAt: Date; reviewedBy: number; reviewComment: string | null },
): Promise<void> {
  const db = getDb();
  const linked = await db
    .select({ documentId: documentLinks.documentId })
    .from(documentLinks)
    .where(eq(target === "cost" ? documentLinks.costId : documentLinks.paymentId, id));
  if (linked.length === 0) return;

  await db
    .update(documents)
    .set({ ...verdict, reviewComment: null })
    .where(
      and(
        inArray(
          documents.id,
          linked.map((row) => row.documentId),
        ),
        eq(documents.reviewStatus, "pending"),
      ),
    );
}

/** Wie viele eigene Einträge eines Benutzers auf Prüfung warten bzw. abgelehnt wurden. */
export async function countOwnOpenSubmissions(
  actor: SessionUser,
): Promise<{ pending: number; rejected: number }> {
  const db = getDb();
  const rows = (
    await Promise.all([
      db.select({ status: billingPeriods.reviewStatus }).from(billingPeriods).where(eq(billingPeriods.createdBy, actor.id)),
      db.select({ status: costs.reviewStatus }).from(costs).where(eq(costs.createdBy, actor.id)),
      db.select({ status: payments.reviewStatus }).from(payments).where(eq(payments.createdBy, actor.id)),
      db.select({ status: documents.reviewStatus }).from(documents).where(eq(documents.uploadedBy, actor.id)),
    ])
  ).flat();
  return {
    pending: rows.filter((row) => row.status === "pending").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
  };
}
