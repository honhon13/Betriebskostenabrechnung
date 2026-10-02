import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createPool } from "./connection";
import { getDirectDatabaseUrl, loadEnv } from "./load-env";

async function main() {
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
