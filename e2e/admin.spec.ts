import { expect, test, type Page } from "@playwright/test";

import { CURRENT_YEAR, RELEASED_YEAR, login, parseCents, tinyPdf } from "./helpers";

// Eindeutige Namen je Lauf, damit sich die Tests selbst wieder aufräumen können.
const RUN = Date.now().toString(36);
const COST = `E2E Testkosten ${RUN}`;
const FILE = `e2e-beleg-${RUN}.pdf`;
const PURPOSE = `E2E Einzahlung ${RUN}`;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

test.describe.serial("ADMIN (TOP 2)", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, "top2");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("Dashboard zeigt Kennzahlen aller TOPs", async () => {
    await page.goto(`/dashboard?jahr=${RELEASED_YEAR}`);
    await expect(page.getByText("Kosten gesamt")).toBeVisible();
    await expect(page.getByText("Einzahlungen gesamt")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saldo je TOP" })).toBeVisible();
    for (const top of ["TOP 1", "TOP 2", "TOP 3"]) {
      await expect(page.getByRole("main").getByText(top, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Kosten nach Kostenart" })).toBeVisible();
  });

  test("Kostenverteilung geht ohne Rundungsdifferenz auf", async () => {
    await page.goto(`/abrechnung/${RELEASED_YEAR}`);
    await expect(page.getByRole("heading", { name: `Abrechnung ${RELEASED_YEAR}` })).toBeVisible();

    const cells = await row(page, "Kosten gesamt").getByRole("cell").allTextContents();
    const [total, , ...shares] = cells.map(parseCents);
    expect(shares).toHaveLength(3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    expect(total).toBeGreaterThan(0);
  });

  test("freigegebene Abrechnung ist gegen Änderungen gesperrt", async () => {
    await page.goto(`/abrechnung/${RELEASED_YEAR}/kosten`);
    await expect(page.getByText("Diese Abrechnung ist freigegeben")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kosten erfassen" })).toHaveCount(0);
  });

  test("Kosten erfassen – mit Validierung", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: "Kosten erfassen" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Beschreibung").fill(COST);
    await dialog.getByLabel("Betrag (€)").fill("kein betrag");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByText("Bitte einen Betrag wie 1.234,56 angeben.")).toBeVisible();
    // Eingaben bleiben nach dem Fehler erhalten.
    await expect(dialog.getByLabel("Beschreibung")).toHaveValue(COST);

    await dialog.getByLabel("Betrag (€)").fill("300,00");
    await dialog.getByLabel("Umlageschlüssel").selectOption({ label: "Gleiche Teile" });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    await expect(row(page, COST)).toContainText("€ 300,00");
  });

  test("neue Kosten erscheinen in der Verteilung zu gleichen Teilen", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}`);
    const shares = (await row(page, COST).getByRole("cell").allTextContents()).map(parseCents);
    // Betrag, Schlüssel, TOP 1–3
    expect(shares[0]).toBe(300_00);
    expect(shares.slice(2)).toEqual([100_00, 100_00, 100_00]);
  });

  test("Kosten bearbeiten: direkte Zuordnung zu einer TOP", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: `${COST} bearbeiten` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("TOP 1").uncheck();
    await dialog.getByLabel("TOP 2").uncheck();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, COST)).toContainText("TOP 3");

    await page.goto(`/abrechnung/${CURRENT_YEAR}`);
    const cells = await row(page, COST).getByRole("cell").allTextContents();
    // Intl setzt zwischen € und Betrag ein geschütztes Leerzeichen.
    expect(cells.slice(2).map((c) => c.replace(/\s+/g, " ").trim())).toEqual(["–", "–", "€ 300,00"]);
  });

  test("Beleg hochladen, zuordnen und abrufen", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/belege`);
    await page.locator('input[type="file"]').setInputFiles({
      name: FILE,
      mimeType: "application/pdf",
      buffer: tinyPdf(RUN),
    });
    await page.getByText("Zuordnung und Metadaten").click();
    const costOption = page.locator('select[name="costId"] option').filter({ hasText: COST });
    await page.locator('select[name="costId"]').selectOption(await costOption.getAttribute("value"));
    await page.getByLabel("Lieferant").fill("E2E GmbH");
    await page.getByRole("button", { name: "Hochladen" }).click();
    await expect(page.getByText(`„${FILE}“ wurde hochgeladen.`)).toBeVisible();

    const receiptRow = row(page, FILE);
    await expect(receiptRow).toContainText(COST);
    await expect(receiptRow).toContainText("E2E GmbH");

    const href = await receiptRow.getByRole("link", { name: FILE }).first().getAttribute("href");
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await response.body()).toString()).toContain(RUN);
  });

  test("Upload lehnt doppelte und unerlaubte Dateien ab", async () => {
    const upload = (name: string, mimeType: string, buffer: Buffer) =>
      page.request.post("/api/belege", {
        multipart: { periodId: periodId!, file: { name, mimeType, buffer } },
      });
    // Die Perioden-ID steckt im Formular der Seite.
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}`);
    await page.getByRole("button", { name: "Einzahlung erfassen" }).click();
    const periodId = await page
      .getByRole("dialog")
      .locator('select[name="periodId"] option')
      .filter({ hasText: String(CURRENT_YEAR) })
      .getAttribute("value");
    await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();

    const duplicate = await upload(FILE, "application/pdf", tinyPdf(RUN));
    expect(duplicate.status()).toBe(400);
    expect((await duplicate.json()).error).toContain("bereits");

    // Als PDF getarntes HTML: der Typ wird am Inhalt erkannt, nicht an Name oder MIME-Angabe.
    const html = await upload("rechnung.pdf", "application/pdf", Buffer.from("<html><script>alert(1)</script>"));
    expect(html.status()).toBe(400);
    expect((await html.json()).error).toContain("Dateiformat");
  });

  test("Einzahlung erfassen, filtern und löschen", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}`);
    await page.getByRole("button", { name: "Einzahlung erfassen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Betrag (€)").fill("1.234,56");
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 3" });
    await dialog.getByLabel("Verwendungszweck").fill(PURPOSE);
    await dialog.getByLabel("Notiz").fill("automatischer Test");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, PURPOSE)).toContainText("€ 1.234,56");

    await page.getByLabel("TOP", { exact: true }).selectOption({ label: "TOP 1" });
    await expect(page).toHaveURL(/top=1/);
    await expect(row(page, PURPOSE)).toHaveCount(0);

    await page.getByLabel("TOP", { exact: true }).selectOption({ label: "TOP 3" });
    await expect(page).toHaveURL(/top=3/);
    await row(page, PURPOSE).getByRole("button", { name: /löschen/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(row(page, PURPOSE)).toHaveCount(0);
  });

  test("Umlageschlüssel: Werte speichern", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/schluessel`);
    const field = page.getByLabel("Verbrauch TOP 1");
    await field.fill("12,5");
    await page.getByRole("button", { name: "Werte speichern" }).click();
    await expect(page.getByText("Umlageschlüssel gespeichert.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Verbrauch TOP 1")).toHaveValue("12,5");

    await page.getByLabel("Verbrauch TOP 1").fill("0");
    await page.getByRole("button", { name: "Werte speichern" }).click();
    await expect(page.getByText("Umlageschlüssel gespeichert.")).toBeVisible();
  });

  test("Freigabe macht ein Jahr für USER sichtbar – und die Rücknahme wieder unsichtbar", async ({
    browser,
  }) => {
    const userPage = await browser.newPage();
    await login(userPage, "top3");

    const draft = await userPage.goto(`/abrechnung/${CURRENT_YEAR}`);
    expect(draft?.status()).toBe(404);

    await page.goto(`/abrechnung/${CURRENT_YEAR}`);
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Freigeben" }).click();
    await expect(page.getByRole("button", { name: "Freigabe zurücknehmen" })).toBeVisible();

    // TOP 3 sieht jetzt das Jahr samt der ihr direkt zugeordneten Position und dem Beleg.
    const released = await userPage.goto(`/abrechnung/${CURRENT_YEAR}`);
    expect(released?.status()).toBe(200);
    await expect(userPage.getByRole("row").filter({ hasText: COST })).toContainText("€ 300,00");
    await userPage.goto(`/abrechnung/${CURRENT_YEAR}/belege`);
    await expect(userPage.getByRole("link", { name: FILE }).first()).toBeVisible();

    await page.getByRole("button", { name: "Freigabe zurücknehmen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zurücknehmen" }).click();
    await expect(page.getByRole("button", { name: "Freigeben" })).toBeVisible();

    const hidden = await userPage.goto(`/abrechnung/${CURRENT_YEAR}`);
    expect(hidden?.status()).toBe(404);
    await userPage.close();
  });

  test("Beleg und Kosten wieder löschen", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/belege`);
    await page.getByRole("button", { name: `${FILE} löschen` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(row(page, FILE)).toHaveCount(0);

    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: `${COST} löschen` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(row(page, COST)).toHaveCount(0);
  });

  test("Benutzer anlegen: Initialpasswort muss geändert werden, Reset beendet Sitzungen", async ({
    browser,
  }) => {
    const username = `e2e-${RUN}`;
    await page.goto("/einstellungen/benutzer");
    await page.getByRole("button", { name: "Benutzer", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Benutzername").fill(username);
    await dialog.getByLabel("Anzeigename").fill("E2E Test");
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 3" });
    await dialog.getByLabel("Initialpasswort").fill("zu kurz");
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(dialog.getByText("Mindestens 10 Zeichen.").first()).toBeVisible();
    await dialog.getByLabel("Initialpasswort").fill("initial-passwort-1");
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, username)).toContainText("Initialpasswort");

    // Erster Login: nichts geht, bevor das Passwort geändert ist – auch nicht per direkter URL oder API.
    const fresh = await browser.newPage();
    await fresh.goto("/login");
    await fresh.getByLabel("Benutzername").fill(username);
    await fresh.getByLabel("Passwort", { exact: true }).fill("initial-passwort-1");
    await fresh.getByRole("button", { name: "Anmelden" }).click();
    await expect(fresh).toHaveURL(/\/passwort-aendern/);
    await fresh.goto("/dashboard");
    await expect(fresh).toHaveURL(/\/passwort-aendern/);
    expect((await fresh.request.get("/api/belege/1/datei")).status()).toBe(403);

    await fresh.getByLabel("Aktuelles Passwort").fill("initial-passwort-1");
    await fresh.getByLabel("Neues Passwort", { exact: true }).fill("mein-eigenes-passwort-2");
    await fresh.getByLabel("Neues Passwort wiederholen").fill("mein-eigenes-passwort-2");
    await fresh.getByRole("button", { name: "Passwort speichern" }).click();
    await expect(fresh).toHaveURL(/\/dashboard/);
    await expect(fresh.getByText("Mein Kostenanteil")).toBeVisible();

    // Reset durch die Verwaltung: neues Passwort wird einmalig gezeigt, die Sitzung ist weg.
    await page.reload();
    await page.getByRole("button", { name: `Passwort von ${username} zurücksetzen` }).click();
    const confirm = page.getByRole("dialog");
    await confirm.getByRole("button", { name: "Zurücksetzen" }).click();
    const password = (await confirm.locator("p.font-mono").innerText()).trim();
    expect(password).toMatch(/^[A-Za-z2-9]{16}$/);
    await confirm.getByRole("button", { name: "Fertig" }).click();

    await fresh.goto("/dashboard");
    await expect(fresh).toHaveURL(/\/login/);
    await fresh.close();

    await page.getByRole("button", { name: `${username} löschen` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(row(page, username)).toHaveCount(0);
  });

  test("Einstellungen: Stammdaten, Benutzer und Rollen sind erreichbar", async () => {
    await page.goto("/einstellungen/stammdaten");
    await expect(page.getByRole("heading", { name: "Wohneinheiten" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kostenarten" })).toBeVisible();

    await page.goto("/einstellungen/benutzer");
    for (const name of ["top1", "top2", "top3"]) {
      await expect(row(page, name).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Rollen & Rechte" })).toBeVisible();
  });
});
