import "server-only";

import { unstable_rethrow } from "next/navigation";
import * as z from "zod";

import { ForbiddenError, UnauthenticatedError } from "@/auth/errors";

import {
  DomainError,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
} from "./errors";
import type { ActionState } from "./action-state";

/**
 * Einheitliche Fehlerbehandlung für Server Actions: erwartbare Fehler werden zu einer
 * Meldung für das Formular, alles andere wird geloggt und neutral beantwortet.
 */
export async function runAction(
  fn: () => Promise<string | void>,
): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    // redirect()/notFound() sind Steuerfluss und müssen durchgereicht werden.
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      const flat = z.flattenError(error);
      return {
        ok: false,
        error: flat.formErrors[0] ?? "Bitte prüfe die markierten Felder.",
        fieldErrors: flat.fieldErrors as Record<string, string[]>,
      };
    }
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof DomainError) {
      return { ok: false, error: error.message };
    }

    const code = pgErrorCode(error);
    if (code === PG_UNIQUE_VIOLATION) {
      return { ok: false, error: "Ein Eintrag mit diesen Angaben existiert bereits." };
    }
    if (code === PG_FOREIGN_KEY_VIOLATION) {
      return {
        ok: false,
        error: "Der Eintrag wird noch von anderen Daten verwendet und kann nicht gelöscht werden.",
      };
    }

    console.error("Server Action fehlgeschlagen:", error);
    return { ok: false, error: "Das hat leider nicht geklappt. Bitte versuche es erneut." };
  }
}
