import type { DataScope, SessionUser } from "@/types/auth";

import { ForbiddenError } from "./errors";
import type { Permission } from "./permissions";

type Actor = Pick<SessionUser, "permissions" | "unitId">;

export function can(actor: Actor, permission: Permission): boolean {
  return actor.permissions.includes(permission);
}

export function canAny(actor: Actor, permissions: Permission[]): boolean {
  return permissions.some((p) => can(actor, p));
}

/** Wirft ForbiddenError, wenn das Recht fehlt. Jede Service-Funktion beginnt damit. */
export function authorize(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError();
}

export function getDataScope(actor: Actor): DataScope {
  return {
    allUnits: can(actor, "scope:all_units"),
    unitId: actor.unitId,
    includeDrafts: can(actor, "scope:drafts"),
  };
}

/** Darf der Benutzer Daten dieser TOP sehen? */
export function canAccessUnit(actor: Actor, unitId: number): boolean {
  const scope = getDataScope(actor);
  return scope.allUnits || (scope.unitId !== null && scope.unitId === unitId);
}

/** Darf der Benutzer ein Abrechnungsjahr mit diesem Status sehen? */
export function canAccessPeriodStatus(actor: Actor, status: "draft" | "released"): boolean {
  return status === "released" || getDataScope(actor).includeDrafts;
}

/**
 * Schreibrechte auf TOP-übergreifende Daten (Kosten, Stammdaten, Abrechnungsjahre)
 * setzen den Blick auf alle TOPs voraus.
 */
export function authorizeGlobalWrite(actor: Actor, permission: Permission): void {
  authorize(actor, permission);
  if (!can(actor, "scope:all_units")) throw new ForbiddenError();
}

/**
 * Wer prüfen darf, sieht auch Einträge, die noch nicht freigegeben oder abgelehnt sind.
 * Alle anderen sehen fremde Einträge erst nach der Freigabe.
 */
export function seesUnreviewed(actor: Actor): boolean {
  return can(actor, "review:manage");
}
