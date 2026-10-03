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
    await expect(page.getByText("Mein Kostenanteil").first()).toBeVisible();
    await expect(page.getByText("Meine Einzahlungen")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Meine Abrechnung" })).toBeVisible();

    const years = await page.getByLabel("Abrechnungsjahr").locator("option").allTextContents();
    expect(years).toEqual([String(RELEASED_YEAR)]);

    const main = page.getByRole("main");
    await expect(main.getByText("TOP 2")).toHaveCount(0);
    await expect(main.getByText("TOP 3")).toHaveCount(0);
  });

  test("nicht freigegebenes Jahr existiert für USER nicht", async () => {
    for (const path of ["", "/kosten", "/monate", "/schluessel", "/belege"]) {
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
    await expect(page.getByText("Mein Kostenanteil").first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Anteil" })).toBeVisible();
    // TOP 1 ist an der ihr direkt zugeordneten Thermenwartung beteiligt.
    await expect(page.getByRole("row").filter({ hasText: "Thermenwartung TOP 1" })).toBeVisible();
    // Nur die eigene TOP – keine Abschnitte, Spalten oder Summen anderer TOPs.
    await expect(page.locator("details")).toHaveCount(1);
    await expect(page.getByRole("main").getByText(/TOP [23]/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Kostenverteilung" })).toHaveCount(0);
    for (const name of ["Freigeben", "Freigabe zurücknehmen", "Neues Jahr"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
  });

  test("Jahres- und Monatsübersicht zeigen nur die eigene TOP", async () => {
    await page.goto("/abrechnung");
    await expect(page.getByRole("columnheader", { name: "Mein Kostenanteil" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: String(RELEASED_YEAR) })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: String(CURRENT_YEAR) })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Neues Jahr" })).toHaveCount(0);

    // ?top=2 wird ignoriert – es bleibt die eigene TOP.
    await page.goto(`/abrechnung/${RELEASED_YEAR}/monate?top=2`);
    await expect(page.getByText("TOP 1 · Kosten nach Rechnungsdatum")).toBeVisible();
    await expect(page.getByLabel("TOP", { exact: true })).toHaveCount(0);
  });

  test("Dokumente: kein direkter Upload – Einreichen führt zu „Meine Eingaben“", async () => {
    await page.goto("/dokumente");
    await expect(page.getByText("Dokumente, die deine TOP betreffen.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dokument hochladen" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Dokument einreichen" })).toHaveAttribute("href", "/eingaben");
    await expect(page.getByLabel("TOP", { exact: true })).toHaveCount(0);
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

  test("Uploads von USER landen in der Prüfung statt direkt in der Ablage", async () => {
    const name = `e2e-user-upload-${Date.now().toString(36)}.pdf`;
    const upload = await page.request.post("/api/dokumente", {
      multipart: {
        periodId: "1",
        // Diese Angaben stehen USER nicht zu und werden ignoriert bzw. abgelehnt.
        unitId: "2",
        ocr: "on",
        file: { name, mimeType: "application/pdf", buffer: tinyPdf(`OCR-RECHNUNG ${name}`) },
      },
    });
    expect(upload.status()).toBe(201);
    const body = await upload.json();
    expect(body.document.reviewStatus).toBe("pending");
    expect(body.document.unitName).toBe("TOP 1");
    expect(body.ocr).toBeNull();
    expect(body.document.ocrStatus).toBe("none");

    // Mit fremden Kostenpositionen lässt sich ein Dokument nicht verknüpfen.
    const foreign = await page.request.post("/api/dokumente", {
      multipart: {
        periodId: "1",
        costIds: "1",
        file: { name: `x-${name}`, mimeType: "application/pdf", buffer: tinyPdf(`fremd ${name}`) },
      },
    });
    expect(foreign.status()).toBe(400);
    expect((await foreign.json()).error).toContain("eigenen Kostenpositionen");
  });

  test("TOP 3 sieht fremde Direktkosten nicht", async ({ browser }) => {
    const other = await browser.newPage();
    await login(other, "top3");
    await other.goto(`/abrechnung/${RELEASED_YEAR}`);
    await expect(other.getByRole("columnheader", { name: "Anteil" })).toBeVisible();
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
