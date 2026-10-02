import { defineConfig } from "drizzle-kit";

import { normalizeConnectionString } from "./src/db/connection";
import { loadEnv } from "./src/db/load-env";

loadEnv();

// `generate` braucht keine Verbindung – nur migrate/studio greifen darauf zu.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: normalizeConnectionString(url) },
  strict: true,
  verbose: true,
});
