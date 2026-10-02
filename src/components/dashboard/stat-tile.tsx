import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Zusatz unter dem Wert: Status-Badge oder kurzer Hinweis. */
  children?: ReactNode;
}

/** Kennzahl-Kachel: Beschriftung, großer Wert, optionaler Zusatz. */
export function StatTile({ label, value, icon: Icon, children }: StatTileProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        <Icon className="size-4 shrink-0 text-subtle" aria-hidden />
      </div>
      {/* Bewusst ohne tabular-nums: große Einzelwerte wirken mit Proportionalziffern ruhiger. */}
      <p className="mt-2 text-2xl font-semibold tracking-tight break-words">{value}</p>
      {children ? <div className="mt-2 text-xs text-muted">{children}</div> : null}
    </div>
  );
}
