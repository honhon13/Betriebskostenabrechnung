import "server-only";

import { and, count, desc, eq, inArray } from "drizzle-orm";

import { ForbiddenError } from "@/auth/errors";
import { authorize, canAccessUnit, getDataScope } from "@/auth/rbac";
import { getDb } from "@/db/client";
import { billingPeriods, documentLinks, payments, units } from "@/db/schema";
import { DomainError, NotFoundError } from "@/lib/errors";
import type { PaymentInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type { PaymentDto, PaymentStatus } from "@/types/billing";

import { getDocumentRefs } from "./documents.service";
import { getVisiblePeriod } from "./periods.service";

export interface PaymentFilter {
  periodId?: number;
  unitId?: number;
  status?: PaymentStatus;
}

/**
 * Einzahlungen im Sichtbereich des Benutzers: ohne scope:all_units nur die eigene TOP,
 * ohne scope:drafts nur freigegebene Abrechnungsjahre.
 */
export async function listPayments(
  actor: SessionUser,
  filter: PaymentFilter = {},
): Promise<PaymentDto[]> {
  authorize(actor, "payment:read");
  const scope = getDataScope(actor);
  if (!scope.allUnits && scope.unitId === null) return [];

  const unitId = scope.allUnits ? filter.unitId : scope.unitId!;

  const rows = await getDb()
    .select({ payment: payments, year: billingPeriods.year, unitName: units.name })
    .from(payments)
    .innerJoin(billingPeriods, eq(billingPeriods.id, payments.periodId))
    .innerJoin(units, eq(units.id, payments.unitId))
    .where(
      and(
        filter.periodId ? eq(payments.periodId, filter.periodId) : undefined,
        unitId ? eq(payments.unitId, unitId) : undefined,
        filter.status ? eq(payments.status, filter.status) : undefined,
        scope.includeDrafts ? undefined : inArray(billingPeriods.status, ["released"]),
      ),
    )
    .orderBy(desc(payments.paymentDate), desc(payments.id));

  const documentRefs = await getDocumentRefs(
    "payment",
    rows.map((row) => row.payment.id),
  );

  return rows.map(({ payment, year, unitName }) => ({
    id: payment.id,
    periodId: payment.periodId,
    year,
    unitId: payment.unitId,
    unitName,
    paymentDate: payment.paymentDate,
    amountCents: payment.amountCents,
    purpose: payment.purpose,
    note: payment.note,
    status: payment.status,
    documents: documentRefs.get(payment.id) ?? [],
    createdAt: payment.createdAt.toISOString(),
  }));
}

async function assertWritable(actor: SessionUser, input: PaymentInput): Promise<void> {
  if (!canAccessUnit(actor, input.unitId)) throw new ForbiddenError();
  const period = await getVisiblePeriod(actor, input.periodId);

  const [unit] = await getDb()
    .select({ id: units.id })
    .from(units)
    .where(eq(units.id, input.unitId))
    .limit(1);
  if (!unit) throw new DomainError("Die TOP wurde nicht gefunden.");

  if (input.paymentDate < "2000-01-01" || input.paymentDate > `${period.year + 5}-12-31`) {
    throw new DomainError("Das Datum liegt außerhalb des plausiblen Bereichs.");
  }
}

function toColumns(input: PaymentInput) {
  return {
    periodId: input.periodId,
    unitId: input.unitId,
    paymentDate: input.paymentDate,
    amountCents: input.amount,
    purpose: input.purpose,
    note: input.note,
    status: input.status,
  };
}

/** Legt eine Einzahlung an und gibt ihre ID zurück (z. B. um einen Nachweis anzuhängen). */
export async function createPayment(actor: SessionUser, input: PaymentInput): Promise<number> {
  authorize(actor, "payment:write");
  await assertWritable(actor, input);
  const [row] = await getDb()
    .insert(payments)
    .values({ ...toColumns(input), createdBy: actor.id })
    .returning({ id: payments.id });
  return row.id;
}

/** Lädt eine bestehende Einzahlung und prüft, dass sie im Sichtbereich des Benutzers liegt. */
async function getAccessiblePayment(actor: SessionUser, paymentId: number) {
  const [row] = await getDb().select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!row || !canAccessUnit(actor, row.unitId)) {
    throw new NotFoundError("Die Einzahlung wurde nicht gefunden.");
  }
  await getVisiblePeriod(actor, row.periodId);
  return row;
}

export async function updatePayment(
  actor: SessionUser,
  paymentId: number,
  input: PaymentInput,
): Promise<void> {
  authorize(actor, "payment:write");
  const current = await getAccessiblePayment(actor, paymentId);
  await assertWritable(actor, input);

  if (input.periodId !== current.periodId) {
    // Nachweise gehören zum Abrechnungsjahr der Einzahlung.
    const [{ n }] = await getDb()
      .select({ n: count() })
      .from(documentLinks)
      .where(eq(documentLinks.paymentId, paymentId));
    if (n > 0) {
      throw new DomainError(
        "Die Einzahlung hat verknüpfte Dokumente. Bitte zuerst die Verknüpfung lösen, " +
          "dann das Abrechnungsjahr ändern.",
      );
    }
  }

  await getDb().update(payments).set(toColumns(input)).where(eq(payments.id, paymentId));
}

export async function deletePayment(actor: SessionUser, paymentId: number): Promise<void> {
  authorize(actor, "payment:delete");
  await getAccessiblePayment(actor, paymentId);
  await getDb().delete(payments).where(eq(payments.id, paymentId));
}
