import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { SessionUser } from "@/types/auth";

import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { Permission } from "./permissions";
import { authorize } from "./rbac";
import { readSessionUser } from "./session";

/** Pro Request nur ein Datenbankzugriff, egal wie oft der Benutzer abgefragt wird. */
export const getCurrentUser = cache(readSessionUser);

/**
 * Für Seiten: leitet nicht angemeldete Besucher zum Login um – und Benutzer mit
 * Initialpasswort zum Passwortwechsel, bevor sie irgendetwas anderes sehen.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/passwort-aendern");
  return user;
}

/** Für Server Actions und Route Handler: wirft statt umzuleiten. */
export async function requireActor(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (user.mustChangePassword) {
    throw new ForbiddenError("Bitte ändere zuerst dein Initialpasswort.");
  }
  if (permission) authorize(user, permission);
  return user;
}
