import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      // min-w-0: in einem Grid darf langer Inhalt (z. B. ein Dateiname) die Karte nicht aufweiten.
      className={cn("min-w-0 rounded-xl border border-border bg-surface", className)}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5", className)}>
      {/* basis-48: kurze Aktionen bleiben neben dem Titel, statt in eine eigene Zeile zu rutschen. */}
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />;
}
