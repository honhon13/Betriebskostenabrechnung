import type { Statement } from "@/types/billing";

/** Ein Zeitabschnitt im Kostenverlauf: ein Monat oder ein Abrechnungsjahr. */
export interface TrendPoint {
  /** Beschriftung der X-Achse, z. B. „Mär“ oder „2025“. */
  label: string;
  /** Ausgeschriebener Zeitraum für Tooltip und Tabelle, z. B. „März 2025“. */
  title: string;
  /** Kostenanteil je TOP, in derselben Reihenfolge wie `units` des Verlaufs. */
  shares: number[];
  /** Kosten, die mangels Schlüsselwerten noch keiner TOP zugeordnet sind. */
  undistributedCents: number;
  totalCents: number;
}

export interface CostTrend {
  /** months = Monate eines Abrechnungsjahres, years = alle Abrechnungsjahre. */
  mode: "months" | "years";
  /** Die Reihen des Diagramms: alle TOPs bzw. nur die eigene. */
  units: { id: number; name: string }[];
  points: TrendPoint[];
  totalCents: number;
}

const MONTHS = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTHS_LONG = [
  "Jänner",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function finish(
  mode: CostTrend["mode"],
  units: CostTrend["units"],
  points: Omit<TrendPoint, "totalCents">[],
): CostTrend {
  const withTotals = points.map((point) => ({
    ...point,
    totalCents: point.shares.reduce((a, b) => a + b, 0) + point.undistributedCents,
  }));
  return {
    mode,
    units,
    points: withTotals,
    totalCents: withTotals.reduce((acc, point) => acc + point.totalCents, 0),
  };
}

/**
 * Kostenverlauf über die Monate eines Abrechnungsjahres (nach Rechnungsdatum).
 * Positionen ohne Datum oder mit Datum außerhalb des Jahres stehen in einer eigenen
 * Spalte am Ende – so bleibt die Summe gleich den Kosten der Abrechnung.
 */
export function buildMonthlyTrend(year: number, statement: Statement): CostTrend {
  const units = statement.balances.map((b) => ({ id: b.unitId, name: b.unitName }));
  // Index 0–11 = Monate, 12 = ohne Datum.
  const points = Array.from({ length: 13 }, (_, index) => ({
    label: index < 12 ? MONTHS[index] : "o. D.",
    title: index < 12 ? `${MONTHS_LONG[index]} ${year}` : "Ohne Datum / außerhalb des Jahres",
    shares: units.map(() => 0),
    undistributedCents: 0,
  }));

  for (const line of statement.lines) {
    const inYear = line.costDate !== null && Number(line.costDate.slice(0, 4)) === year;
    const point = points[inYear ? Number(line.costDate!.slice(5, 7)) - 1 : 12];
    if (!line.distributable) {
      point.undistributedCents += line.amountCents;
      continue;
    }
    for (const share of line.shares) {
      const index = units.findIndex((unit) => unit.id === share.unitId);
      if (index !== -1) point.shares[index] += share.cents;
    }
  }

  const undated = points[12];
  const hasUndated = undated.undistributedCents !== 0 || undated.shares.some((cents) => cents !== 0);
  return finish("months", units, hasUndated ? points : points.slice(0, 12));
}

/** Kostenverlauf über alle Abrechnungsjahre, ältestes zuerst. */
export function buildYearlyTrend(years: { year: number; statement: Statement }[]): CostTrend {
  const units = new Map<number, string>();
  for (const { statement } of years) {
    for (const balance of statement.balances) units.set(balance.unitId, balance.unitName);
  }
  const unitList = [...units].map(([id, name]) => ({ id, name }));

  const points = [...years]
    .sort((a, b) => a.year - b.year)
    .map(({ year, statement }) => ({
      label: String(year),
      title: `Abrechnungsjahr ${year}`,
      shares: unitList.map(
        (unit) => statement.balances.find((b) => b.unitId === unit.id)?.costCents ?? 0,
      ),
      undistributedCents: statement.undistributedCents,
    }));
  return finish("years", unitList, points);
}
