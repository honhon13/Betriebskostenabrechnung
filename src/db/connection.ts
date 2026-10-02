import { Pool } from "pg";

/**
 * pg behandelt `sslmode=require` inzwischen wie `verify-full` und warnt bei jedem
 * Verbindungsaufbau davor. Neon liefert gültige Zertifikate, daher explizit setzen.
 */
export function normalizeConnectionString(url: string): string {
  return url.replace(/([?&]sslmode=)require\b/, "$1verify-full");
}

export function createPool(connectionString: string, max = 5): Pool {
  return new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}
