import { formatCents } from "@/lib/format";
import { MONTH_NAMES } from "@/lib/labels";
import type { MonthRow } from "@/lib/billing/monthly";

const SHORT = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Achsenwerte wie die Beträge im Rest der App, nur ohne Cent. */
const axisLabel = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Nächste „runde“ Obergrenze in Euro (1, 2 oder 5 × Zehnerpotenz) für die Achse. */
function niceMax(cents: number): number {
  const euros = Math.max(cents / 100, 1);
  const magnitude = 10 ** Math.floor(Math.log10(euros));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= euros) ?? 10;
  return step * magnitude * 100;
}

/**
 * Kosten und Einzahlungen je Monat als gruppierte Säulen. Zwei Reihen, zwei Farben,
 * Legende darüber; die exakten Werte stehen in der Tabelle darunter.
 */
export function MonthlyChart({ rows }: { rows: MonthRow[] }) {
  const max = niceMax(Math.max(...rows.flatMap((row) => [row.costCents, row.paymentCents]), 0));
  const ticks = [max, max / 2, 0];
  const height = (cents: number) => `${(Math.max(cents, 0) / max) * 100}%`;

  return (
    <figure>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-series" aria-hidden />
          Kosten
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-series-2" aria-hidden />
          Einzahlungen
        </span>
      </figcaption>

      <div className="mt-3 flex gap-2" role="img" aria-label="Kosten und Einzahlungen je Monat – Werte in der Tabelle darunter">
        {/* Achsenbeschriftung */}
        <div className="flex h-44 flex-col justify-between text-right text-[10px] leading-none text-subtle tabular-nums">
          {ticks.map((tick) => (
            <span key={tick}>{axisLabel.format(tick / 100)}</span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-44">
            {/* Gitterlinien: durchgezogen, zurückhaltend */}
            <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
              {ticks.map((tick) => (
                <span key={tick} className="h-px bg-border" />
              ))}
            </div>
            <div className="absolute inset-0 flex items-end">
              {rows.map((row) => (
                <div
                  key={row.month}
                  className="flex h-full flex-1 items-end justify-center gap-0.5 px-0.5 hover:bg-surface-muted/60"
                  title={`${MONTH_NAMES[(row.month ?? 1) - 1]}: Kosten ${formatCents(row.costCents)}, Einzahlungen ${formatCents(row.paymentCents)}`}
                >
                  <span
                    className="w-full max-w-2 rounded-t bg-chart-series sm:max-w-3"
                    style={{ height: height(row.costCents) }}
                  />
                  <span
                    className="w-full max-w-2 rounded-t bg-chart-series-2 sm:max-w-3"
                    style={{ height: height(row.paymentCents) }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex text-center text-[10px] text-subtle sm:text-xs">
            {rows.map((row) => (
              <span key={row.month} className="flex-1 truncate">
                {SHORT[(row.month ?? 1) - 1]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
