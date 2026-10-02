"use client";

import { createContext, useContext, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Feldfehler der letzten Server-Antwort, nach Feldname. */
export const FieldErrorsContext = createContext<Record<string, string[]>>({});

interface FieldProps {
  label: string;
  /** Name des Formularfelds – darüber wird der passende Serverfehler zugeordnet. */
  name: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  /** Genau ein Eingabeelement; das umschließende <label> verknüpft es mit der Beschriftung. */
  children: ReactNode;
}

export function Field({ label, name, hint, optional, className, children }: FieldProps) {
  const error = useContext(FieldErrorsContext)[name]?.[0];

  return (
    <div
      data-invalid={error ? "" : undefined}
      className={cn(
        "space-y-1.5 data-invalid:[&_input]:border-danger data-invalid:[&_select]:border-danger data-invalid:[&_textarea]:border-danger",
        className,
      )}
    >
      {/* Hinweis und Fehler stehen bewusst außerhalb des Labels, damit der Feldname kurz bleibt. */}
      <label className="block space-y-1.5">
        <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
          {label}
          {optional ? <span className="text-xs font-normal text-subtle">optional</span> : null}
        </span>
        {children}
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
