import { formatCents, formatPercent } from "@/lib/format";
import type { CategoryTotal } from "@/services/dashboard.service";

/**
 * Kosten je Kostenart als Balkenliste. Eine Reihe, ein Farbton – die Kategorien
 * unterscheiden sich über ihre Beschriftung, nicht über Farben.
 */
export function CategoryBars({ categories }: { categories: CategoryTotal[] }) {
  const max = Math.max(...categories.map((c) => Math.abs(c.shareCents)), 1);
  const total = categories.reduce((acc, c) => acc + c.shareCents, 0);

  return (
    <ul className="space-y-3.5">
      {categories.map((category) => {
        const share = total > 0 ? category.shareCents / total : 0;
        return (
          <li
            key={category.categoryId}
            title={`${category.categoryName}: ${formatCents(category.shareCents)} (${formatPercent(share)})`}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{category.categoryName}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatCents(category.shareCents)}
              </span>
            </div>
            {/* Balken wächst von links; nur das Datenende ist gerundet. */}
            <div className="mt-1.5 h-2">
              <div
                className="h-full min-w-0.5 rounded-r bg-chart-series"
                style={{ width: `${(Math.max(category.shareCents, 0) / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
