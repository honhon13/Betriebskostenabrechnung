"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/input";

interface NavSelectProps {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  /** Zielpfad mit Platzhalter {value}, z. B. "/dashboard?jahr={value}". */
  hrefPattern: string;
}

/** Auswahlfeld, das beim Ändern zur passenden URL navigiert (Filter liegen in der URL). */
export function NavSelect({ label, options, value, hrefPattern }: NavSelectProps) {
  const router = useRouter();

  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(event) => router.push(hrefPattern.replace("{value}", event.target.value))}
      className="w-auto min-w-24 font-medium"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

interface YearSelectProps {
  years: number[];
  value: number;
  /** Zielpfad mit Platzhalter {year}, z. B. "/abrechnung/{year}". */
  hrefPattern: string;
}

export function YearSelect({ years, value, hrefPattern }: YearSelectProps) {
  return (
    <NavSelect
      label="Abrechnungsjahr"
      options={years.map((year) => ({ value: String(year), label: String(year) }))}
      value={String(value)}
      hrefPattern={hrefPattern.replace("{year}", "{value}")}
    />
  );
}
