/** Nicht angemeldet bzw. Sitzung abgelaufen. */
export class UnauthenticatedError extends Error {
  constructor(message = "Bitte melde dich an.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Angemeldet, aber ohne Berechtigung für die Aktion oder den Datensatz. */
export class ForbiddenError extends Error {
  constructor(message = "Dafür fehlt dir die Berechtigung.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
