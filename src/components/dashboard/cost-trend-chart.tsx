import { formatCents } from "@/lib/format";
import type { CostTrend } from "@/lib/billing/trend";
import { cn } from "@/lib/utils";

/** Feste Farbe je Reihe (TOP) – die Zuordnung hängt an der TOP, nicht an ihrem Rang. */
const SERIES = ["bg-chart-series", "bg-chart-series-2", "bg-chart-series-3"];
const UNDISTRIBUTED = "bg-border-strong";

const axisLabel = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Nächste „runde“ Obergrenze in Cent (1, 2 oder 5 × Zehnerpotenz Euro) für die Y-Achse. */
function niceMax(cents: number): number {
  const euros = Math.max(cents / 100, 1);
  const magnitude = 10 ** Math.floor(Math.log10(euros));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= euros) ?? 10;
  return step * magnitude * 100;
}

interface CostTrendChartProps {
  trend: CostTrend;
  /** Beschriftung der Reihe, wenn es nur eine gibt (z. B. „Mein Kostenanteil“). */
  singleLabel: string;
}

/**
 * Kostenverlauf als gestapelte Säulen: X-Achse = Zeitraum (Monate oder Jahre),
 * Y-Achse = Kosten in Euro, eine Farbe je TOP. Die Säulenhöhe ist die Summe – so sieht man
 * Gesamtverlauf und Anteile der TOPs in einem Bild. Die exakten Werte stehen in der Tabelle.
 */
export function CostTrendChart({ trend, singleLabel }: CostTrendChartProps) {
  // Mehr als drei Reihen bekämen keine sauber unterscheidbaren Farben – dann nur die Summe zeigen.
  const stacked = trend.units.length > 1 && trend.units.length <= SERIES.length;
  const series = stacked ? trend.units.map((unit) => unit.name) : [singleLabel];
  const hasUndistributed = trend.points.some((point) => point.undistributedCents > 0);

  const max = niceMax(Math.max(...trend.points.map((point) => point.totalCents), 0));
  const ticks = [max, max / 2, 0];
  const height = (cents: number) => `${(Math.max(cents, 0) / max) * 100}%`;
  const segmentsOf = (point: CostTrend["points"][number]) =>
    stacked
      ? point.shares
      : [point.shares.reduce((a, b) => a + b, 0)];

  const xTitle = trend.mode === "months" ? "Monat" : "Abrechnungsjahr";

  return (
    <figure>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {series.map((name, index) => (
          <span key={name} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", SERIES[index])} aria-hidden />
            {name}
          </span>
        ))}
        {hasUndistributed ? (
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", UNDISTRIBUTED)} aria-hidden />
            Noch nicht verteilt
          </span>
        ) : null}
      </figcaption>

      <div
        className="mt-3 flex gap-2"
        role="img"
        aria-label={`Kostenverlauf nach ${xTitle} – Werte in der Tabelle darunter`}
      >
        {/* Y-Achse: Titel und Werte */}
        <div className="flex gap-1">
          <span className="self-center text-[10px] whitespace-nowrap text-subtle [writing-mode:vertical-rl] rotate-180">
            Kosten (€)
          </span>
          <div className="flex h-48 flex-col justify-between text-right text-[10px] leading-none text-subtle tabular-nums">
            {ticks.map((tick) => (
              <span key={tick}>{axisLabel.format(tick / 100)}</span>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
              {ticks.map((tick) => (
                <span key={tick} className="h-px bg-border" />
              ))}
            </div>
            <div className="absolute inset-0 flex items-end">
              {trend.points.map((point) => {
                const segments = segmentsOf(point);
                const tooltip = [
                  point.title,
                  ...segments.map((cents, index) => `${series[index]}: ${formatCents(cents)}`),
                  ...(point.undistributedCents > 0
                    ? [`Noch nicht verteilt: ${formatCents(point.undistributedCents)}`]
                    : []),
                  ...(segments.length > 1 || point.undistributedCents > 0
                    ? [`Summe: ${formatCents(point.totalCents)}`]
                    : []),
                ].join("\n");
                return (
                  <div
                    key={point.label}
                    title={tooltip}
                    className="flex h-full flex-1 flex-col-reverse items-center px-0.5 hover:bg-surface-muted/60"
                  >
                    {/* Von unten nach oben gestapelt; 2px Abstand in Flächenfarbe trennt die Segmente. */}
                    {segments.map((cents, index) =>
                      cents > 0 ? (
                        <span
                          key={series[index]}
                          // Lücke zum Segment darunter; das oberste Segment bekommt das gerundete Datenende.
                          className={cn(
                            "w-full max-w-9 border-b-2 border-surface first:border-b-0 last:rounded-t",
                            SERIES[index],
                          )}
                          style={{ height: height(cents) }}
                        />
                      ) : null,
                    )}
                    {point.undistributedCents > 0 ? (
                      <span
                        className={cn(
                          "w-full max-w-9 rounded-t border-b-2 border-surface first:border-b-0",
                          UNDISTRIBUTED,
                        )}
                        style={{ height: height(point.undistributedCents) }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {/* X-Achse */}
          <div className="mt-1.5 flex text-center text-[10px] text-subtle sm:text-xs">
            {trend.points.map((point) => (
              <span key={point.label} className="flex-1 truncate">
                {point.label}
              </span>
            ))}
          </div>
          <p className="mt-1 text-center text-[10px] text-subtle sm:text-xs">{xTitle}</p>
        </div>
      </div>

      <details className="group mt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          Werte als Tabelle
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <caption className="sr-only">Kostenverlauf nach {xTitle}</caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                  {xTitle}
                </th>
                {series.map((name) => (
                  <th key={name} scope="col" className="px-2 py-1.5 text-right font-medium">
                    {name}
                  </th>
                ))}
                {hasUndistributed ? (
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Nicht verteilt
                  </th>
                ) : null}
                {stacked || hasUndistributed ? (
                  <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                    Summe
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trend.points.map((point) => (
                <tr key={point.label}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {point.title}
                  </th>
                  {segmentsOf(point).map((cents, index) => (
                    <td key={series[index]} className="px-2 py-1.5 text-right tabular-nums">
                      {formatCents(cents)}
                    </td>
                  ))}
                  {hasUndistributed ? (
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCents(point.undistributedCents)}
                    </td>
                  ) : null}
                  {stacked || hasUndistributed ? (
                    <td className="py-1.5 pl-2 text-right font-medium tabular-nums">
                      {formatCents(point.totalCents)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
