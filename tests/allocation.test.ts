import { describe, expect, it } from "vitest";

import {
  allocate,
  buildStatement,
  isCredit,
  restrictStatementToUnit,
  summarizeStatement,
  toMilli,
  type StatementInput,
} from "@/lib/billing/allocation";
import { buildMonthlyOverview } from "@/lib/billing/monthly";

const cents = (result: ReturnType<typeof allocate>) => result.shares.map((s) => s.cents);

describe("toMilli", () => {
  it("liest Dezimalwerte ohne Gleitkommafehler", () => {
    expect(toMilli("78.50")).toBe(78500n);
    expect(toMilli("0.1")).toBe(100n);
    expect(toMilli(104.2)).toBe(104200n);
    expect(toMilli("3")).toBe(3000n);
  });

  it("behandelt Unlesbares als 0", () => {
    expect(toMilli("abc")).toBe(0n);
    expect(toMilli("")).toBe(0n);
  });
});

describe("allocate", () => {
  it("verteilt im Verhältnis der Gewichte", () => {
    const result = allocate(100_00, [
      { unitId: 1, weight: "50" },
      { unitId: 2, weight: "30" },
      { unitId: 3, weight: "20" },
    ]);
    expect(cents(result)).toEqual([50_00, 30_00, 20_00]);
    expect(result.distributable).toBe(true);
  });

  it("verliert keinen Cent: die Summe der Anteile ist immer der Betrag", () => {
    const result = allocate(100_00, [
      { unitId: 1, weight: 1 },
      { unitId: 2, weight: 1 },
      { unitId: 3, weight: 1 },
    ]);
    expect(cents(result)).toEqual([33_34, 33_33, 33_33]);
    expect(cents(result).reduce((a, b) => a + b, 0)).toBe(100_00);
  });

  it("gibt Restcents an die größten Rundungsverluste", () => {
    // 10,00 € auf 78,5 / 104,2 / 56,3 m² → exakt 3,2845… / 4,3598… / 2,3556…
    const result = allocate(10_00, [
      { unitId: 1, weight: "78.50" },
      { unitId: 2, weight: "104.20" },
      { unitId: 3, weight: "56.30" },
    ]);
    expect(cents(result)).toEqual([3_28, 4_36, 2_36]);
  });

  it("bleibt bei ungeraden Beträgen und vielen Fällen summentreu", () => {
    const weights = [
      { unitId: 1, weight: "78.50" },
      { unitId: 2, weight: "104.20" },
      { unitId: 3, weight: "56.30" },
    ];
    for (const amount of [1, 2, 7, 99, 1_01, 1284_60, 999_999_99, -438_91]) {
      const total = cents(allocate(amount, weights)).reduce((a, b) => a + b, 0);
      expect(total).toBe(amount);
    }
  });

  it("verteilt Gutschriften mit negativem Vorzeichen", () => {
    const result = allocate(-100_00, [
      { unitId: 1, weight: 1 },
      { unitId: 2, weight: 3 },
    ]);
    expect(cents(result)).toEqual([-25_00, -75_00]);
  });

  it("ordnet einer einzelnen TOP den vollen Betrag zu", () => {
    expect(cents(allocate(189_00, [{ unitId: 1, weight: 1 }]))).toEqual([189_00]);
  });

  it("meldet nicht verteilbar, wenn alle Gewichte 0 sind", () => {
    const result = allocate(100_00, [
      { unitId: 1, weight: "0" },
      { unitId: 2, weight: "0" },
    ]);
    expect(result.distributable).toBe(false);
    expect(cents(result)).toEqual([0, 0]);
  });

  it("ignoriert negative Gewichte", () => {
    const result = allocate(100_00, [
      { unitId: 1, weight: "-5" },
      { unitId: 2, weight: "10" },
    ]);
    expect(cents(result)).toEqual([0, 100_00]);
  });
});

const input: StatementInput = {
  units: [
    { id: 1, name: "TOP 1" },
    { id: 2, name: "TOP 2" },
    { id: 3, name: "TOP 3" },
  ],
  costs: [
    {
      id: 10,
      description: "Versicherung",
      categoryId: 1,
      categoryName: "Gebäudeversicherung",
      costDate: "2025-01-10",
      amountCents: 1000_00,
      keyId: 1,
      keyName: "Wohnfläche",
      keyUnitLabel: "m²",
      keySource: "unit_area",
      unitIds: [1, 2, 3],
      documents: [{ id: 7, fileName: "versicherung.pdf", type: "invoice", mimeType: "application/pdf" }],
      createdAt: "2025-01-11T08:00:00.000Z",
    },
    {
      id: 11,
      description: "Thermenwartung TOP 1",
      categoryId: 2,
      categoryName: "Wartung",
      costDate: "2025-09-18",
      amountCents: 189_00,
      keyId: 4,
      keyName: "Gleiche Teile",
      keyUnitLabel: "",
      keySource: "equal",
      unitIds: [1],
      documents: [],
      createdAt: "2025-09-19T08:00:00.000Z",
    },
    {
      id: 12,
      description: "Wasser",
      categoryId: 3,
      categoryName: "Wasser",
      costDate: null,
      amountCents: 300_00,
      keyId: 3,
      keyName: "Verbrauch",
      keyUnitLabel: "m³",
      keySource: "manual",
      unitIds: [1, 2, 3],
      documents: [],
      createdAt: "2025-12-16T08:00:00.000Z",
    },
  ],
  values: [
    { keyId: 1, unitId: 1, value: "50.000" },
    { keyId: 1, unitId: 2, value: "30.000" },
    { keyId: 1, unitId: 3, value: "20.000" },
    // Für "Verbrauch" (keyId 3) wurden noch keine Werte erfasst.
  ],
  payments: [
    { unitId: 1, amountCents: 600_00 },
    { unitId: 1, amountCents: 100_00, status: "received" },
    { unitId: 2, amountCents: 250_00 },
    // Erwartet bzw. storniert – beides darf den Saldo nicht verändern.
    { unitId: 2, amountCents: 40_00, status: "pending" },
    { unitId: 3, amountCents: 999_00, status: "cancelled" },
  ],
};

describe("buildStatement", () => {
  const statement = buildStatement(input);

  it("berechnet Kostenanteil, Einzahlungen und Saldo je TOP", () => {
    const balance = (costCents: number, paymentCents: number, pendingPaymentCents = 0) => ({
      costBeforeCreditsCents: costCents,
      creditCents: 0,
      costCents,
      paymentCents,
      pendingPaymentCents,
      balanceCents: paymentCents - costCents,
    });
    expect(statement.balances).toEqual([
      { unitId: 1, unitName: "TOP 1", ...balance(689_00, 700_00) },
      { unitId: 2, unitName: "TOP 2", ...balance(300_00, 250_00, 40_00) },
      { unitId: 3, unitName: "TOP 3", ...balance(200_00, 0) },
    ]);
  });

  it("zählt nur eingegangene Einzahlungen – offene und stornierte nicht", () => {
    expect(statement.totalPaymentCents).toBe(950_00);
    expect(statement.balances[1].balanceCents).toBe(-50_00);
    expect(statement.balances[2].paymentCents).toBe(0);
  });

  it("reicht verknüpfte Dokumente je Kostenposition durch", () => {
    expect(statement.lines.find((l) => l.costId === 10)?.documents).toHaveLength(1);
    expect(statement.lines.find((l) => l.costId === 11)?.documents).toEqual([]);
  });

  it("weist Kosten ohne Schlüsselwerte als unverteilt aus", () => {
    expect(statement.undistributedCents).toBe(300_00);
    expect(statement.lines.find((l) => l.costId === 12)?.distributable).toBe(false);
    expect(statement.totalCostCents).toBe(1489_00);
  });

  it("beschränkt direkt zugeordnete Kosten auf die gewählte TOP", () => {
    const line = statement.lines.find((l) => l.costId === 11)!;
    expect(line.shares).toEqual([{ unitId: 1, cents: 189_00, weight: 1 }]);
  });
});

describe("restrictStatementToUnit", () => {
  const own = restrictStatementToUnit(buildStatement(input), 3);

  it("enthält nur Positionen mit Beteiligung der eigenen TOP", () => {
    expect(own.lines.map((l) => l.costId)).toEqual([10, 12]);
  });

  it("gibt keine Anteile oder Salden anderer TOPs heraus", () => {
    expect(own.lines.flatMap((l) => l.shares.map((s) => s.unitId))).toEqual([3, 3]);
    expect(own.balances.map((b) => b.unitId)).toEqual([3]);
    expect(own.totalPaymentCents).toBe(0);
  });

  it("liefert für Benutzer ohne TOP nichts", () => {
    const none = restrictStatementToUnit(buildStatement(input), null);
    expect(none.lines).toEqual([]);
    expect(none.balances).toEqual([]);
  });
});

describe("summarizeStatement", () => {
  const statement = buildStatement(input);

  it("rechnet über alle TOPs mit dem vollen Betrag, auch für noch nicht verteilte Kosten", () => {
    expect(summarizeStatement(statement, true)).toEqual({
      costBeforeCreditsCents: 1489_00,
      creditCents: 0,
      creditCount: 0,
      costCents: 1489_00,
      paymentCents: 950_00,
      pendingPaymentCents: 40_00,
      balanceCents: 950_00 - 1489_00,
    });
  });

  it("rechnet für eine einzelne TOP nur mit ihrem Anteil", () => {
    const own = restrictStatementToUnit(statement, 1);
    expect(summarizeStatement(own, false)).toEqual({
      costBeforeCreditsCents: 689_00,
      creditCents: 0,
      creditCount: 0,
      costCents: 689_00,
      paymentCents: 700_00,
      pendingPaymentCents: 0,
      balanceCents: 11_00,
    });
  });
});

describe("buildMonthlyOverview", () => {
  const overview = buildMonthlyOverview(
    2025,
    [
      { date: "2025-01-10", cents: 1000_00 },
      { date: "2025-01-31", cents: 50_00 },
      { date: "2025-12-15", cents: 300_00 },
      { date: null, cents: 189_00 },
    ],
    [
      { date: "2025-01-05", cents: 450_00 },
      { date: "2025-02-05", cents: 450_00 },
      // Nachzahlung im Folgejahr – gehört zum Abrechnungsjahr, aber in keinen seiner Monate.
      { date: "2026-03-01", cents: 200_00 },
    ],
  );

  it("ordnet Kosten und Einzahlungen den Monaten zu", () => {
    expect(overview.rows).toHaveLength(12);
    expect(overview.rows[0]).toEqual({
      month: 1,
      costCents: 1050_00,
      creditCents: 0,
      paymentCents: 450_00,
      differenceCents: -600_00,
      cumulativeCents: -600_00,
    });
    expect(overview.rows[1]).toMatchObject({ month: 2, costCents: 0, paymentCents: 450_00, cumulativeCents: -150_00 });
    expect(overview.rows[11]).toMatchObject({ month: 12, costCents: 300_00, cumulativeCents: -450_00 });
  });

  it("sammelt Einträge ohne Datum bzw. außerhalb des Jahres, damit die Summen stimmen", () => {
    expect(overview.other).toEqual({
      month: null,
      costCents: 189_00,
      creditCents: 0,
      paymentCents: 200_00,
      differenceCents: 11_00,
      cumulativeCents: -439_00,
    });
    expect(overview.totalCostCents).toBe(1539_00);
    expect(overview.totalPaymentCents).toBe(1100_00);
  });

  it("lässt die Sammelzeile weg, wenn alles in den Monaten liegt", () => {
    expect(buildMonthlyOverview(2025, [{ date: "2025-06-01", cents: 1 }], []).other).toBeNull();
  });
});

describe("Gutschriften", () => {
  // Gutschrift der Versicherung über 100 €, verteilt wie die Rechnung (Wohnfläche 50 : 30 : 20).
  const credit = {
    ...input.costs[0],
    id: 13,
    description: "Gutschrift Versicherung",
    costDate: "2025-03-01",
    amountCents: -100_00,
    documents: [],
  };
  const withCredit: StatementInput = { ...input, costs: [...input.costs, credit] };
  const statement = buildStatement(withCredit);
  const before = buildStatement(input);

  it("führt die Gutschrift als eigene Position – Kosten, Gutschriften und Nettokosten getrennt", () => {
    expect(statement.lines.find((l) => l.costId === 13)).toMatchObject({
      credit: true,
      amountCents: -100_00,
      shares: [
        { unitId: 1, cents: -50_00 },
        { unitId: 2, cents: -30_00 },
        { unitId: 3, cents: -20_00 },
      ],
    });
    expect(statement.lines.filter((l) => l.credit)).toHaveLength(1);
    expect(statement.costBeforeCreditsCents).toBe(1489_00);
    expect(statement.creditCents).toBe(100_00);
    expect(statement.creditCount).toBe(1);
    expect(statement.totalCostCents).toBe(1389_00);
  });

  it("lässt die ursprünglichen Kostenpositionen und ihre Anteile unverändert", () => {
    const costLines = (s: typeof statement) => s.lines.filter((l) => !l.credit);
    expect(costLines(statement)).toEqual(costLines(before));
    expect(statement.costBeforeCreditsCents).toBe(before.totalCostCents);
  });

  it("verändert keine Einzahlungen – nur der Saldo folgt den Nettokosten", () => {
    expect(statement.totalPaymentCents).toBe(before.totalPaymentCents);
    for (const [index, balance] of statement.balances.entries()) {
      expect(balance.paymentCents).toBe(before.balances[index].paymentCents);
      expect(balance.pendingPaymentCents).toBe(before.balances[index].pendingPaymentCents);
    }
    expect(statement.balances[0]).toMatchObject({
      costBeforeCreditsCents: 689_00,
      creditCents: 50_00,
      costCents: 639_00,
      paymentCents: 700_00,
      balanceCents: 61_00,
    });
  });

  it("rechnet je TOP: Kostenanteil minus Gutschriftanteil = Nettokosten", () => {
    for (const balance of statement.balances) {
      expect(balance.costCents).toBe(balance.costBeforeCreditsCents - balance.creditCents);
    }
    const sum = (pick: (b: (typeof statement.balances)[number]) => number) =>
      statement.balances.reduce((acc, b) => acc + pick(b), 0);
    // Die Gutschrift geht ohne Rundungsdifferenz auf die TOPs auf.
    expect(sum((b) => b.creditCents)).toBe(statement.creditCents);
  });

  it("verteilt auch krumme Gutschriften cent-genau", () => {
    const odd = buildStatement({
      ...input,
      costs: [{ ...credit, amountCents: -100_00, keyId: 4, keySource: "equal" }],
    });
    expect(odd.balances.map((b) => b.creditCents)).toEqual([33_34, 33_33, 33_33]);
    expect(odd.balances.map((b) => b.costCents)).toEqual([-33_34, -33_33, -33_33]);
    expect(odd.totalCostCents).toBe(-100_00);
  });

  it("weist die Summen über alle TOPs und für eine einzelne TOP getrennt aus", () => {
    expect(summarizeStatement(statement, true)).toMatchObject({
      costBeforeCreditsCents: 1489_00,
      creditCents: 100_00,
      creditCount: 1,
      costCents: 1389_00,
      paymentCents: 950_00,
      balanceCents: 950_00 - 1389_00,
    });
    const own = restrictStatementToUnit(statement, 3);
    expect(own.creditCount).toBe(1);
    expect(summarizeStatement(own, false)).toMatchObject({
      costBeforeCreditsCents: 200_00,
      creditCents: 20_00,
      creditCount: 1,
      costCents: 180_00,
    });
  });

  it("zeigt einer TOP keine Gutschrift, an der sie nicht beteiligt ist", () => {
    const onlyTop1 = buildStatement({ ...input, costs: [...input.costs, { ...credit, unitIds: [1] }] });
    const own = restrictStatementToUnit(onlyTop1, 3);
    expect(own.lines.some((l) => l.credit)).toBe(false);
    expect(own.creditCount).toBe(0);
    expect(own.creditCents).toBe(0);
    expect(summarizeStatement(own, false).creditCents).toBe(0);
  });

  it("ohne Gutschriften ist die Summe 0 – nicht -0", () => {
    expect(Object.is(before.creditCents, 0)).toBe(true);
    expect(before.balances.every((b) => Object.is(b.creditCents, 0))).toBe(true);
    expect(isCredit(-1)).toBe(true);
    expect(isCredit(0)).toBe(false);
    expect(isCredit(1)).toBe(false);
  });

  it("führt Gutschriften in der Monatsübersicht in einer eigenen Spalte", () => {
    const overview = buildMonthlyOverview(
      2025,
      [
        { date: "2025-01-10", cents: 1000_00 },
        { date: "2025-01-20", cents: -30_00 },
        { date: "2025-02-01", cents: -20_00 },
        { date: null, cents: -5_00 },
      ],
      [{ date: "2025-01-05", cents: 450_00 }],
    );
    expect(overview.rows[0]).toEqual({
      month: 1,
      costCents: 1000_00,
      creditCents: 30_00,
      paymentCents: 450_00,
      differenceCents: 450_00 - 970_00,
      cumulativeCents: -520_00,
    });
    // Ein Monat nur mit Gutschrift: die Differenz ist ein Plus.
    expect(overview.rows[1]).toMatchObject({ costCents: 0, creditCents: 20_00, differenceCents: 20_00 });
    expect(overview.other).toMatchObject({ costCents: 0, creditCents: 5_00, differenceCents: 5_00 });
    expect(overview.totalCostCents).toBe(1000_00);
    expect(overview.totalCreditCents).toBe(55_00);
    expect(overview.totalPaymentCents).toBe(450_00);
  });
});
