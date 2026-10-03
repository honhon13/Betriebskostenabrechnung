import "server-only";

import { and, asc, eq, gte, inArray } from "drizzle-orm";

import { authorize, authorizeGlobalWrite, getDataScope } from "@/auth/rbac";
import { getDb, type DbExecutor } from "@/db/client";
import {
  accountOpeningBalances,
  accountSettings,
  billingPeriods,
  payments,
  units,
} from "@/db/schema";
import { diffSnapshots, snapshotValues, type AuditSnapshot } from "@/lib/audit";
import { buildUnitAccount, summarizeAccounts } from "@/lib/billing/account";
import { DomainError } from "@/lib/errors";
import { formatCents, formatDate } from "@/lib/format";
import type { AccountOpeningInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type { AccountOverview } from "@/types/billing";

import { recordAudit } from "./audit.service";

/**
 * Abrechnungskonto: je TOP der Anfangssaldo zum Stichtag und alle Ein- und Auszahlungen
 * seither – fortlaufend über die Abrechnungsjahre. Es geht um tatsächliche Geldbewegungen;
 * Kosten und ihre Verteilung (die Abrechnung) fließen hier bewusst nicht ein.
 *
 * Bewegungen sind die Einzahlungen ab dem Stichtag, die offiziell zählen: eingegangen und
 * freigegeben. Negative Beträge sind Auszahlungen.
 *
 * Mit `account:read` sieht man ohne Blick auf alle TOPs nur das Konto der eigenen TOP – dort
 * aber alle Bewegungen, auch in Jahren, deren Abrechnung noch nicht freigegeben ist: ein
 * Kontostand ohne die laufenden Einzahlungen wäre falsch.
 */
export async function getAccountOverview(actor: SessionUser): Promise<AccountOverview> {
  authorize(actor, "account:read");
  const scope = getDataScope(actor);
  const db = getDb();

  const [[settings], unitRows] = await Promise.all([
    db.select().from(accountSettings).limit(1),
    db.select({ id: units.id, name: units.name }).from(units).orderBy(asc(units.number)),
  ]);
  const visible = unitRows.filter((unit) => scope.allUnits || unit.id === scope.unitId);
  const empty = { startDate: null, units: [], ...summarizeAccounts([]) };
  if (!settings || visible.length === 0) return { ...empty, startDate: settings?.startDate ?? null };

  const unitIds = visible.map((unit) => unit.id);
  const [openings, movements] = await Promise.all([
    db.select().from(accountOpeningBalances).where(inArray(accountOpeningBalances.unitId, unitIds)),
    db
      .select({
        id: payments.id,
        unitId: payments.unitId,
        date: payments.paymentDate,
        year: billingPeriods.year,
        purpose: payments.purpose,
        amountCents: payments.amountCents,
      })
      .from(payments)
      .innerJoin(billingPeriods, eq(billingPeriods.id, payments.periodId))
      .where(
        and(
          inArray(payments.unitId, unitIds),
          gte(payments.paymentDate, settings.startDate),
          // Nur was offiziell zählt: eingegangen und – falls eingereicht – freigegeben.
          eq(payments.status, "received"),
          eq(payments.reviewStatus, "approved"),
        ),
      )
      .orderBy(asc(payments.paymentDate), asc(payments.id)),
  ]);

  const accounts = visible.map((unit) => {
    const opening = openings.find((row) => row.unitId === unit.id);
    return buildUnitAccount(
      unit,
      { amountCents: opening?.amountCents ?? 0, note: opening?.note ?? null },
      movements.filter((movement) => movement.unitId === unit.id),
    );
  });

  return { startDate: settings.startDate, units: accounts, ...summarizeAccounts(accounts) };
}

/** Stichtag und Anfangssalden als Anzeigewerte – fürs Audit-Log. */
async function describeOpening(tx: DbExecutor): Promise<AuditSnapshot | null> {
  const [settings] = await tx.select().from(accountSettings).limit(1);
  if (!settings) return null;

  const rows = await tx
    .select({
      name: units.name,
      amountCents: accountOpeningBalances.amountCents,
      note: accountOpeningBalances.note,
    })
    .from(units)
    .leftJoin(accountOpeningBalances, eq(accountOpeningBalances.unitId, units.id))
    .orderBy(asc(units.number));

  return {
    Stichtag: formatDate(settings.startDate),
    ...Object.fromEntries(
      rows.flatMap((row) => [
        [`Anfangssaldo ${row.name}`, formatCents(row.amountCents ?? 0)],
        [`Notiz ${row.name}`, row.note],
      ]),
    ),
  };
}

/**
 * Legt den Stichtag und die Anfangssalden fest bzw. ändert sie. Nur für die Verwaltung –
 * und der einzige Weg, auf dem sich ein Anfangsbestand ändert: Einzahlungen und Auszahlungen
 * schreiben nie in diese Tabellen. Jede Änderung steht mit vorherigem und neuem Wert im Audit-Log.
 */
export async function saveAccountOpening(
  actor: SessionUser,
  input: AccountOpeningInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "account:manage");

  await getDb().transaction(async (tx) => {
    const unitRows = await tx.select({ id: units.id }).from(units);
    const known = new Set(unitRows.map((unit) => unit.id));
    if (input.balances.some((balance) => !known.has(balance.unitId))) {
      throw new DomainError("Mindestens eine TOP wurde nicht gefunden.");
    }

    const before = await describeOpening(tx);

    await tx
      .insert(accountSettings)
      .values({ id: 1, startDate: input.startDate, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: accountSettings.id,
        set: { startDate: input.startDate, updatedBy: actor.id, updatedAt: new Date() },
      });
    for (const balance of input.balances) {
      const values = { amountCents: balance.amountCents, note: balance.note, updatedBy: actor.id };
      await tx
        .insert(accountOpeningBalances)
        .values({ unitId: balance.unitId, ...values })
        .onConflictDoUpdate({
          target: accountOpeningBalances.unitId,
          set: { ...values, updatedAt: new Date() },
        });
    }

    const after = (await describeOpening(tx))!;
    const summary = `Abrechnungskonto – Stichtag ${after.Stichtag}`;
    if (!before) {
      await recordAudit(
        actor,
        { action: "account.opening_created", summary, details: { values: snapshotValues(after) } },
        tx,
      );
      return;
    }
    const changes = diffSnapshots(before, after);
    if (changes.length > 0) {
      await recordAudit(actor, { action: "account.opening_updated", summary, details: { changes } }, tx);
    }
  });
}
