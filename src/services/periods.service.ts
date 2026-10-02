import "server-only";

import { and, count, desc, eq, inArray } from "drizzle-orm";

import { authorize, authorizeGlobalWrite, getDataScope } from "@/auth/rbac";
import { seedAllocationValues } from "@/db/allocation-defaults";
import { getDb } from "@/db/client";
import { billingPeriods, costs, documents, payments } from "@/db/schema";
import { DomainError, NotFoundError } from "@/lib/errors";
import type { PeriodInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type { PeriodDto, PeriodStatus } from "@/types/billing";

type PeriodRow = typeof billingPeriods.$inferSelect;

function toDto(row: PeriodRow): PeriodDto {
  return {
    id: row.id,
    year: row.year,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    releasedAt: row.releasedAt?.toISOString() ?? null,
    notes: row.notes,
  };
}

/** Ohne scope:drafts sind nur freigegebene Abrechnungsjahre sichtbar. */
function visibleStatuses(actor: SessionUser): PeriodStatus[] {
  return getDataScope(actor).includeDrafts ? ["draft", "released"] : ["released"];
}

export async function listPeriods(actor: SessionUser): Promise<PeriodDto[]> {
  authorize(actor, "period:read");
  const rows = await getDb()
    .select()
    .from(billingPeriods)
    .where(inArray(billingPeriods.status, visibleStatuses(actor)))
    .orderBy(desc(billingPeriods.year));
  return rows.map(toDto);
}

export async function getPeriodByYear(actor: SessionUser, year: number): Promise<PeriodDto | null> {
  authorize(actor, "period:read");
  const [row] = await getDb()
    .select()
    .from(billingPeriods)
    .where(
      and(eq(billingPeriods.year, year), inArray(billingPeriods.status, visibleStatuses(actor))),
    )
    .limit(1);
  return row ? toDto(row) : null;
}

/**
 * Lädt ein Abrechnungsjahr, das der Benutzer sehen darf. Nicht sichtbare Jahre
 * verhalten sich wie nicht vorhandene, damit ihre Existenz nicht verraten wird.
 */
export async function getVisiblePeriod(actor: SessionUser, periodId: number): Promise<PeriodDto> {
  authorize(actor, "period:read");
  const [row] = await getDb()
    .select()
    .from(billingPeriods)
    .where(
      and(eq(billingPeriods.id, periodId), inArray(billingPeriods.status, visibleStatuses(actor))),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Das Abrechnungsjahr wurde nicht gefunden.");
  return toDto(row);
}

/** Kosten und Umlageschlüssel lassen sich nur ändern, solange nicht freigegeben ist. */
export function assertDraft(period: PeriodDto): void {
  if (period.status !== "draft") {
    throw new DomainError(
      `Die Abrechnung ${period.year} ist freigegeben. Nimm die Freigabe zurück, um sie zu ändern.`,
    );
  }
}

/** Vorauswahl für Jahres-Umschalter: laufendes Jahr, sonst das jüngste sichtbare. */
export function pickDefaultPeriod(periods: PeriodDto[]): PeriodDto | null {
  const currentYear = new Date().getFullYear();
  return periods.find((p) => p.year === currentYear) ?? periods[0] ?? null;
}

export async function createPeriod(actor: SessionUser, input: PeriodInput): Promise<PeriodDto> {
  authorizeGlobalWrite(actor, "period:write");

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
      })
      .returning();

    await seedAllocationValues(tx, row.id, { overwrite: false });
    return toDto(row);
  });
}

export async function setPeriodStatus(
  actor: SessionUser,
  periodId: number,
  status: PeriodStatus,
): Promise<PeriodDto> {
  authorizeGlobalWrite(actor, "period:release");
  await getVisiblePeriod(actor, periodId);

  const [row] = await getDb()
    .update(billingPeriods)
    .set(
      status === "released"
        ? { status, releasedAt: new Date(), releasedBy: actor.id }
        : { status, releasedAt: null, releasedBy: null },
    )
    .where(eq(billingPeriods.id, periodId))
    .returning();
  return toDto(row);
}

export async function deletePeriod(actor: SessionUser, periodId: number): Promise<void> {
  authorizeGlobalWrite(actor, "period:delete");
  const period = await getVisiblePeriod(actor, periodId);

  const db = getDb();
  const [[costCount], [paymentCount], [documentCount]] = await Promise.all([
    db.select({ n: count() }).from(costs).where(eq(costs.periodId, periodId)),
    db.select({ n: count() }).from(payments).where(eq(payments.periodId, periodId)),
    db.select({ n: count() }).from(documents).where(eq(documents.periodId, periodId)),
  ]);

  // Ein ganzes Jahr samt Inhalt soll nicht mit einem Klick verschwinden können.
  if (costCount.n + paymentCount.n + documentCount.n > 0) {
    throw new DomainError(
      `Das Abrechnungsjahr ${period.year} enthält noch ${costCount.n} Kosten, ` +
        `${paymentCount.n} Einzahlungen und ${documentCount.n} Dokumente. Bitte zuerst diese Einträge löschen.`,
    );
  }

  await db.delete(billingPeriods).where(eq(billingPeriods.id, periodId));
}
