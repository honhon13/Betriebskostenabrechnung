import Link from "next/link";

import { inlineLinkClass, stretchedLinkClass } from "@/components/ui/interactive";
import { creditCountLabel, formatCents, formatCredit, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CategoryTotal } from "@/services/dashboard.service";

interface CategoryBarsProps {
  categories: CategoryTotal[];
  /** Ansicht hinter einer Kostenart – z. B. ihre Kostenpositionen. Die Zeile wird dann zum Link. */
  href?: (category: CategoryTotal) => string | undefined;
  /** Ansicht hinter den Gutschriften einer Kostenart. */
  creditHref?: (category: CategoryTotal) => string | undefined;
}

/**
 * Kosten je Kostenart als Balkenliste. Eine Reihe, ein Farbton – die Kategorien
 * unterscheiden sich über ihre Beschriftung, nicht über Farben. Gutschriften einer Kostenart
 * stehen als eigene Zeile darunter: sie sind keine Kosten und verkürzen den Balken nicht.
 */
export function CategoryBars({ categories, href, creditHref }: CategoryBarsProps) {
  const max = Math.max(...categories.map((c) => c.costCents), 1);
  const total = categories.reduce((acc, c) => acc + c.costCents, 0);

  return (
    <ul className="space-y-1.5">
      {categories.map((category) => {
        const share = total > 0 ? category.costCents / total : 0;
        const target = href?.(category);
        const creditTarget = creditHref?.(category);
        return (
          <li
            key={category.categoryId}
            title={
              `${category.categoryName}: ${formatCents(category.costCents)} (${formatPercent(share)})` +
              (category.creditCount > 0
                ? ` · ${creditCountLabel(category.creditCount)} ${formatCredit(category.creditCents)}`
                : "")
            }
            className={cn(
              "-mx-2 rounded-lg px-2 py-1",
              target && "relative transition-colors hover:bg-surface-muted",
            )}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {target ? (
                // Der Name ist der Link; seine Fläche deckt die ganze Zeile ab.
                <Link href={target} className={cn(stretchedLinkClass, "min-w-0 truncate")}>
                  {category.categoryName}
                </Link>
              ) : (
                <span className="min-w-0 truncate">{category.categoryName}</span>
              )}
              <span className="shrink-0 font-medium tabular-nums">
                {formatCents(category.costCents)}
              </span>
            </div>
            {/* Balken wächst von links; nur das Datenende ist gerundet. */}
            <div className="mt-1.5 h-2">
              {category.costCents > 0 ? (
                <div
                  className="h-full min-w-0.5 rounded-r bg-chart-series"
                  style={{ width: `${(category.costCents / max) * 100}%` }}
                />
              ) : null}
            </div>
            {category.creditCount > 0 ? (
              <p className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted">
                {creditTarget ? (
                  // Liegt über der Fläche des Zeilen-Links und führt zu den Gutschriften.
                  <Link href={creditTarget} className={cn(inlineLinkClass, "relative z-10")}>
                    {creditCountLabel(category.creditCount)}
                  </Link>
                ) : (
                  <span>{creditCountLabel(category.creditCount)}</span>
                )}
                <span className="shrink-0 tabular-nums">{formatCredit(category.creditCents)}</span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
