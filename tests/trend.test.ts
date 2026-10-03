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
    expect(buildYearlyTrend([])).toEqual({ mode: "years", units: [], points: [], totalCents: 0 });
  });
});
