import "server-only";

import * as z from "zod";

import { ForbiddenError, UnauthenticatedError } from "@/auth/errors";

import { DomainError, NotFoundError } from "./errors";

/** Übersetzt Fehler aus Services in eine JSON-Antwort mit passendem Statuscode. */
export function apiErrorResponse(error: unknown): Response {
  const json = (status: number, message: string) => Response.json({ error: message }, { status });

  if (error instanceof UnauthenticatedError) return json(401, error.message);
  if (error instanceof ForbiddenError) return json(403, error.message);
  if (error instanceof NotFoundError) return json(404, error.message);
  if (error instanceof DomainError) return json(400, error.message);
  if (error instanceof z.ZodError) {
    return json(400, error.issues[0]?.message ?? "Ungültige Eingabe.");
  }

  console.error("API-Fehler:", error);
  return json(500, "Das hat leider nicht geklappt. Bitte versuche es erneut.");
}
