import "server-only";

import { asc, eq } from "drizzle-orm";

import { authorize, can, getDataScope } from "@/auth/rbac";
import { getDb } from "@/db/client";
import { units } from "@/db/schema";
import { restrictStatementToUnit } from "@/lib/billing/allocation";
import { DomainError, NotFoundError } from "@/lib/errors";
import type { AnnualStatementData } from "@/lib/pdf/annual-statement";
import type { SessionUser } from "@/types/auth";

import { listPayments } from "./payments.service";
import { getPeriodByYear } from "./periods.service";
import { getStatement } from "./statement.service";

/**
 * Daten der Jahresabrechnung als PDF – mit denselben Regeln wie die Abrechnung in der
 * Oberfläche: nur Jahre, die der Benutzer sehen darf, und ohne Blick auf alle TOPs nur der
 * Anteil der eigenen TOP. In die Abrechnung gehen ausschließlich freigegebene Kosten, Belege
 * und eingegangene, freigegebene Einzahlungen ein – auch für die Verwaltung.
 *
 * `unitNumber` (nur mit Blick auf alle TOPs wirksam) liefert die Abrechnung einer einzelnen TOP.
 */
export async function getAnnualStatement(
  actor: SessionUser,
  year: number,
  unitNumber?: number,
): Promise<AnnualStatementData> {
  authorize(actor, "cost:read");
  // Nicht sichtbare Jahre verhalten sich wie nicht vorhandene.
  const period = await getPeriodByYear(actor, year);
  if (!period) throw new NotFoundError("Das Abrechnungsjahr wurde nicht gefunden.");

  const scope = getDataScope(actor);
  let statement = await getStatement(actor, period.id, { approvedDocumentsOnly: true });
  let focus: AnnualStatementData["focus"] = null;

  if (!scope.allUnits) {
    const own = statement.balances[0];
    if (!own) throw new DomainError("Deinem Konto ist keine TOP zugeordnet.");
    focus = { unitId: own.unitId, unitName: own.unitName };
  } else if (unitNumber !== undefined) {
    const [unit] = await getDb()
      .select({ id: units.id, name: units.name })
      .from(units)
      .where(eq(units.number, unitNumber))
      .orderBy(asc(units.id))
      .limit(1);
    if (!unit) throw new NotFoundError("Die TOP wurde nicht gefunden.");
    statement = restrictStatementToUnit(statement, unit.id);
    focus = { unitId: unit.id, unitName: unit.name };
  }

  const payments = can(actor, "payment:read")
    ? await listPayments(actor, {
        periodId: period.id,
        unitId: focus?.unitId,
        status: "received",
        reviewStatus: "approved",
      })
    : [];

  return {
    year: period.year,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    releasedAt: period.releasedAt,
    focus,
    statement,
    payments: payments.map((payment) => ({
      unitId: payment.unitId,
      unitName: payment.unitName,
      paymentDate: payment.paymentDate,
      amountCents: payment.amountCents,
      purpose: payment.purpose,
    })),
    generatedAt: new Date(),
  };
}
