import { MONTH_NAMES } from "@/lib/labels";
import type { RecurringInterval } from "@/types/billing";

/** Ein Zeitraum, für den aus einer Vorlage eine Kostenposition entsteht. */
export interface RecurringSlot {
  /** Laufende Nummer im Jahr: Monat 1–12, Quartal 1–4, beim Jahr immer 1. */
  index: number;
  /** z. B. „Jänner 2026“, „1. Quartal 2026“, „2026“. */
  label: string;
  /** Erster und letzter Tag des Zeitraums (YYYY-MM-DD) – der Leistungszeitraum der Position. */
  start: string;
  end: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Letzter Tag eines Monats (1–12) – Schaltjahre eingeschlossen. */
function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function range(year: number, firstMonth: number, lastMonth: number) {
  return {
    start: `${year}-${pad(firstMonth)}-01`,
    end: `${year}-${pad(lastMonth)}-${pad(lastDay(year, lastMonth))}`,
  };
}

/** Die Zeiträume eines Abrechnungsjahres für ein Intervall: 12 Monate, 4 Quartale oder das Jahr. */
export function recurringSlots(interval: RecurringInterval, year: number): RecurringSlot[] {
  if (interval === "monthly") {
    return MONTH_NAMES.map((name, month) => ({
      index: month + 1,
      label: `${name} ${year}`,
      ...range(year, month + 1, month + 1),
    }));
  }
  if (interval === "quarterly") {
    return [1, 2, 3, 4].map((quarter) => ({
      index: quarter,
      label: `${quarter}. Quartal ${year}`,
      ...range(year, quarter * 3 - 2, quarter * 3),
    }));
  }
  return [{ index: 1, label: String(year), ...range(year, 1, 12) }];
}

/** Wie viele Kostenpositionen ein Intervall je Jahr ergibt. */
export function slotsPerYear(interval: RecurringInterval): number {
  return interval === "monthly" ? 12 : interval === "quarterly" ? 4 : 1;
}

/** Beschreibung der erzeugten Position: Vorlage plus Zeitraum, höchstens 200 Zeichen. */
export function recurringDescription(description: string, slot: RecurringSlot): string {
  const suffix = ` ${slot.label}`;
  return `${description.slice(0, 200 - suffix.length)}${suffix}`;
}
