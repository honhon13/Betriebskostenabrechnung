import type { AccountMovement, AccountOverview, UnitAccount } from "@/types/billing";

export interface AccountMovementInput {
  id: number;
  date: string;
  year: number;
  purpose: string | null;
  /** Positiv = Einzahlung, negativ = Auszahlung. */
  amountCents: number;
}

/**
 * Laufendes Konto einer TOP: Anfangssaldo zum Stichtag, danach jede Bewegung in
 * chronologischer Reihenfolge mit dem Saldo, der sich aus ihr ergibt.
 *
 *   Anfangssaldo + Einzahlungen − Auszahlungen = aktueller Saldo
 *
 * Der Anfangssaldo geht nur als Ausgangswert ein und wird von keiner Bewegung verändert.
 */
export function buildUnitAccount(
  unit: { id: number; name: string },
  opening: { amountCents: number; note: string | null },
  movements: AccountMovementInput[],
): UnitAccount {
  // Gleiches Datum: in der Reihenfolge der Erfassung.
  const ordered = [...movements].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  let balance = opening.amountCents;
  const ledger: AccountMovement[] = ordered.map((movement) => {
    balance += movement.amountCents;
    return { ...movement, balanceCents: balance };
  });

  const inflowCents = ordered
    .filter((movement) => movement.amountCents > 0)
    .reduce((sum, movement) => sum + movement.amountCents, 0);
  const outflowCents = ordered
    .filter((movement) => movement.amountCents < 0)
    .reduce((sum, movement) => sum - movement.amountCents, 0);

  return {
    unitId: unit.id,
    unitName: unit.name,
    openingCents: opening.amountCents,
    openingNote: opening.note,
    inflowCents,
    outflowCents,
    balanceCents: opening.amountCents + inflowCents - outflowCents,
    movements: ledger,
  };
}

/** Summen über mehrere Konten – der Gesamtbestand ist die Summe der Salden aller TOPs. */
export function summarizeAccounts(
  units: UnitAccount[],
): Pick<AccountOverview, "openingCents" | "inflowCents" | "outflowCents" | "balanceCents"> {
  const sum = (pick: (unit: UnitAccount) => number) => units.reduce((total, unit) => total + pick(unit), 0);
  return {
    openingCents: sum((unit) => unit.openingCents),
    inflowCents: sum((unit) => unit.inflowCents),
    outflowCents: sum((unit) => unit.outflowCents),
    balanceCents: sum((unit) => unit.balanceCents),
  };
}

/** Kontostand in Worten: Guthaben, Rückstand oder ausgeglichen. */
export function accountBalanceLabel(cents: number): "Guthaben" | "Rückstand" | "Ausgeglichen" {
  return cents > 0 ? "Guthaben" : cents < 0 ? "Rückstand" : "Ausgeglichen";
}
