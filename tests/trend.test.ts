import { describe, expect, it } from "vitest";

import { buildStatement, restrictStatementToUnit, type StatementInput } from "@/lib/billing/allocation";
import { buildMonthlyTrend, buildYearlyTrend } from "@/lib/billing/trend";

const cost = (id: number, amountCents: number, costDate: string | null, unitIds = [1, 2]) => ({
  id,
  description: `Position ${id}`,
  categoryId: 1,
  categoryName: "Test",
  costDate,
  amountCents,
  keyId: 1,
  keyName: "Gleiche Teile",
  keyUnitLabel: "",
  keySource: "equal" as const,
  unitIds,
  documents: [],
  createdAt: "2025-01-01T00:00:00.000Z",
});

const input: StatementInput = {
  units: [
    { id: 1, name: "TOP 1" },
    { id: 2, name: "TOP 2" },
  ],
  costs: [
    cost(1, 100_00, "2025-01-10"),
    cost(2, 40_00, "2025-01-20", [1]),
    cost(3, 60_00, "2025-12-01"),
    cost(4, 20_00, null),
  ],
  values: [],
  payments: [],
};
const statement = buildStatement(input);

describe("buildMonthlyTrend", () => {
  const trend = buildMonthlyTrend(2025, statement);

  it("ordnet den Kostenanteil je TOP den Monaten zu", () => {
    expect(trend.mode).toBe("months");
    expect(trend.units.map((u) => u.name)).toEqual(["TOP 1", "TOP 2"]);
    expect(trend.points[0]).toMatchObject({ label: "Jän", title: "Jänner 2025", shares: [90_00, 50_00], totalCents: 140_00 });
    expect(trend.points[1].totalCents).toBe(0);
    expect(trend.points[11]).toMatchObject({ label: "Dez", shares: [30_00, 30_00] });
  });

  it("führt Positionen ohne Datum in einer eigenen Spalte, damit die Summe stimmt", () => {
    expect(trend.points).toHaveLength(13);
    expect(trend.points[12]).toMatchObject({ label: "o. D.", shares: [10_00, 10_00] });
    expect(trend.totalCents).toBe(statement.totalCostCents);
  });

  it("lässt die Spalte „ohne Datum“ weg, wenn alles datiert ist", () => {
    const dated = buildStatement({ ...input, costs: input.costs.slice(0, 3) });
    expect(buildMonthlyTrend(2025, dated).points).toHaveLength(12);
  });

  it("weist Kosten ohne Schlüsselwerte als „nicht verteilt“ aus", () => {
    const undistributed = buildStatement({
      ...input,
      costs: [{ ...cost(9, 80_00, "2025-03-05"), keySource: "manual" as const }],
    });
    const march = buildMonthlyTrend(2025, undistributed).points[2];
    expect(march).toMatchObject({ shares: [0, 0], undistributedCents: 80_00, totalCents: 80_00 });
  });

  it("zeigt für eine einzelne TOP nur deren Anteil", () => {
    const own = buildMonthlyTrend(2025, restrictStatementToUnit(statement, 2));
    expect(own.units).toEqual([{ id: 2, name: "TOP 2" }]);
    expect(own.points[0].shares).toEqual([50_00]);
    // Die nur TOP 1 zugeordnete Position (40 €) kommt nicht vor.
    expect(own.totalCents).toBe(50_00 + 30_00 + 10_00);
  });
});

describe("buildYearlyTrend", () => {
  it("stellt die Abrechnungsjahre aufsteigend nebeneinander", () => {
    const smaller = buildStatement({ ...input, costs: [cost(7, 50_00, "2024-06-01")] });
    const trend = buildYearlyTrend([
      { year: 2025, statement },
      { year: 2024, statement: smaller },
    ]);
    expect(trend.mode).toBe("years");
    expect(trend.points.map((p) => p.label)).toEqual(["2024", "2025"]);
    expect(trend.points[0]).toMatchObject({ title: "Abrechnungsjahr 2024", shares: [25_00, 25_00] });
    expect(trend.points[1].totalCents).toBe(220_00);
    expect(trend.totalCents).toBe(270_00);
  });

  it("kommt mit keinem einzigen Jahr zurecht", () => {
    expect(buildYearlyTrend([])).toEqual({
      mode: "years",
      units: [],
      points: [],
      costCents: 0,
      creditCents: 0,
      totalCents: 0,
    });
  });
});

describe("Gutschriften im Kostenverlauf", () => {
  // Gutschrift über 20 € im Jänner, je zur Hälfte für TOP 1 und TOP 2.
  const withCredit = buildStatement({ ...input, costs: [...input.costs, cost(5, -20_00, "2025-01-25")] });

  it("stehen neben den Kosten – die Säulen der TOPs bleiben unverändert", () => {
    const trend = buildMonthlyTrend(2025, withCredit);
    const before = buildMonthlyTrend(2025, statement);
    expect(trend.points.map((p) => p.shares)).toEqual(before.points.map((p) => p.shares));
    expect(trend.points[0]).toMatchObject({ shares: [90_00, 50_00], creditCents: 20_00, totalCents: 120_00 });
    expect(trend.points[1].creditCents).toBe(0);
    expect(trend).toMatchObject({ costCents: 220_00, creditCents: 20_00, totalCents: 200_00 });
    expect(trend.totalCents).toBe(withCredit.totalCostCents);
  });

  it("zählen für eine einzelne TOP nur mit ihrem Anteil", () => {
    const own = buildMonthlyTrend(2025, restrictStatementToUnit(withCredit, 2));
    expect(own.points[0]).toMatchObject({ shares: [50_00], creditCents: 10_00, totalCents: 40_00 });
    expect(own.creditCents).toBe(10_00);
  });

  it("erscheinen auch im Jahresvergleich und ohne Datum", () => {
    const undated = buildStatement({ ...input, costs: [cost(6, -8_00, null)] });
    expect(buildMonthlyTrend(2025, undated).points[12]).toMatchObject({ label: "o. D.", creditCents: 8_00 });

    const years = buildYearlyTrend([{ year: 2025, statement: withCredit }]);
    expect(years.points[0]).toMatchObject({ shares: [130_00, 90_00], creditCents: 20_00, totalCents: 200_00 });
  });

  it("zählen unverteilte Gutschriften mit, aber nicht als unverteilte Kosten", () => {
    const undistributed = buildStatement({
      ...input,
      costs: [{ ...cost(9, -80_00, "2025-03-05"), keySource: "manual" as const }],
    });
    expect(buildMonthlyTrend(2025, undistributed).points[2]).toMatchObject({
      shares: [0, 0],
      undistributedCents: 0,
      creditCents: 80_00,
      totalCents: -80_00,
    });
  });
});
