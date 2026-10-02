import { expect, test, type Page } from "@playwright/test";

import { CURRENT_YEAR, RELEASED_YEAR, login, tinyPdf } from "./helpers";

test.describe.serial("USER (TOP 1 / TOP 3)", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, "top1");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("Dashboard zeigt nur die eigene TOP und nur freigegebene Jahre", async () => {
    await expect(page.getByText("Mein Kostenanteil")).toBeVisible();
    await expect(page.getByText("Meine Einzahlungen")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Meine Abrechnung" })).toBeVisible();

    const years = await page.getByLabel("Abrechnungsjahr").locator("option").allTextContents();
    expect(years).toEqual([String(RELEASED_YEAR)]);

    const main = page.getByRole("main");
    await expect(main.getByText("TOP 2")).toHaveCount(0);
    await expect(main.getByText("TOP 3")).toHaveCount(0);
  });

  test("nicht freigegebenes Jahr existiert für USER nicht", async () => {
    for (const path of ["", "/kosten", "/schluessel", "/belege"]) {
      const response = await page.goto(`/abrechnung/${CURRENT_YEAR}${path}`);
      expect(response?.status(), path).toBe(404);
    }
    // Auch über den Dashboard-Parameter lässt sich das Jahr nicht erzwingen.
    await page.goto(`/dashboard?jahr=${CURRENT_YEAR}`);
    await expect(page.getByLabel("Abrechnungsjahr")).toHaveValue(String(RELEASED_YEAR));
    await expect(page.getByRole("main")).not.toContainText(`Abrechnungsjahr ${CURRENT_YEAR}`);
  });

  test("Verwaltungsseiten sind gesperrt", async () => {
    for (const path of [
      `/abrechnung/${RELEASED_YEAR}/kosten`,
      `/abrechnung/${RELEASED_YEAR}/schluessel`,
      "/einstellungen/stammdaten",
      "/einstellungen/benutzer",
    ]) {
      await page.goto(path);
      await expect(page.getByText("Kein Zugriff"), path).toBeVisible();
    }
  });

  test("eigene Abrechnung: nur eigener Anteil, keine Bearbeitung", async () => {
    await page.goto(`/abrechnung/${RELEASED_YEAR}`);
    await expect(page.getByRole("link", { name: "Meine Abrechnung" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kosten", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Umlageschlüssel" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Mein Anteil" })).toBeVisible();
    // TOP 1 ist an der ihr direkt zugeordneten Thermenwartung beteiligt.
    await expect(page.getByRole("row").filter({ hasText: "Thermenwartung TOP 1" })).toBeVisible();
    for (const name of ["Freigeben", "Freigabe zurücknehmen", "Neues Jahr"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
  });

  test("Einzahlungen: nur eigene, ohne Erfassen und Löschen", async () => {
    await page.goto("/einzahlungen?jahr=alle&top=2");
    const table = page.getByRole("table");
    await expect(table.getByRole("row").nth(1)).toContainText("TOP 1");
    await expect(table.getByText("TOP 2")).toHaveCount(0);
    await expect(table.getByText("TOP 3")).toHaveCount(0);
    await expect(table.getByText(String(CURRENT_YEAR), { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Einzahlung erfassen" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /löschen/ })).toHaveCount(0);
  });

  test("Schreibzugriffe werden serverseitig abgelehnt", async () => {
    const upload = await page.request.post("/api/belege", {
      multipart: {
        periodId: "1",
        file: { name: "x.pdf", mimeType: "application/pdf", buffer: tinyPdf("user") },
      },
    });
    expect(upload.status()).toBe(403);
  });

  test("TOP 3 sieht fremde Direktkosten nicht", async ({ browser }) => {
    const other = await browser.newPage();
    await login(other, "top3");
    await other.goto(`/abrechnung/${RELEASED_YEAR}`);
    await expect(other.getByRole("columnheader", { name: "Mein Anteil" })).toBeVisible();
    await expect(other.getByText("Thermenwartung TOP 1")).toHaveCount(0);
    await other.close();
  });

  test("Passwort ändern verlangt das aktuelle Passwort", async () => {
    await page.goto("/einstellungen");
    await page.getByLabel("Aktuelles Passwort").fill("falsches-passwort");
    await page.getByLabel("Neues Passwort", { exact: true }).fill("ein-neues-passwort-123");
    await page.getByLabel("Neues Passwort wiederholen").fill("ein-neues-passwort-123");
    await page.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Das aktuelle Passwort ist falsch." })).toBeVisible();
  });
});
