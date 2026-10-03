import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildStatement, restrictStatementToUnit } from "@/lib/billing/allocation";
import {
  annualStatementFileName,
  describeBalance,
  renderAnnualStatement,
  type AnnualStatementData,
} from "@/lib/pdf/annual-statement";

const UNITS = [
  { id: 1, name: "TOP 1" },
  { id: 2, name: "TOP 2" },
  { id: 3, name: "TOP 3" },
];

function cost(id: number, description: string, amountCents: number, categoryId = 1) {
  return {
    id,
    description,
    categoryId,
    categoryName: categoryId === 1 ? "Gebäudeversicherung" : "Müllabfuhr",
    costDate: "2025-03-15",
    amountCents,
    keyId: 1,
    keyName: "Wohnfläche",
    keyUnitLabel: "m²",
    keySource: "unit_area" as const,
    unitIds: [1, 2, 3],
    documents:
      id % 2 === 0
        ? [{ id, fileName: `rechnung-${id}.pdf`, type: "invoice" as const, mimeType: "application/pdf" }]
        : [],
    createdAt: "2025-03-15T10:00:00.000Z",
  };
}

function sample(costs: ReturnType<typeof cost>[]): AnnualStatementData {
  const payments = [
    { unitId: 1, unitName: "TOP 1", paymentDate: "2025-01-05", amountCents: 150_00, purpose: "Akonto Jänner" },
    { unitId: 2, unitName: "TOP 2", paymentDate: "2025-01-07", amountCents: 190_00, purpose: null },
  ];
  return {
    year: 2025,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    status: "released",
    releasedAt: "2026-02-01T09:30:00.000Z",
    focus: null,
    statement: buildStatement({
      units: UNITS,
      costs,
      values: [
        { keyId: 1, unitId: 1, value: "78.5" },
        { keyId: 1, unitId: 2, value: "104.2" },
        { keyId: 1, unitId: 3, value: "56.3" },
      ],
      payments,
    }),
    payments,
    generatedAt: new Date("2026-02-02T08:00:00.000Z"),
  };
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("Jahresabrechnung als PDF", () => {
  it("erzeugt die Gesamtabrechnung als gültiges PDF", async () => {
    const bytes = await renderAnnualStatement(sample([cost(1, "Jahresprämie", 1798_40), cost(2, "Müllgebühr", 631_20, 2)]));
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(await pageCount(bytes)).toBeLessThanOrEqual(2);
  });

  it("erzeugt die Abrechnung einer einzelnen TOP", async () => {
    const data = sample([cost(1, "Jahresprämie", 1798_40), cost(2, "Müllgebühr", 631_20, 2)]);
    const bytes = await renderAnnualStatement({
      ...data,
      focus: { unitId: 1, unitName: "TOP 1" },
      statement: restrictStatementToUnit(data.statement, 1),
      payments: data.payments.filter((payment) => payment.unitId === 1),
    });
    expect(await pageCount(bytes)).toBe(1);
  });

  it("bricht lange Aufstellungen auf mehrere Seiten um", async () => {
    const many = Array.from({ length: 90 }, (_, index) => cost(index + 1, `Position ${index + 1}`, 100_00 + index));
    expect(await pageCount(await renderAnnualStatement(sample(many)))).toBeGreaterThan(2);
  });

  it("kommt ohne Kosten und Einzahlungen aus und kennzeichnet Entwürfe", async () => {
    const data = sample([]);
    const bytes = await renderAnnualStatement({ ...data, status: "draft", releasedAt: null, payments: [] });
    expect(await pageCount(bytes)).toBe(1);
  });

  it("scheitert nicht an Zeichen außerhalb des Zeichensatzes der Schrift", async () => {
    const data = sample([
      cost(1, "Reinigung → Stiegenhaus 🧹 Ünïcödé Кириллица " + "sehr-langer-dateiname-ohne-leerzeichen".repeat(6), -50_00),
    ]);
    await expect(renderAnnualStatement(data)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("beschreibt Guthaben, Nachzahlung und ausgeglichene Konten", () => {
    expect(describeBalance(1234)).toBe(`Guthaben ${"€ 12,34"}`);
    expect(describeBalance(-1234)).toBe(`Nachzahlung ${"€ 12,34"}`);
    expect(describeBalance(0)).toBe("Ausgeglichen");
  });

  it("benennt die Datei nach Jahr und TOP", () => {
    expect(annualStatementFileName({ year: 2025, focus: null })).toBe("Betriebskostenabrechnung-2025.pdf");
    expect(annualStatementFileName({ year: 2025, focus: { unitId: 1, unitName: "TOP 1" } })).toBe(
      "Betriebskostenabrechnung-2025-TOP-1.pdf",
    );
  });
});
