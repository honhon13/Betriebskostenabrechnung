const LOCALE = "de-AT";

const currency = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Vienna",
});

export function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

/** ISO-Datum (YYYY-MM-DD) → 31.12.2025. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "–";
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "–" : dateFormat.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "–" : dateTimeFormat.format(date);
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

export function formatPercent(fraction: number): string {
  return new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 1 }).format(
    fraction,
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
}

/** Heutiges Datum als YYYY-MM-DD in österreichischer Zeit. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
}
