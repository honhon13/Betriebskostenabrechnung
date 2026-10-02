import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import { createPool } from "./connection";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** Verbindung oder laufende Transaktion – für Funktionen, die in beidem laufen können. */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

// Im Dev-Modus überlebt der Pool Hot Reloads, sonst entstehen laufend neue Verbindungen.
const globalForDb = globalThis as unknown as { __bkDb?: Database };

/** Lazy, damit `next build` auch ohne DATABASE_URL durchläuft. */
export function getDb(): Database {
  if (globalForDb.__bkDb) return globalForDb.__bkDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example).");
  }

  const pool = createPool(connectionString);
  // Schließt Leerlauf-Verbindungen, bevor Vercel die Funktion einfriert.
  attachDatabasePool(pool);

  globalForDb.__bkDb = drizzle(pool, { schema });
  return globalForDb.__bkDb;
}

export { schema };
