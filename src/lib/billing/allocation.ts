import type {
  AllocationSource,
  DocumentRef,
  PaymentStatus,
  Statement,
  StatementLine,
  UnitBalance,
} from "@/types/billing";

export interface Weight {
  unitId: number;
  /** Dezimalzahl mit höchstens drei Nachkommastellen (numeric(14,3) aus der Datenbank). */
  weight: string | number;
}

export interface AllocationResult {
  shares: { unitId: number; cents: number }[];
  /** false, wenn alle Gewichte 0 sind – dann lässt sich nichts verteilen. */
  distributable: boolean;
}

/** Dezimalwert → Tausendstel als BigInt, damit die Verteilung ohne Rundungsfehler rechnet. */
export function toMilli(value: string | number): bigint {
  const text = typeof value === "number" ? value.toFixed(3) : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?\d*$/.exec(text);
  if (!match) return 0n;
  const milli = BigInt(match[2]) * 1000n + BigInt((match[3] ?? "").padEnd(3, "0") || "0");
  return match[1] ? -milli : milli;
}

/**
 * Verteilt einen Betrag im Verhältnis der Gewichte auf die TOPs.
 * Restcents gehen nach dem Verfahren der größten Reste an die TOPs mit dem größten
 * Rundungsverlust – die Summe der Anteile entspricht immer exakt dem Betrag.
 */
export function allocate(amountCents: number, weights: Weight[]): AllocationResult {
  const entries = weights.map((w) => {
    const milli = toMilli(w.weight);
    return { unitId: w.unitId, weight: milli > 0n ? milli : 0n };
  });
  const total = entries.reduce((acc, e) => acc + e.weight, 0n);

  if (total === 0n) {
    return { shares: entries.map((e) => ({ unitId: e.unitId, cents: 0 })), distributable: false };
  }

  const sign = amountCents < 0 ? -1 : 1;
  const amount = BigInt(Math.abs(amountCents));

  const parts = entries.map((e) => ({
    unitId: e.unitId,
    weight: e.weight,
    cents: (amount * e.weight) / total,
    remainder: (amount * e.weight) % total,
  }));

  let leftover = amount - parts.reduce((acc, p) => acc + p.cents, 0n);
  const byRemainder = [...parts].sort(
    (a, b) =>
      Number(b.remainder - a.remainder) || Number(b.weight - a.weight) || a.unitId - b.unitId,
  );
  for (const part of byRemainder) {
    if (leftover === 0n) break;
    part.cents += 1n;
    leftover -= 1n;
  }

  return {
    // `|| 0` verhindert -0 bei Gutschriften ohne Anteil.
    shares: parts.map((p) => ({ unitId: p.unitId, cents: sign * Number(p.cents) || 0 })),
    distributable: true,
  };
}

export interface StatementInput {
  units: { id: number; name: string }[];
  costs: {
    id: number;
    description: string;
    categoryId: number;
    categoryName: string;
    costDate: string | null;
    amountCents: number;
    keyId: number;
    keyName: string;
    keyUnitLabel: string;
    keySource: AllocationSource;
    /** TOP-Zuordnung der Kostenposition. */
    unitIds: number[];
    documents: DocumentRef[];
    createdAt: string;
  }[];
  /** Schlüsselwerte des Abrechnungsjahres. */
  values: { keyId: number; unitId: number; value: string | number }[];
  /** Ohne Status gilt eine Einzahlung als eingegangen. */
  payments: { unitId: number; amountCents: number; status?: PaymentStatus }[];
}

/** Berechnet die Abrechnung eines Jahres über alle TOPs. */
export function buildStatement(input: StatementInput): Statement {
  const valueByKeyAndUnit = new Map(
    input.values.map((v) => [`${v.keyId}:${v.unitId}`, v.value] as const),
  );
  const knownUnits = new Set(input.units.map((u) => u.id));

  const lines: StatementLine[] = input.costs.map((cost) => {
    const weights: Weight[] = cost.unitIds
      .filter((unitId) => knownUnits.has(unitId))
      .map((unitId) => ({
        unitId,
        weight:
          cost.keySource === "equal" ? 1 : (valueByKeyAndUnit.get(`${cost.keyId}:${unitId}`) ?? 0),
      }));
    const { shares, distributable } = allocate(cost.amountCents, weights);
    const weightByUnit = new Map(weights.map((w) => [w.unitId, Number(toMilli(w.weight)) / 1000]));

    return {
      costId: cost.id,
      description: cost.description,
      categoryId: cost.categoryId,
      categoryName: cost.categoryName,
      costDate: cost.costDate,
      amountCents: cost.amountCents,
      credit: isCredit(cost.amountCents),
      keyName: cost.keyName,
      keyUnitLabel: cost.keyUnitLabel,
      totalWeight: [...weightByUnit.values()].reduce((a, b) => a + Math.max(b, 0), 0),
      shares: shares.map((s) => ({ ...s, weight: Math.max(weightByUnit.get(s.unitId) ?? 0, 0) })),
      distributable,
      documents: cost.documents,
      createdAt: cost.createdAt,
    };
  });

  const balances: UnitBalance[] = input.units.map((unit) => {
    // Kostenpositionen und Gutschriften getrennt summieren – jede Position ist für sich verteilt,
    // eine Gutschrift verändert daher nie den Anteil an einer anderen Position.
    const shareOf = (credit: boolean) =>
      lines
        .filter((line) => line.credit === credit)
        .reduce((acc, line) => acc + (line.shares.find((s) => s.unitId === unit.id)?.cents ?? 0), 0);
    const costBeforeCreditsCents = shareOf(false);
    const creditCents = -shareOf(true) || 0;
    const costCents = costBeforeCreditsCents - creditCents;
    // Nur eingegangene Zahlungen mindern den offenen Betrag; stornierte zählen nirgends.
    const sumByStatus = (status: PaymentStatus) =>
      input.payments
        .filter((p) => p.unitId === unit.id && (p.status ?? "received") === status)
        .reduce((acc, p) => acc + p.amountCents, 0);
    const paymentCents = sumByStatus("received");
    return {
      unitId: unit.id,
      unitName: unit.name,
      costBeforeCreditsCents,
      creditCents,
      costCents,
      paymentCents,
      pendingPaymentCents: sumByStatus("pending"),
      balanceCents: paymentCents - costCents,
    };
  });

  return { lines, balances, ...totalsOf(lines, balances) };
}

/** Negativer Betrag = Gutschrift. Die einzige Stelle, an der das Vorzeichen gedeutet wird. */
export function isCredit(amountCents: number): boolean {
  return amountCents < 0;
}

/** Summen über die Positionen einer Abrechnung – Kosten und Gutschriften getrennt. */
function totalsOf(lines: StatementLine[], balances: UnitBalance[]) {
  const sum = (selected: StatementLine[]) => selected.reduce((acc, l) => acc + l.amountCents, 0);
  const credits = lines.filter((l) => l.credit);
  const costBeforeCreditsCents = sum(lines.filter((l) => !l.credit));
  const creditCents = -sum(credits) || 0;

  return {
    costBeforeCreditsCents,
    creditCents,
    creditCount: credits.length,
    totalCostCents: costBeforeCreditsCents - creditCents,
    totalPaymentCents: balances.reduce((acc, b) => acc + b.paymentCents, 0),
    undistributedCents: sum(lines.filter((l) => !l.distributable)),
  };
}

/**
 * Schränkt eine Abrechnung auf eine TOP ein: nur Positionen, an denen sie beteiligt ist,
 * und nur ihr eigener Anteil. Werte anderer TOPs verlassen so nie den Server.
 */
export function restrictStatementToUnit(statement: Statement, unitId: number | null): Statement {
  const lines = statement.lines
    .filter((line) => line.shares.some((s) => s.unitId === unitId))
    .map((line) => ({ ...line, shares: line.shares.filter((s) => s.unitId === unitId) }));
  const balances = statement.balances.filter((b) => b.unitId === unitId);

  return { lines, balances, ...totalsOf(lines, balances) };
}

export interface StatementTotals {
  /** Kostenpositionen ohne Gutschriften. */
  costBeforeCreditsCents: number;
  /** Gutschriften, als positiver Betrag. */
  creditCents: number;
  creditCount: number;
  /** Nettokosten: Kostenpositionen minus Gutschriften. */
  costCents: number;
  paymentCents: number;
  pendingPaymentCents: number;
  /** Einzahlungen minus Kosten: positiv = Guthaben, negativ = Nachzahlung. */
  balanceCents: number;
}

/**
 * Summen einer Abrechnung. Über alle TOPs zählt der volle Betrag jeder Position
 * (auch noch nicht verteilbare Kosten); für eine einzelne TOP nur ihr Anteil.
 */
export function summarizeStatement(statement: Statement, allUnits: boolean): StatementTotals {
  const ofBalances = (pick: (balance: UnitBalance) => number) =>
    statement.balances.reduce((acc, b) => acc + pick(b), 0);
  const costBeforeCreditsCents = allUnits
    ? statement.costBeforeCreditsCents
    : ofBalances((b) => b.costBeforeCreditsCents);
  const creditCents = allUnits ? statement.creditCents : ofBalances((b) => b.creditCents);
  const costCents = costBeforeCreditsCents - creditCents;
  return {
    costBeforeCreditsCents,
    creditCents,
    creditCount: statement.creditCount,
    costCents,
    paymentCents: statement.totalPaymentCents,
    pendingPaymentCents: statement.balances.reduce((acc, b) => acc + b.pendingPaymentCents, 0),
    balanceCents: statement.totalPaymentCents - costCents,
  };
}
