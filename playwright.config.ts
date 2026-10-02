import { defineConfig, devices } from "@playwright/test";

// Zugangsdaten der Seed-Benutzer (SEED_PASSWORD_TOP1 …) stehen in .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {
  // In CI kommen die Variablen aus der Umgebung.
}

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-End-Tests gegen den Produktions-Build. Sie schreiben in die Datenbank aus
 * .env.local – also nur gegen einen Entwicklungs-Branch laufen lassen, nie gegen Produktion.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Die Tests teilen sich eine Datenbank und bauen aufeinander auf.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "de-AT",
    timezoneId: "Europe/Vienna",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
