import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { stretchedLinkClass } from "@/components/ui/interactive";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Zusatz unter dem Wert: Status-Badge oder kurzer Hinweis. */
  children?: ReactNode;
  /** Platz im Raster der Kachelreihe, z. B. `sm:col-span-2`. */
  className?: string;
  /** Ansicht hinter der Kennzahl – die ganze Kachel wird dann zum Link. */
  href?: string;
  /** Wohin der Link führt, z. B. „Kostenpositionen anzeigen“ (Tooltip und Vorlesetext). */
  hrefLabel?: string;
}

/** Kennzahl-Kachel: Beschriftung, großer Wert, optionaler Zusatz – auf Wunsch als Link. */
export function StatTile({
  label,
  value,
  icon: Icon,
  children,
  className,
  href,
  hrefLabel,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-4",
        href && "group relative transition-colors hover:border-primary hover:bg-primary-soft/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        {href ? (
          // Die Beschriftung ist der Link; seine Fläche deckt die ganze Kachel ab.
          <Link
            href={href}
            title={hrefLabel}
            aria-label={hrefLabel ? `${label} – ${hrefLabel}` : undefined}
            className={stretchedLinkClass}
          >
            {label}
          </Link>
        ) : (
          <span>{label}</span>
        )}
        {href ? (
          <span className="relative size-4 shrink-0 text-subtle">
            {/* Beim Überfahren zeigt ein Pfeil, dass die Kachel weiterführt. */}
            <Icon className="size-4 transition-opacity group-hover:opacity-0" aria-hidden />
            <ArrowUpRight
              className="absolute inset-0 size-4 text-primary opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </span>
        ) : (
          <Icon className="size-4 shrink-0 text-subtle" aria-hidden />
        )}
      </div>
      {/* Bewusst ohne tabular-nums: große Einzelwerte wirken mit Proportionalziffern ruhiger. */}
      <p className="mt-2 text-2xl font-semibold tracking-tight break-words">{value}</p>
      {children ? <div className="mt-2 text-xs text-muted">{children}</div> : null}
    </div>
  );
}
