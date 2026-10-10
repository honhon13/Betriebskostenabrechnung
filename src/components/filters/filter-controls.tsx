"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Input, Select } from "@/components/ui/input";
import { ALL } from "@/lib/filters";
import { centsToInput } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Hält ein unkontrolliertes Feld auf dem Stand der URL. Filterfelder kennen von sich aus nur
 * ihren Anfangswert; ändert sich der Filter ohne ihr Zutun – „Zurücksetzen“, ein Link von außen,
 * „Zurück“ im Browser –, zeigten sie sonst weiter den alten Wert an.
 */
export function useSyncedField<T extends HTMLInputElement | HTMLSelectElement>(value: string) {
  const field = useRef<T>(null);
  useEffect(() => {
    if (field.current && field.current.value !== value) field.current.value = value;
  }, [value]);
  return field;
}

/**
 * Beschriftetes Feld einer Filterleiste – die Beschriftung steht sichtbar über dem Feld.
 * Beschriftung und Feld sind über `htmlFor`/`id` verknüpft (nicht verschachtelt): so heißt das
 * Feld für Vorleseprogramme genau wie seine Beschriftung.
 */
export function FilterField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  /** `id` des Feldes. */
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-xs text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

interface FilterSelectProps {
  /** Name des Query-Parameters. */
  name: string;
  label: string;
  /** Aktueller Wert – ohne Angabe ist „alle“ gewählt. */
  value: string | number | undefined;
  /** Beschriftung des Eintrags „kein Filter“; ohne ihn ist immer ein Wert gewählt (z. B. Sortierung). */
  allLabel?: string;
  options: { value: string | number; label: string }[];
  className?: string;
}

/** Auswahlfilter – wirkt sofort beim Ändern. */
export function FilterSelect({ name, label, value, allLabel, options, className }: FilterSelectProps) {
  const id = useId();
  const current = String(value ?? ALL);
  const field = useSyncedField<HTMLSelectElement>(current);
  return (
    <FilterField label={label} htmlFor={id} className={className}>
      <Select ref={field} id={id} name={name} defaultValue={current} className="md:w-auto">
        {allLabel ? <option value={ALL}>{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </FilterField>
  );
}

/** Hält ein Von-bis-Paar zusammen – es bricht als Ganzes um, nie zwischen „Von“ und „Bis“. */
const PAIR = "col-span-2 grid grid-cols-2 gap-x-2 md:flex md:items-end";

/** Eingabefeld einer Filterleiste (Datum, Betrag) – wirkt beim Absenden. */
function FilterInput({
  label,
  value,
  ...props
}: {
  label: string;
  value: string;
  name: string;
  type?: string;
  title?: string;
  inputMode?: "decimal";
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const field = useSyncedField<HTMLInputElement>(value);
  return (
    <FilterField label={label} htmlFor={id}>
      <Input ref={field} id={id} defaultValue={value} {...props} />
    </FilterField>
  );
}

interface FilterDateRangeProps {
  from: string | undefined;
  to: string | undefined;
  /** Worauf sich der Zeitraum bezieht, z. B. „Rechnungsdatum“ – steht als Tooltip an den Feldern. */
  subject: string;
  fromName?: string;
  toName?: string;
}

/** Zeitraum von–bis (Parameter `von` und `bis`), Grenzen einschließlich. */
export function FilterDateRange({
  from,
  to,
  subject,
  fromName = "von",
  toName = "bis",
}: FilterDateRangeProps) {
  return (
    <div className={PAIR}>
      <FilterInput
        label="Von"
        type="date"
        name={fromName}
        value={from ?? ""}
        title={`${subject} von`}
        className="md:w-auto"
      />
      <FilterInput
        label="Bis"
        type="date"
        name={toName}
        value={to ?? ""}
        title={`${subject} bis`}
        className="md:w-auto"
      />
    </div>
  );
}

/** Betrag von–bis in Euro (Parameter `betragAb` und `betragBis`), verglichen ohne Vorzeichen. */
export function FilterAmountRange({ min, max }: { min: number | undefined; max: number | undefined }) {
  return (
    <div className={PAIR}>
      <FilterInput
        label="Betrag ab (€)"
        name="betragAb"
        value={centsToInput(min)}
        inputMode="decimal"
        placeholder="0,00"
        className="md:w-28"
      />
      <FilterInput
        label="Betrag bis (€)"
        name="betragBis"
        value={centsToInput(max)}
        inputMode="decimal"
        placeholder="0,00"
        className="md:w-28"
      />
    </div>
  );
}
