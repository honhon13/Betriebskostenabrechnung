"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { Button, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useSyncedField } from "./filter-controls";

interface FilterBarProps {
  /** Zielpfad – die Felder des Formulars landen als Query-Parameter in der URL. */
  action: string;
  /** Anzahl gesetzter Filter (ohne Sortierung). Ab 1 gibt es „Zurücksetzen“. */
  activeCount: number;
  /** Ziel von „Zurücksetzen“ – ohne Angabe der Pfad ohne Parameter. */
  resetHref?: string;
  /** Parameter, die beim Filtern erhalten bleiben, z. B. ein Reiter oder das Jahr der Seite. */
  keep?: Record<string, string | number | undefined>;
  /** Suchfeld (Parameter `q`) – wirkt beim Absenden. */
  search?: { value: string; placeholder: string };
  /** Auswahl- und Bereichsfilter (`FilterSelect`, `FilterDateRange`, `FilterAmountRange`). */
  children?: ReactNode;
  className?: string;
}

/**
 * Filterleiste aller Listenansichten: Suchfeld, beliebig kombinierbare Filter, „Suchen“ und
 * „Zurücksetzen“. Auswahlfelder wirken sofort, Suche, Datum und Betrag beim Absenden.
 *
 * Der Zustand liegt vollständig in der URL und lässt sich so verlinken, teilen und neu laden.
 * Auf dem Handy klappen die Filter hinter „Filter“ ein, das Suchfeld bleibt sichtbar.
 */
export function FilterBar({
  action,
  activeCount,
  resetHref,
  keep,
  search,
  children,
  className,
}: FilterBarProps) {
  const panelId = useId();
  // null = automatisch: auf dem Handy aufgeklappt, sobald ein Filter gesetzt ist.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? activeCount > 0;
  const searchField = useSyncedField<HTMLInputElement>(search?.value ?? "");

  return (
    <Form
      action={action}
      className={cn("border-b border-border px-4 py-4 sm:px-5", className)}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      <div className="space-y-3">
        {Object.entries(keep ?? {}).map(([name, value]) =>
          value === undefined || value === "" ? null : (
            <input key={name} type="hidden" name={name} value={value} />
          ),
        )}

        <div className="flex flex-wrap items-center gap-2">
          {search ? (
            // Auf dem Handy bekommt die Suche die ganze Zeile, die Schaltflächen stehen darunter.
            <label className="min-w-48 flex-1 basis-full sm:basis-auto">
              <span className="sr-only">Suche</span>
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
                  aria-hidden
                />
                <Input
                  ref={searchField}
                  type="search"
                  name="q"
                  defaultValue={search.value}
                  placeholder={search.placeholder}
                  className="pl-9"
                />
              </span>
            </label>
          ) : null}
          {children ? (
            <Button
              variant="secondary"
              className="md:hidden"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen(!expanded)}
            >
              <SlidersHorizontal aria-hidden />
              Filter
              {activeCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                  {activeCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          {/* Ohne Suchfeld stehen die Filter selbst in dieser Zeile – siehe unten. */}
          {search ? <FilterActions activeCount={activeCount} resetHref={resetHref ?? action} /> : null}
        </div>

        {children ? (
          <div
            id={panelId}
            className={cn(
              expanded ? "grid" : "hidden",
              "grid-cols-2 gap-x-2 gap-y-3 md:flex md:flex-wrap md:items-end",
            )}
          >
            {children}
            {search ? null : (
              <div className="col-span-2 flex flex-wrap gap-2">
                <FilterActions activeCount={activeCount} resetHref={resetHref ?? action} />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Form>
  );
}

function FilterActions({ activeCount, resetHref }: { activeCount: number; resetHref: string }) {
  return (
    <>
      <Button type="submit" variant="secondary">
        Suchen
      </Button>
      {activeCount > 0 ? (
        <Link href={resetHref} className={buttonClass("ghost", "md")}>
          <X aria-hidden />
          Zurücksetzen
        </Link>
      ) : null}
    </>
  );
}
