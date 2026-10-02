import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Leere oder nur aus Leerzeichen bestehende Eingaben werden zu null. */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
