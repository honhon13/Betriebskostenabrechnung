/**
 * Lädt .env.local / .env für CLI-Skripte (Migration, Seed, drizzle-kit).
 * Bereits gesetzte Variablen haben Vorrang, damit sich das Ziel pro Aufruf
 * überschreiben lässt: `DATABASE_URL_UNPOOLED=... npm run db:migrate`.
 */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Datei fehlt – in CI/Vercel kommen die Variablen aus der Umgebung.
    }
  }
}

/** Migrationen und Seed laufen über die direkte (nicht gepoolte) Verbindung. */
export function getDirectDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED bzw. DATABASE_URL ist nicht gesetzt (siehe .env.example).",
    );
  }
  return url;
}
