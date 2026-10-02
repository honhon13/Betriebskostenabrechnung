import "server-only";

import { notFound } from "next/navigation";

import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import type { SessionUser } from "@/types/auth";
import type { PeriodDto } from "@/types/billing";

import { getPeriodByYear } from "./periods.service";

/**
 * Gemeinsamer Einstieg aller Seiten unter /abrechnung/[jahr]: angemeldeter Benutzer
 * plus Abrechnungsjahr. Jahre, die der Benutzer nicht sehen darf, enden als 404.
 */
export async function loadPeriodPage(
  jahr: string,
): Promise<{ user: SessionUser; period: PeriodDto }> {
  const user = await requireUser();
  const year = /^\d{4}$/.test(jahr) ? Number(jahr) : NaN;
  const period =
    Number.isNaN(year) || !can(user, "period:read") ? null : await getPeriodByYear(user, year);
  if (!period) notFound();
  return { user, period };
}
