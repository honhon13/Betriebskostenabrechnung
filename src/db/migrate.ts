import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createPool } from "./connection";
import { getDirectDatabaseUrl, loadEnv } from "./load-env";

async function main() {
  // `--vercel`: Aufruf aus dem Vercel-Build. Preview-Deployments teilen sich die
  // Datenbank mit der Produktion – das Schema ändert daher nur ein Production-Build.
  if (process.argv.includes("--vercel") && process.env.VERCEL_ENV !== "production") {
    console.log(`Migrationen übersprungen (VERCEL_ENV=${process.env.VERCEL_ENV ?? "nicht gesetzt"}).`);
    return;
  }

  loadEnv();
  const url = getDirectDatabaseUrl();
  const pool = createPool(url, 1);

  try {
    console.log(`Migrationen ausführen auf ${new URL(url).host} …`);
    await migrate(drizzle(pool), { migrationsFolder: "./src/db/migrations" });
    console.log("Migrationen abgeschlossen.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration fehlgeschlagen:", error);
  process.exit(1);
});
