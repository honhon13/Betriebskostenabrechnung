/** Fachlicher Fehler mit einer Meldung, die dem Benutzer angezeigt werden darf. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Der Eintrag wurde nicht gefunden.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Postgres-Fehlercodes, die als verständliche Meldung an die Oberfläche gehen. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  // drizzle verpackt den pg-Fehler in `cause`.
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
