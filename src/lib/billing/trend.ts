import type { Statement, StatementLine } from "@/types/billing";

/** Ein Zeitabschnitt im Kostenverlauf: ein Monat oder ein Abrechnungsjahr. */
export interface TrendPoint {
  /** Beschriftung der X-Achse, z. B. „Mär“ oder „2025“. */
  label: string;
  /** Ausgeschriebener Zeitraum für Tooltip und Tabelle, z. B. „März 2025“. */
  title: string;
  /** Abrechnungsjahr des Zeitabschnitts. */
  year: number;
  /** Monat 1–12; null = ganzes Jahr bzw. die Spalte „ohne Datum“. */
  month: number | null;
  /** Kostenanteil je TOP – ohne Gutschriften –, in derselben Reihenfolge wie `units` des Verlaufs. */
  shares: number[];
  /** Kosten, die mangels Schlüsselwerten noch keiner TOP zugeordnet sind. */
  undistributedCents: number;
  /** Gutschriften des Zeitabschnitts, als positiver Betrag – nie Teil der Kostensäulen. */
  creditCents: number;
  /** Nettokosten: Kosten minus Gutschriften. */
  totalCents: number;
}

export interface CostTrend {
  /** months = Monate eines Abrechnungsjahres, years = alle Abrechnungsjahre. */
  mode: "months" | "years";
  /** Die Reihen des Diagramms: alle TOPs bzw. nur die eigene. */
  units: { id: number; name: string }[];
  points: TrendPoint[];
  /** Kosten ohne Gutschriften über alle Zeitabschnitte. */
  costCents: number;
  /** Gutschriften über alle Zeitabschnitte, als positiver Betrag. */
  creditCents: number;
  /** Nettokosten über alle Zeitabschnitte. */
  totalCents: number;
}

type OpenPoint = Omit<TrendPoint, "totalCents">;

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

const emptyPoint = (
  label: string,
  title: string,
  units: CostTrend["units"],
  year: number,
  month: number | null = null,
): OpenPoint => ({
  label,
  title,
  year,
  month,
  shares: units.map(() => 0),
  undistributedCents: 0,
  creditCents: 0,
});

/**
 * Rechnet eine Position der Abrechnung in den Zeitabschnitt ein. Gutschriften stehen neben den
 * Kosten, nie in den Säulen der TOPs: gezählt wird der sichtbare Anteil – in der Abrechnung
 * einer einzelnen TOP also nur ihr eigener.
 */
function addLine(point: OpenPoint, units: CostTrend["units"], line: StatementLine): void {
  if (!line.distributable) {
    if (line.credit) point.creditCents -= line.amountCents;
    else point.undistributedCents += line.amountCents;
    return;
  }
  for (const share of line.shares) {
    const index = units.findIndex((unit) => unit.id === share.unitId);
    if (index === -1) continue;
    if (line.credit) point.creditCents -= share.cents;
    else point.shares[index] += share.cents;
  }
}

function finish(mode: CostTrend["mode"], units: CostTrend["units"], points: OpenPoint[]): CostTrend {
  const costOf = (point: OpenPoint) =>
    point.shares.reduce((a, b) => a + b, 0) + point.undistributedCents;
  const withTotals = points.map((point) => ({
    ...point,
    totalCents: costOf(point) - point.creditCents,
  }));
  return {
    mode,
    units,
    points: withTotals,
    costCents: points.reduce((acc, point) => acc + costOf(point), 0),
    creditCents: points.reduce((acc, point) => acc + point.creditCents, 0),
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
  const points = Array.from({ length: 13 }, (_, index) =>
    index < 12
      ? emptyPoint(MONTHS[index], `${MONTHS_LONG[index]} ${year}`, units, year, index + 1)
      : emptyPoint("o. D.", "Ohne Datum / außerhalb des Jahres", units, year),
  );

  for (const line of statement.lines) {
    const inYear = line.costDate !== null && Number(line.costDate.slice(0, 4)) === year;
    addLine(points[inYear ? Number(line.costDate!.slice(5, 7)) - 1 : 12], units, line);
  }

  const undated = points[12];
  const hasUndated =
    undated.undistributedCents !== 0 ||
    undated.creditCents !== 0 ||
    undated.shares.some((cents) => cents !== 0);
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
    .map(({ year, statement }) => {
      const point = emptyPoint(String(year), `Abrechnungsjahr ${year}`, unitList, year);
      for (const line of statement.lines) addLine(point, unitList, line);
      return point;
    });
  return finish("years", unitList, points);
}
