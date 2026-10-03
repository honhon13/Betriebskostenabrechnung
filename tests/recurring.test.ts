import { describe, expect, it } from "vitest";

import { recurringDescription, recurringSlots, slotsPerYear } from "@/lib/billing/recurring";

describe("Zeiträume wiederkehrender Kosten", () => {
  it("monatlich: zwölf Monate mit erstem und letztem Tag", () => {
    const slots = recurringSlots("monthly", 2026);
    expect(slots).toHaveLength(12);
    expect(slots[0]).toEqual({ index: 1, label: "Jänner 2026", start: "2026-01-01", end: "2026-01-31" });
    expect(slots[1].end).toBe("2026-02-28");
    expect(slots[11]).toMatchObject({ index: 12, label: "Dezember 2026", end: "2026-12-31" });
  });

  it("kennt den Schalttag", () => {
    expect(recurringSlots("monthly", 2028)[1].end).toBe("2028-02-29");
    expect(recurringSlots("quarterly", 2028)[0].end).toBe("2028-03-31");
  });

  it("quartalsweise: vier Quartale, lückenlos über das Jahr", () => {
    const slots = recurringSlots("quarterly", 2026);
    expect(slots.map((slot) => [slot.start, slot.end])).toEqual([
      ["2026-01-01", "2026-03-31"],
      ["2026-04-01", "2026-06-30"],
      ["2026-07-01", "2026-09-30"],
      ["2026-10-01", "2026-12-31"],
    ]);
    expect(slots[2].label).toBe("3. Quartal 2026");
  });

  it("jährlich: das ganze Abrechnungsjahr", () => {
    expect(recurringSlots("yearly", 2026)).toEqual([
      { index: 1, label: "2026", start: "2026-01-01", end: "2026-12-31" },
    ]);
  });

  it("slotsPerYear passt zur Zahl der Zeiträume", () => {
    for (const interval of ["monthly", "quarterly", "yearly"] as const) {
      expect(recurringSlots(interval, 2026)).toHaveLength(slotsPerYear(interval));
    }
  });

  it("hängt den Zeitraum an die Beschreibung und bleibt innerhalb von 200 Zeichen", () => {
    const [slot] = recurringSlots("monthly", 2026);
    expect(recurringDescription("Hausbetreuung", slot)).toBe("Hausbetreuung Jänner 2026");
    const long = recurringDescription("x".repeat(300), slot);
    expect(long).toHaveLength(200);
    expect(long.endsWith(" Jänner 2026")).toBe(true);
  });
});
