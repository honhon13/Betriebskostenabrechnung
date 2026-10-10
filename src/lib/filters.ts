import { parseEuroToCents } from "./money";

/**
 * Bausteine für die Filter der Listenansichten. Der Zustand eines Filters liegt immer in der
 * URL (?q=…&top=2) – so lässt er sich verlinken, teilen und neu laden. Hier wird gelesen und
 * verglichen; welche Daten ein Benutzer überhaupt sieht, entscheiden allein die Services.
 */

/** Wert eines Auswahlfilters für „kein Filter“. */
export const ALL = "alle";

/** `searchParams` einer Seite. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** Einzelner, nicht leerer Parameter. „alle“ und Leeres gelten als nicht gesetzt. */
export function readParam(params: SearchParams, name: string): string | undefined {
  const value = params[name];
  const text = typeof value === "string" ? value.trim() : "";
  return text && text !== ALL ? text : undefined;
}

/** Wert aus einer festen Auswahl – Unbekanntes fällt auf „kein Filter“ zurück. */
export function readChoice<T extends string>(
  params: SearchParams,
  name: string,
  choices: readonly T[],
): T | undefined {
  const value = readParam(params, name);
  return choices.find((choice) => choice === value);
}

/**
 * Auswahl mit sprechenden URL-Werten: mit `{ pending: "ausstehend" }` wird `?pruefung=ausstehend`
 * als `"pending"` gelesen. Unbekanntes fällt auf „kein Filter“ zurück.
 */
export function readMapped<T extends string>(
  params: SearchParams,
  name: string,
  mapping: Record<T, string>,
): T | undefined {
  const value = readParam(params, name);
  return (Object.keys(mapping) as T[]).find((key) => mapping[key] === value);
}

/** Prüfstand in der URL (`?pruefung=…`) – in allen Listen gleich. */
export const REVIEW_STATUS_PARAMS = {
  pending: "ausstehend",
  approved: "freigegeben",
  rejected: "abgelehnt",
} as const;

/** Art einer Kostenposition in der URL (`?art=…`). */
export const COST_KIND_PARAMS = { cost: "kosten", credit: "gutschriften" } as const;

/** Mit oder ohne Beleg (`?beleg=…`). */
export const RECEIPT_PARAMS = { with: "mit", without: "ohne" } as const;

/** ISO-Datum (YYYY-MM-DD) – alles andere gilt als nicht gesetzt. */
export function readDate(params: SearchParams, name: string): string | undefined {
  const value = readParam(params, name);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? undefined : value;
}

/** Betrag wie im Formular („1.234,56“) als Cent, ohne Vorzeichen. */
export function readAmount(params: SearchParams, name: string): number | undefined {
  const value = readParam(params, name);
  const cents = value ? parseEuroToCents(value) : null;
  return cents === null ? undefined : Math.abs(cents);
}

/** Positive ganze Zahl, z. B. eine ID oder ein Jahr. */
export function readNumber(params: SearchParams, name: string): number | undefined {
  const value = readParam(params, name);
  return value && /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : undefined;
}

/** Vergleichsform für die Suche: Kleinschreibung, Umlaute wie eingegeben. */
const normalize = (value: string) => value.toLocaleLowerCase("de");

/**
 * Volltextsuche über mehrere Felder: jedes Suchwort muss in irgendeinem Feld vorkommen
 * („müll gemeinde“ findet die Müllgebühr der Gemeinde). Ohne Suchtext passt alles.
 */
export function matchesSearch(
  search: string | undefined,
  fields: (string | number | null | undefined)[],
): boolean {
  const terms = normalize(search ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(fields.filter((field) => field !== null && field !== undefined).join("\n"));
  return terms.every((term) => haystack.includes(term));
}

/** Liegt das Datum im Zeitraum (Grenzen einschließlich)? Ohne Datum nur, wenn kein Zeitraum gesetzt ist. */
export function inDateRange(
  date: string | null | undefined,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  const day = date.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

/**
 * Liegt der Betrag zwischen den Grenzen? Verglichen wird ohne Vorzeichen – „ab € 50“ findet
 * auch eine Gutschrift oder Auszahlung über € 50.
 */
export function inAmountRange(
  cents: number | null | undefined,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (min === undefined && max === undefined) return true;
  if (cents === null || cents === undefined) return false;
  const amount = Math.abs(cents);
  return (min === undefined || amount >= min) && (max === undefined || amount <= max);
}

/** Wie viele Filter gesetzt sind – für „Zurücksetzen“ und den Zähler auf dem Handy. */
export function countActive(values: unknown[]): number {
  return values.filter((value) => value !== undefined && value !== null && value !== "" && value !== false)
    .length;
}

/**
 * Pfad mit Query-Parametern. Leere Werte entfallen; ein `#anker` am Pfad bleibt am Ende stehen.
 * `withParams("/dokumente", { jahr: 2026, typ: undefined })` → `/dokumente?jahr=2026`
 */
export function withParams(
  path: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const [base, hash] = path.split("#");
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(name, String(value));
  }
  const text = query.toString();
  return `${base}${text ? `${base.includes("?") ? "&" : "?"}${text}` : ""}${hash ? `#${hash}` : ""}`;
}

/** Erster und letzter Tag eines Monats als ISO-Datum – für Links „Kosten im März“. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (value: number) => String(value).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}
