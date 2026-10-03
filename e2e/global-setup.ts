import { eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { createPool } from "../src/db/connection";
import { getDirectDatabaseUrl, loadEnv } from "../src/db/load-env";
import * as schema from "../src/db/schema";

/**
 * Räumt Reste abgebrochener Testläufe weg, damit jeder Lauf vom selben Stand startet:
 * Einträge mit E2E-Präfix löschen und das laufende Jahr zurück auf „Entwurf“ setzen.
 */
export default async function globalSetup() {
  loadEnv();
  const pool = createPool(getDirectDatabaseUrl(), 1);
  const db = drizzle(pool, { schema });

  try {
    await db.delete(schema.documents).where(like(schema.documents.fileName, "e2e-%"));
    await db.delete(schema.costs).where(like(schema.costs.description, "E2E Testkosten %"));
    await db.delete(schema.payments).where(like(schema.payments.purpose, "E2E Einzahlung %"));
    await db.delete(schema.users).where(like(schema.users.username, "e2e-%"));
    // Folgejahre legen nur Tests an – ein Rest davon würde den nächsten Lauf stören.
    const year = new Date().getFullYear();
    await db.delete(schema.billingPeriods).where(inArray(schema.billingPeriods.year, [year + 1, year + 2]));
    await db
      .update(schema.billingPeriods)
      .set({ status: "draft", releasedAt: null, releasedBy: null })
      .where(eq(schema.billingPeriods.year, new Date().getFullYear()));
  } finally {
    await pool.end();
  }
}
