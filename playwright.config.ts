import { defineConfig, devices } from "@playwright/test";

// Zugangsdaten der Seed-Benutzer (SEED_PASSWORD_TOP1 …) stehen in .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {
  // In CI kommen die Variablen aus der Umgebung.
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
// OCR läuft in den Tests gegen einen lokalen Nachbau der Azure-API (e2e/mock-azure.mjs) –
// es werden keine echten Zugangsdaten gebraucht und keine Dokumente an Azure geschickt.
const MOCK_AZURE_PORT = PORT + 1;
const MOCK_AZURE_KEY = "e2e-test-key";
// Standard ist das mit Playwright installierte Chromium (`npx playwright install chromium`).
// PW_CHANNEL=chrome nimmt stattdessen ein auf dem Rechner installiertes Google Chrome.
const BROWSER = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {};

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
      use: { ...devices["Desktop Chrome"], ...BROWSER },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"], ...BROWSER },
    },
  ],
  webServer: [
    {
      command: "node e2e/mock-azure.mjs",
      url: `http://localhost:${MOCK_AZURE_PORT}/health`,
      env: { MOCK_AZURE_PORT: String(MOCK_AZURE_PORT), MOCK_AZURE_KEY },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      env: {
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: `http://localhost:${MOCK_AZURE_PORT}`,
        AZURE_DOCUMENT_INTELLIGENCE_KEY: MOCK_AZURE_KEY,
      },
      // Bewusst kein Wiederverwenden: ein bereits laufender Server hätte die OCR-Variablen nicht.
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
