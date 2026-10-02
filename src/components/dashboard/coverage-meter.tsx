import { formatPercent } from "@/lib/format";

interface CoverageMeterProps {
  paymentCents: number;
  costCents: number;
}

/** Wie viel der Kosten durch Einzahlungen gedeckt ist. Spur = hellerer Schritt derselben Rampe. */
export function CoverageMeter({ paymentCents, costCents }: CoverageMeterProps) {
  if (costCents <= 0) return null;
  const ratio = Math.max(paymentCents, 0) / costCents;

  return (
    <div>
      <div
        role="meter"
        aria-label="Deckung der Kosten durch Einzahlungen"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}
        aria-valuetext={`${formatPercent(ratio)} der Kosten gedeckt`}
        className="h-2 overflow-hidden rounded-full bg-chart-track"
      >
        <div
          className="h-full rounded-full bg-chart-series"
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Einzahlungen decken {formatPercent(ratio)} der Kosten
      </p>
    </div>
  );
}
