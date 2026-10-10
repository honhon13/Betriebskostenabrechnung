import { describe, expect, it } from "vitest";

import {
  ALL,
  COST_KIND_PARAMS,
  REVIEW_STATUS_PARAMS,
  countActive,
  inAmountRange,
  inDateRange,
  matchesSearch,
  monthRange,
  readAmount,
  readChoice,
  readDate,
  readMapped,
  readNumber,
  readParam,
  withParams,
} from "@/lib/filters";
import {
  filterCosts,
  filterMasterData,
  filterMovements,
  filterPayments,
  filterRecurring,
  filterReviewItems,
  filterSubmissions,
  filterUsers,
  filterYears,
  localDay,
  userStatusOf,
} from "@/lib/list-filters";
import type { CostDto, PaymentDto, RecurringCostDto } from "@/types/billing";

// ---------------------------------------------------------------------------
// Parameter aus der URL
// ---------------------------------------------------------------------------

describe("Filter aus der URL lesen", () => {
  it("behandelt leere Werte, „alle“ und Mehrfachangaben als nicht gesetzt", () => {
    expect(readParam({ q: " müll " }, "q")).toBe("müll");
    expect(readParam({ q: "" }, "q")).toBeUndefined();
    expect(readParam({ q: "   " }, "q")).toBeUndefined();
    expect(readParam({ top: ALL }, "top")).toBeUndefined();
    expect(readParam({ top: ["1", "2"] }, "top")).toBeUndefined();
    expect(readParam({}, "top")).toBeUndefined();
  });

  it("lässt nur bekannte Auswahlwerte durch", () => {
    expect(readChoice({ typ: "invoice" }, "typ", ["invoice", "contract"] as const)).toBe("invoice");
    expect(readChoice({ typ: "<script>" }, "typ", ["invoice", "contract"] as const)).toBeUndefined();
    expect(readMapped({ pruefung: "ausstehend" }, "pruefung", REVIEW_STATUS_PARAMS)).toBe("pending");
    expect(readMapped({ pruefung: "pending" }, "pruefung", REVIEW_STATUS_PARAMS)).toBeUndefined();
    expect(readMapped({ art: "gutschriften" }, "art", COST_KIND_PARAMS)).toBe("credit");
    expect(readMapped({}, "art", COST_KIND_PARAMS)).toBeUndefined();
  });

  it("liest Datum, Betrag und Zahl – Ungültiges fällt weg", () => {
    expect(readDate({ von: "2026-03-01" }, "von")).toBe("2026-03-01");
    expect(readDate({ von: "01.03.2026" }, "von")).toBeUndefined();
    expect(readDate({ von: "2026-13-45" }, "von")).toBeUndefined();

    expect(readAmount({ betragAb: "1.234,56" }, "betragAb")).toBe(123456);
    expect(readAmount({ betragAb: "50" }, "betragAb")).toBe(5000);
    // Verglichen wird ohne Vorzeichen.
    expect(readAmount({ betragAb: "-50,00" }, "betragAb")).toBe(5000);
    expect(readAmount({ betragAb: "viel" }, "betragAb")).toBeUndefined();
    expect(readAmount({ betragAb: "0" }, "betragAb")).toBe(0);

    expect(readNumber({ jahr: "2026" }, "jahr")).toBe(2026);
    expect(readNumber({ jahr: "0" }, "jahr")).toBeUndefined();
    expect(readNumber({ jahr: "2026 OR 1=1" }, "jahr")).toBeUndefined();
    expect(readNumber({ jahr: "-3" }, "jahr")).toBeUndefined();
  });

  it("zählt gesetzte Filter", () => {
    expect(countActive([undefined, "", null, false])).toBe(0);
    expect(countActive(["müll", undefined, 3, "open", 0])).toBe(4);
  });

  it("baut Links mit Filtern – leere Werte entfallen, der Anker bleibt hinten", () => {
    expect(withParams("/dokumente", { jahr: 2026, typ: undefined, q: "" })).toBe("/dokumente?jahr=2026");
    expect(withParams("/dokumente", {})).toBe("/dokumente");
    expect(withParams("/abrechnung/2026#top-2", { top: 2 })).toBe("/abrechnung/2026?top=2#top-2");
    expect(withParams("/dokumente", { q: "Müll & Co" })).toBe("/dokumente?q=M%C3%BCll+%26+Co");
    expect(withParams("/einzahlungen?jahr=2026", { top: 1 })).toBe("/einzahlungen?jahr=2026&top=1");
  });

  it("kennt die Grenzen eines Monats", () => {
    expect(monthRange(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(monthRange(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange(2026, 12).to).toBe("2026-12-31");
  });
});

describe("Vergleiche", () => {
  it("sucht über mehrere Felder – jedes Wort muss irgendwo vorkommen", () => {
    const fields = ["Müllgebühr Jahresvorschreibung", "Gemeinde", null, 2026];
    expect(matchesSearch(undefined, fields)).toBe(true);
    expect(matchesSearch("  ", fields)).toBe(true);
    expect(matchesSearch("müll", fields)).toBe(true);
    expect(matchesSearch("MÜLL gemeinde", fields)).toBe(true);
    expect(matchesSearch("2026", fields)).toBe(true);
    expect(matchesSearch("müll kanal", fields)).toBe(false);
    expect(matchesSearch("müll", [null, undefined])).toBe(false);
  });

  it("prüft den Zeitraum einschließlich beider Grenzen", () => {
    expect(inDateRange("2026-03-15", undefined, undefined)).toBe(true);
    expect(inDateRange(null, undefined, undefined)).toBe(true);
    expect(inDateRange("2026-03-01", "2026-03-01", "2026-03-31")).toBe(true);
    expect(inDateRange("2026-03-31", "2026-03-01", "2026-03-31")).toBe(true);
    expect(inDateRange("2026-04-01", "2026-03-01", "2026-03-31")).toBe(false);
    expect(inDateRange("2026-02-28", "2026-03-01", undefined)).toBe(false);
    expect(inDateRange("2026-05-01", undefined, "2026-04-30")).toBe(false);
    // Ohne Datum passt ein Eintrag nur, solange kein Zeitraum gefragt ist.
    expect(inDateRange(null, "2026-01-01", undefined)).toBe(false);
    // Zeitstempel zählen mit ihrem Tag.
    expect(inDateRange("2026-03-31T22:15:00.000Z", undefined, "2026-03-31")).toBe(true);
  });

  it("vergleicht Beträge ohne Vorzeichen", () => {
    expect(inAmountRange(50_00, undefined, undefined)).toBe(true);
    expect(inAmountRange(50_00, 50_00, 50_00)).toBe(true);
    expect(inAmountRange(49_99, 50_00, undefined)).toBe(false);
    expect(inAmountRange(-60_00, 50_00, 100_00)).toBe(true);
    expect(inAmountRange(-120_00, undefined, 100_00)).toBe(false);
    expect(inAmountRange(null, 1, undefined)).toBe(false);
    expect(inAmountRange(null, undefined, undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Listen
// ---------------------------------------------------------------------------

const cost = (id: number, values: Partial<CostDto>): CostDto => ({
  id,
  periodId: 1,
  categoryId: 1,
  categoryName: "Müllabfuhr",
  description: `Position ${id}`,
  amountCents: 100_00,
  costDate: "2026-03-15",
  supplier: null,
  invoiceNumber: null,
  servicePeriodStart: null,
  servicePeriodEnd: null,
  netAmountCents: null,
  taxAmountCents: null,
  allocationKeyId: 1,
  allocationKeyName: "Wohnfläche",
  notes: null,
  unitIds: [1, 2, 3],
  documents: [],
  createdAt: "2026-03-15T10:00:00.000Z",
  reviewStatus: "approved",
  reviewedAt: null,
  reviewComment: null,
  ...values,
});
const receipt = { id: 9, fileName: "rechnung.pdf", type: "invoice" as const, mimeType: "application/pdf" };

describe("filterCosts", () => {
  const costs = [
    cost(1, { description: "Müllgebühr", supplier: "Gemeinde", amountCents: 631_20, costDate: "2026-02-27" }),
    cost(2, { description: "Kehrung", categoryId: 2, categoryName: "Rauchfangkehrer", supplier: "Muster GmbH", invoiceNumber: "RE-42", documents: [receipt] }),
    cost(3, { description: "Gutschrift Kehrung", categoryId: 2, categoryName: "Rauchfangkehrer", amountCents: -60_00, costDate: "2026-04-02", documents: [receipt] }),
    cost(4, { description: "Thermenwartung", categoryId: 3, categoryName: "Wartung", unitIds: [1], costDate: null, reviewStatus: "pending", notes: "eingereicht von TOP 1" }),
  ];
  const ids = (filter: Parameters<typeof filterCosts>[1]) => filterCosts(costs, filter).map((c) => c.id);

  it("ohne Filter bleibt die Liste, wie sie ist", () => {
    expect(ids({})).toEqual([1, 2, 3, 4]);
  });

  it("sucht in Beschreibung, Kostenart, Rechnungssteller, Rechnungsnummer und Notiz", () => {
    expect(ids({ search: "kehrung" })).toEqual([2, 3]);
    expect(ids({ search: "gemeinde" })).toEqual([1]);
    expect(ids({ search: "re-42" })).toEqual([2]);
    expect(ids({ search: "wartung" })).toEqual([4]);
    expect(ids({ search: "top 1" })).toEqual([4]);
    expect(ids({ search: "gibt es nicht" })).toEqual([]);
  });

  it("filtert nach Kostenart, TOP, Art, Prüfstand und Beleg", () => {
    expect(ids({ categoryId: 2 })).toEqual([2, 3]);
    // Position 4 trägt nur TOP 1 – bei TOP 2 fehlt sie.
    expect(ids({ unitId: 2 })).toEqual([1, 2, 3]);
    expect(ids({ unitId: 1 })).toEqual([1, 2, 3, 4]);
    expect(ids({ kind: "credit" })).toEqual([3]);
    expect(ids({ kind: "cost" })).toEqual([1, 2, 4]);
    expect(ids({ reviewStatus: "pending" })).toEqual([4]);
    expect(ids({ receipt: "without" })).toEqual([1, 4]);
    expect(ids({ receipt: "with" })).toEqual([2, 3]);
  });

  it("filtert nach Zeitraum und Betrag – Gutschriften zählen mit ihrem Betrag ohne Vorzeichen", () => {
    expect(ids({ from: "2026-03-01", to: "2026-03-31" })).toEqual([2]);
    // Eine Position ohne Datum passt in keinen Zeitraum.
    expect(ids({ from: "2026-01-01" })).toEqual([1, 2, 3]);
    expect(ids({ minCents: 50_00, maxCents: 100_00 })).toEqual([2, 3, 4]);
    expect(ids({ minCents: 500_00 })).toEqual([1]);
  });

  it("kombiniert mehrere Filter mit UND", () => {
    expect(ids({ categoryId: 2, kind: "credit", receipt: "with", from: "2026-04-01" })).toEqual([3]);
    expect(ids({ categoryId: 2, kind: "cost", search: "muster", minCents: 100_00 })).toEqual([2]);
    expect(ids({ categoryId: 1, kind: "credit" })).toEqual([]);
  });
});

const payment = (id: number, values: Partial<PaymentDto>): PaymentDto => ({
  id,
  periodId: 1,
  year: 2026,
  unitId: 1,
  unitName: "TOP 1",
  paymentDate: "2026-01-05",
  amountCents: 150_00,
  purpose: "Betriebskosten-Akonto 01/2026",
  note: null,
  status: "received",
  documents: [],
  createdAt: "2026-01-05T08:00:00.000Z",
  reviewStatus: "approved",
  reviewedAt: null,
  reviewComment: null,
  ...values,
});

describe("filterPayments", () => {
  const payments = [
    payment(1, {}),
    payment(2, { paymentDate: "2026-02-05", purpose: "Betriebskosten-Akonto 02/2026" }),
    payment(3, { unitName: "TOP 3", paymentDate: "2026-03-10", amountCents: -80_00, purpose: "Rückzahlung Guthaben", note: "per Überweisung" }),
    payment(4, { paymentDate: "2026-03-20", amountCents: 40_00, purpose: null, reviewStatus: "pending" }),
  ];
  const ids = (filter: Parameters<typeof filterPayments>[1]) => filterPayments(payments, filter).map((p) => p.id);

  it("sucht in Verwendungszweck, Notiz und TOP", () => {
    expect(ids({ search: "akonto" })).toEqual([1, 2]);
    expect(ids({ search: "überweisung" })).toEqual([3]);
    expect(ids({ search: "top 3" })).toEqual([3]);
  });

  it("filtert nach Prüfstand, Ein-/Auszahlung, Zeitraum und Betrag", () => {
    expect(ids({ reviewStatus: "pending" })).toEqual([4]);
    expect(ids({ direction: "out" })).toEqual([3]);
    expect(ids({ direction: "in" })).toEqual([1, 2, 4]);
    expect(ids({ from: "2026-02-01", to: "2026-03-10" })).toEqual([2, 3]);
    expect(ids({ minCents: 80_00 })).toEqual([1, 2, 3]);
    expect(ids({ maxCents: 80_00 })).toEqual([3, 4]);
    expect(ids({ direction: "in", from: "2026-03-01", maxCents: 50_00 })).toEqual([4]);
  });
});

describe("filterMovements", () => {
  const movements = [
    { id: 1, date: "2026-01-05", year: 2026, purpose: "Akonto 01/2026", amountCents: 150_00, balanceCents: 150_00 },
    { id: 2, date: "2026-03-10", year: 2026, purpose: null, amountCents: -80_00, balanceCents: 70_00 },
    { id: 3, date: "2027-01-05", year: 2027, purpose: "Akonto 01/2027", amountCents: 150_00, balanceCents: 220_00 },
  ];

  it("filtert Bewegungen – die Salden je Zeile bleiben unangetastet", () => {
    const march = filterMovements(movements, { from: "2026-03-01", to: "2026-03-31" });
    expect(march).toEqual([movements[1]]);
    expect(march[0].balanceCents).toBe(70_00);
    // Eine Bewegung ohne Verwendungszweck heißt in der Liste „Auszahlung“ bzw. „Einzahlung“.
    expect(filterMovements(movements, { search: "auszahlung" }).map((m) => m.id)).toEqual([2]);
    expect(filterMovements(movements, { search: "akonto 2027" }).map((m) => m.id)).toEqual([3]);
    expect(filterMovements(movements, {})).toHaveLength(3);
  });
});

describe("filterReviewItems", () => {
  const item = (id: number, values: object) => ({
    kind: "cost" as const,
    id,
    title: `Eintrag ${id}`,
    detail: "",
    year: 2026,
    unitName: null as string | null,
    amountCents: 100_00 as number | null,
    submittedBy: "TOP 1" as string | null,
    submittedAt: "2026-03-15T10:00:00.000Z",
    ...values,
  });
  const items = [
    item(1, { title: "Kehrung", detail: "Rauchfangkehrer · Muster GmbH" }),
    item(2, { kind: "payment", title: "Einzahlung TOP 3", unitName: "TOP 3", submittedBy: "TOP 3", amountCents: 55_55 }),
    item(3, { kind: "document", title: "vertrag.pdf", amountCents: null, year: 2025 }),
    // 23:30 UTC am 31.03. ist in Wien bereits der 1. April.
    item(4, { kind: "period", title: "Abrechnungsjahr 2028", year: 2028, amountCents: null, submittedAt: "2026-03-31T23:30:00.000Z" }),
  ];
  const ids = (filter: Parameters<typeof filterReviewItems>[1]) => filterReviewItems(items, filter).map((i) => i.id);

  it("filtert nach Art, Jahr, Einreicher, Zeitraum und Betrag", () => {
    expect(ids({ kind: "payment" })).toEqual([2]);
    expect(ids({ year: 2025 })).toEqual([3]);
    expect(ids({ submittedBy: "TOP 3" })).toEqual([2]);
    expect(ids({ search: "muster" })).toEqual([1]);
    expect(ids({ search: "top 3" })).toEqual([2]);
    // Einträge ohne Betrag fallen bei einem Betragsfilter weg.
    expect(ids({ minCents: 1 })).toEqual([1, 2]);
    expect(ids({ kind: "cost", submittedBy: "TOP 3" })).toEqual([]);
  });

  it("rechnet den Tag der Einreichung in österreichischer Zeit", () => {
    expect(localDay("2026-03-31T23:30:00.000Z")).toBe("2026-04-01");
    expect(ids({ from: "2026-04-01" })).toEqual([4]);
    expect(ids({ to: "2026-03-31" })).toEqual([1, 2, 3]);
  });
});

describe("filterSubmissions", () => {
  const entries = [
    { id: 1, year: 2026, reviewStatus: "pending" as const, text: "Kehrung" },
    { id: 2, year: 2026, reviewStatus: "approved" as const, text: "Müllgebühr" },
    { id: 3, year: 2025, reviewStatus: "rejected" as const, text: "Kehrung Vorjahr" },
  ];
  const ids = (filter: Parameters<typeof filterSubmissions>[1]) =>
    filterSubmissions(entries, filter, (entry) => [entry.text]).map((entry) => entry.id);

  it("filtert eigene Eingaben nach Suchtext, Jahr und Prüfstand", () => {
    expect(ids({})).toEqual([1, 2, 3]);
    expect(ids({ search: "kehrung" })).toEqual([1, 3]);
    expect(ids({ year: 2026 })).toEqual([1, 2]);
    expect(ids({ reviewStatus: "rejected" })).toEqual([3]);
    expect(ids({ search: "kehrung", year: 2026, reviewStatus: "pending" })).toEqual([1]);
    expect(ids({ year: 2026, reviewStatus: "rejected" })).toEqual([]);
  });
});

describe("filterRecurring", () => {
  const template = (id: number, values: Partial<RecurringCostDto>): RecurringCostDto => ({
    id,
    categoryId: 1,
    categoryName: "Hausbetreuung / Reinigung",
    description: `Vorlage ${id}`,
    amountType: "fixed",
    amountCents: 100_00,
    interval: "monthly",
    supplier: null,
    allocationKeyId: 1,
    allocationKeyName: "Wohnfläche",
    unitIds: [1, 2, 3],
    notes: null,
    isActive: true,
    generated: {},
    ...values,
  });
  const templates = [
    template(1, { description: "Stiegenhausreinigung", supplier: "Blitzblank" }),
    template(2, { description: "Versicherung", categoryId: 2, categoryName: "Gebäudeversicherung", interval: "yearly" }),
    template(3, { description: "Thermenwartung", categoryId: 3, categoryName: "Wartung", interval: "yearly", unitIds: [1], isActive: false }),
  ];
  const ids = (filter: Parameters<typeof filterRecurring>[1]) => filterRecurring(templates, filter).map((t) => t.id);

  it("filtert Vorlagen nach Suchtext, Kostenart, Intervall, Status und TOP", () => {
    expect(ids({ search: "blitzblank" })).toEqual([1]);
    expect(ids({ categoryId: 2 })).toEqual([2]);
    expect(ids({ interval: "yearly" })).toEqual([2, 3]);
    expect(ids({ active: false })).toEqual([3]);
    expect(ids({ active: true })).toEqual([1, 2]);
    expect(ids({ unitId: 2 })).toEqual([1, 2]);
    expect(ids({ interval: "yearly", active: true })).toEqual([2]);
  });
});

describe("filterYears", () => {
  const years = [
    { period: { year: 2024, status: "released" as const } },
    { period: { year: 2025, status: "released" as const } },
    { period: { year: 2026, status: "draft" as const } },
  ];
  const list = (filter: Parameters<typeof filterYears>[1]) => filterYears(years, filter).map((y) => y.period.year);

  it("filtert Abrechnungsjahre nach Status und Zeitraum", () => {
    expect(list({ status: "draft" })).toEqual([2026]);
    expect(list({ fromYear: 2025 })).toEqual([2025, 2026]);
    expect(list({ fromYear: 2024, toYear: 2025, status: "released" })).toEqual([2024, 2025]);
    expect(list({ fromYear: 2026, toYear: 2024 })).toEqual([]);
  });
});

describe("filterUsers und filterMasterData", () => {
  const user = (username: string, values: object) => ({
    username,
    displayName: username.toUpperCase(),
    roleId: 2,
    roleName: "Benutzer",
    unitId: 1 as number | null,
    unitName: "TOP 1" as string | null,
    isActive: true,
    mustChangePassword: false,
    ...values,
  });
  const users = [
    user("top1", {}),
    user("top2", { roleId: 1, roleName: "Administrator", unitId: 2, unitName: "TOP 2" }),
    user("neu", { unitId: null, unitName: null, mustChangePassword: true }),
    user("alt", { unitId: 3, unitName: "TOP 3", isActive: false, mustChangePassword: true }),
  ];
  const names = (filter: Parameters<typeof filterUsers>[1]) => filterUsers(users, filter).map((u) => u.username);

  it("filtert Benutzer nach Suchtext, Rolle, Wohneinheit und Status", () => {
    expect(names({ search: "administrator" })).toEqual(["top2"]);
    expect(names({ roleId: 2 })).toEqual(["top1", "neu", "alt"]);
    expect(names({ unitId: 3 })).toEqual(["alt"]);
    expect(names({ unitId: "none" })).toEqual(["neu"]);
    expect(names({ status: "initial" })).toEqual(["neu"]);
    // Ein deaktivierter Zugang gilt als deaktiviert – auch wenn das Initialpasswort noch offen ist.
    expect(userStatusOf(users[3])).toBe("inactive");
    expect(names({ status: "inactive" })).toEqual(["alt"]);
    expect(names({ status: "active", roleId: 2 })).toEqual(["top1"]);
  });

  it("filtert Stammdaten nach Name, Beschreibung und Status", () => {
    const categories = [
      { name: "Müllabfuhr", description: null, isActive: true },
      { name: "Gemeinschaftsanlage", description: "Photovoltaik, Wechselrichter", isActive: true },
      { name: "Alt", description: null, isActive: false },
    ];
    expect(filterMasterData(categories, { search: "photovoltaik" }).map((c) => c.name)).toEqual(["Gemeinschaftsanlage"]);
    expect(filterMasterData(categories, { active: false }).map((c) => c.name)).toEqual(["Alt"]);
    // Wohneinheiten haben keinen Aktiv-Schalter – der Statusfilter lässt sie in Ruhe.
    const units = [{ name: "TOP 1", notes: "Erdgeschoß" }, { name: "TOP 2", notes: null }];
    expect(filterMasterData(units, { active: false })).toHaveLength(2);
    expect(filterMasterData(units, { search: "erdgeschoß" }).map((u) => u.name)).toEqual(["TOP 1"]);
  });
});
