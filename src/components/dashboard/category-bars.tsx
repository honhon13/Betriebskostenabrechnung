import { creditCountLabel, formatCents, formatCredit, formatPercent } from "@/lib/format";
import type { CategoryTotal } from "@/services/dashboard.service";

/**
 * Kosten je Kostenart als Balkenliste. Eine Reihe, ein Farbton – die Kategorien
 * unterscheiden sich über ihre Beschriftung, nicht über Farben. Gutschriften einer Kostenart
 * stehen als eigene Zeile darunter: sie sind keine Kosten und verkürzen den Balken nicht.
 */
export function CategoryBars({ categories }: { categories: CategoryTotal[] }) {
  const max = Math.max(...categories.map((c) => c.costCents), 1);
  const total = categories.reduce((acc, c) => acc + c.costCents, 0);

  return (
    <ul className="space-y-3.5">
      {categories.map((category) => {
        const share = total > 0 ? category.costCents / total : 0;
        return (
          <li
            key={category.categoryId}
            title={
              `${category.categoryName}: ${formatCents(category.costCents)} (${formatPercent(share)})` +
              (category.creditCount > 0
                ? ` · ${creditCountLabel(category.creditCount)} ${formatCredit(category.creditCents)}`
                : "")
            }
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{category.categoryName}</span>
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
                <span>{creditCountLabel(category.creditCount)}</span>
                <span className="shrink-0 tabular-nums">{formatCredit(category.creditCents)}</span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
