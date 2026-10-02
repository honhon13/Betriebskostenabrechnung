import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Rechts neben dem Titel: Jahresauswahl, Hauptaktion … */
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, children, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-muted">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="mt-3 font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
