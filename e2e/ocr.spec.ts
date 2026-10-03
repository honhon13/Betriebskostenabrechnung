import { createHash } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { CURRENT_YEAR, login, tinyPdf } from "./helpers";

// OCR läuft gegen den Azure-Nachbau (e2e/mock-azure.mjs). Eine Marke im Dokument
// bestimmt, was der Dienst „erkennt“.
const RUN = Date.now().toString(36);
const INVOICE = `e2e-ocr-rechnung-${RUN}.pdf`;
const OWN_VALUES = `e2e-ocr-eigene-werte-${RUN}.pdf`;
const UNREADABLE = `e2e-ocr-unlesbar-${RUN}.pdf`;
const WEBP = `e2e-ocr-foto-${RUN}.webp`;
const PLAIN = `e2e-ocr-brief-${RUN}.pdf`;
const MANUAL = `e2e-ocr-manuell-${RUN}.pdf`;
const USER_FILE = `e2e-ocr-user-${RUN}.pdf`;
const COST = `E2E Testkosten OCR ${RUN}`;
const COST_FILE = `e2e-ocr-kostenbeleg-${RUN}.pdf`;
const PURPOSE = `E2E Einzahlung OCR ${RUN}`;
const PROOF_FILE = `e2e-ocr-nachweis-${RUN}.pdf`;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const pdf = (name: string, marker: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: tinyPdf(`${marker} ${name}`),
});

async function openUpload(page: Page): Promise<Locator> {
  await page.goto(`/dokumente?q=${RUN}`);
  await page.getByRole("button", { name: "Dokument hochladen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('select[name="periodId"]').selectOption({ label: String(CURRENT_YEAR) });
  return dialog;
}

test.describe.serial("Dokument-Upload mit OCR", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, "top2");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("Rechnung: erkannte Daten stehen nach dem Upload in den Formularfeldern", async () => {
    const dialog = await openUpload(page);
    await expect(dialog.getByRole("checkbox", { name: /Automatisch per OCR auslesen/ })).toBeChecked();
    await dialog.locator('input[type="file"]').setInputFiles(pdf(INVOICE, "OCR-RECHNUNG"));
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByRole("heading", { name: "Erkannte Daten prüfen" })).toBeVisible();
    await expect(dialog.getByText(`„${INVOICE}“ wurde hochgeladen.`)).toBeVisible();
    await expect(dialog.getByText("OCR verarbeitet – 9 Felder übernommen")).toBeVisible();

    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("Rauchfangkehrer Muster GmbH");
    await expect(dialog.getByLabel("Rechnungsnummer")).toHaveValue("RE-2026-0042");
    await expect(dialog.getByLabel("Rechnungsdatum")).toHaveValue("2026-03-15");
    await expect(dialog.getByLabel("Leistungszeitraum von")).toHaveValue("2026-01-01");
    await expect(dialog.getByLabel("Leistungszeitraum bis")).toHaveValue("2026-03-31");
    await expect(dialog.getByLabel("Netto (€)")).toHaveValue("179,00");
    await expect(dialog.getByLabel("MwSt. (€)")).toHaveValue("35,80");
    await expect(dialog.getByLabel("Brutto (€)")).toHaveValue("214,80");
    await expect(dialog.getByLabel("Beschreibung")).toHaveValue("Kehrung, Abgasmessung");
    // Nicht erkannte Felder bleiben leer …
    await expect(dialog.locator('select[name="unitId"]')).toHaveValue("");

    // … und lassen sich wie erkannte Werte von Hand ergänzen bzw. korrigieren.
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 1" });
    await dialog.getByLabel("Rechnungsnummer").fill("RE-2026-0042-K");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    const documentRow = row(page, INVOICE);
    await expect(documentRow).toContainText("Rauchfangkehrer Muster GmbH · Nr. RE-2026-0042-K");
    await expect(documentRow).toContainText("Leistung 01.01.2026 – 31.03.2026");
    await expect(documentRow).toContainText("netto € 179,00 · MwSt. € 35,80 · brutto € 214,80");
    await expect(documentRow).toContainText("TOP 1");
    await expect(documentRow).toContainText("Verarbeitet");
  });

  test("OCR-Ergebnis bleibt gespeichert, auch wenn Felder danach geändert wurden", async () => {
    await page.reload();
    await page.getByRole("button", { name: `${INVOICE} bearbeiten` }).click();
    const dialog = page.getByRole("dialog");
    // Das Formular zeigt den korrigierten Wert, der OCR-Hinweis weiterhin den erkannten.
    await expect(dialog.getByLabel("Rechnungsnummer")).toHaveValue("RE-2026-0042-K");
    const recognized = dialog.getByRole("status").filter({ hasText: "Von OCR erkannt" });
    await expect(recognized).toContainText("Nr. RE-2026-0042 ·");
    await expect(recognized).toContainText("MwSt. € 35,80 (20 %)");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
  });

  test("Originaldatei wird unverändert gespeichert", async () => {
    const original = pdf(INVOICE, "OCR-RECHNUNG").buffer;
    const href = await row(page, INVOICE)
      .getByRole("link", { name: `${INVOICE} herunterladen` })
      .getAttribute("href");
    const stored = await (await page.request.get(href!)).body();
    const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    expect(sha(stored)).toBe(sha(original));
  });

  test("bereits eingetragene Werte überschreibt die OCR nicht", async () => {
    const dialog = await openUpload(page);
    await dialog.locator('input[type="file"]').setInputFiles(pdf(OWN_VALUES, "OCR-RECHNUNG"));
    await dialog.getByText("Rechnungsdaten (Rechnungssteller").click();
    // Im Upload-Schritt nennt auch der OCR-Hinweis den Rechnungssteller – daher über den Feldnamen.
    await dialog.locator('input[name="supplier"]').fill("Mein eigener Eintrag");
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByText("OCR verarbeitet – 8 Felder übernommen")).toBeVisible();
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("Mein eigener Eintrag");
    await expect(dialog.getByLabel("Rechnungsnummer")).toHaveValue("RE-2026-0042");
    await dialog.getByRole("button", { name: "Später ergänzen" }).click();
    await expect(row(page, OWN_VALUES)).toContainText("Mein eigener Eintrag · Nr. RE-2026-0042");
  });

  test("nicht lesbares Dokument: Upload gelingt, OCR meldet den Fehler", async () => {
    const dialog = await openUpload(page);
    await dialog.locator('input[type="file"]').setInputFiles(pdf(UNREADABLE, "OCR-UNLESBAR"));
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByText(`„${UNREADABLE}“ wurde hochgeladen.`)).toBeVisible();
    const error = dialog.getByRole("alert").filter({ hasText: "OCR-Fehler" });
    await expect(error).toContainText("nicht lesbar oder das Format wird nicht unterstützt");
    // Alle Felder bleiben leer und lassen sich manuell ausfüllen.
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("");
    await expect(dialog.getByLabel("Brutto (€)")).toHaveValue("");
    await dialog.getByLabel("Rechnungssteller").fill("Von Hand ergänzt");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    const documentRow = row(page, UNREADABLE);
    await expect(documentRow).toContainText("Von Hand ergänzt");
    await expect(documentRow).toContainText("Fehler");
    // Der Grund bleibt am Dokument gespeichert.
    await page.getByRole("button", { name: `${UNREADABLE} bearbeiten` }).click();
    await expect(page.getByRole("dialog").getByRole("alert").filter({ hasText: "OCR-Fehler" })).toContainText(
      "nicht lesbar",
    );
    await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();
  });

  test("nicht unterstütztes Format: WebP wird gespeichert, aber nicht ausgelesen", async () => {
    const dialog = await openUpload(page);
    await dialog.locator('input[type="file"]').setInputFiles({
      name: WEBP,
      mimeType: "image/webp",
      buffer: Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBPVP8 "), Buffer.from(WEBP)]),
    });
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByText(`„${WEBP}“ wurde hochgeladen.`)).toBeVisible();
    await expect(dialog.getByRole("alert").filter({ hasText: "OCR-Fehler" })).toContainText(
      "WebP-Dateien können nicht per OCR ausgelesen werden.",
    );
    await dialog.getByRole("button", { name: "Später ergänzen" }).click();
    await expect(row(page, WEBP)).toContainText("Fehler");
  });

  test("Dokument ohne Rechnungsdaten: verarbeitet, Felder bleiben leer", async () => {
    const dialog = await openUpload(page);
    await dialog.locator('input[type="file"]').setInputFiles(pdf(PLAIN, "nur ein Brief"));
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByText("OCR verarbeitet – keine Daten übernommen")).toBeVisible();
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("");
    await dialog.getByRole("button", { name: "Später ergänzen" }).click();
    await expect(row(page, PLAIN)).toContainText("Verarbeitet");
  });

  test("ohne Häkchen bleibt der OCR-Status offen – Auslesen geht später per Schaltfläche", async () => {
    const dialog = await openUpload(page);
    await dialog.getByRole("checkbox", { name: /Automatisch per OCR auslesen/ }).uncheck();
    await dialog.locator('input[type="file"]').setInputFiles(pdf(MANUAL, "OCR-RECHNUNG"));
    await dialog.getByRole("button", { name: "Hochladen", exact: true }).click();
    await expect(dialog.getByText(`„${MANUAL}“ wurde hochgeladen.`)).toBeVisible();
    // Kein Prüfschritt: das Formular ist wieder leer und bereit für das nächste Dokument.
    await expect(dialog.getByRole("heading", { name: "Dokument hochladen" })).toBeVisible();
    await dialog.getByRole("button", { name: "Schließen" }).click();

    const documentRow = row(page, MANUAL);
    await expect(documentRow).toContainText("Offen");
    await expect(documentRow).not.toContainText("RE-2026-0042");

    await page.getByRole("button", { name: `${MANUAL} per OCR auslesen` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Auslesen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(documentRow).toContainText("Verarbeitet");
    await expect(documentRow).toContainText("Rauchfangkehrer Muster GmbH · Nr. RE-2026-0042");
  });

  test("USER sehen den OCR-Status nicht und können keine OCR auslösen", async ({ browser }) => {
    const userPage = await browser.newPage();
    await login(userPage, "top1");
    await userPage.goto("/dokumente");
    await expect(userPage.getByText("OCR", { exact: true })).toHaveCount(0);
    await expect(userPage.getByRole("button", { name: /per OCR auslesen/ })).toHaveCount(0);
    // Ein Upload wird zwar zur Prüfung angenommen, aber nicht ausgelesen.
    const upload = await userPage.request.post("/api/dokumente", {
      multipart: { periodId: "1", ocr: "on", file: pdf(USER_FILE, "OCR-RECHNUNG") },
    });
    expect(upload.status()).toBe(201);
    expect((await upload.json()).ocr).toBeNull();
    await userPage.close();
  });

  test("Kostenformular: angehängter Beleg wird ausgelesen und ergänzt leere Felder", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: "Kosten erfassen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("automatisch per OCR ausgelesen")).toBeVisible();
    await dialog.getByLabel("Beschreibung").fill(COST);
    await dialog.getByLabel("Betrag (€)").fill("214,80");
    // Lieferant bleibt leer, die Rechnungsnummer ist von Hand eingetragen.
    await dialog.getByLabel("Rechnungsnummer").fill("EIGENE-NR");
    await dialog.locator('input[type="file"]').setInputFiles(pdf(COST_FILE, "OCR-RECHNUNG"));
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Leere Felder der Kostenposition sind ergänzt, Eingetragenes bleibt.
    const costRow = row(page, COST);
    await expect(costRow).toContainText("Rauchfangkehrer Muster GmbH");
    await expect(costRow).toContainText("15.03.2026");
    await page.getByRole("button", { name: `${COST} bearbeiten` }).click();
    await expect(page.getByRole("dialog").getByLabel("Rechnungsnummer")).toHaveValue("EIGENE-NR");
    await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();

    // Das Dokument ist verarbeitet und hat die restlichen Rechnungsdaten bekommen.
    await page.goto(`/dokumente?q=${RUN}`);
    const documentRow = row(page, COST_FILE);
    await expect(documentRow).toContainText("Verarbeitet");
    await expect(documentRow).toContainText("netto € 179,00 · MwSt. € 35,80 · brutto € 214,80");
    await expect(documentRow).toContainText("Leistung 01.01.2026 – 31.03.2026");
  });

  test("Einzahlungsformular: angehängter Nachweis wird ausgelesen", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}&top=3`);
    await page.getByRole("button", { name: "Einzahlung erfassen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("wird automatisch per OCR ausgelesen")).toBeVisible();
    await dialog.getByLabel("Betrag (€)").fill("55,55");
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 3" });
    await dialog.getByLabel("Beschreibung / Verwendungszweck").fill(PURPOSE);
    await dialog.locator('input[type="file"]').setInputFiles(pdf(PROOF_FILE, "nur ein Kontoauszug"));
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(row(page, PURPOSE).getByRole("button", { name: PROOF_FILE })).toBeVisible();

    await page.goto(`/dokumente?q=${RUN}`);
    await expect(row(page, PROOF_FILE)).toContainText("Verarbeitet");
    await expect(row(page, PROOF_FILE)).toContainText("Zahlungsnachweis");
  });

  test("Testdaten wieder löschen", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}&top=3`);
    await row(page, PURPOSE).getByRole("button", { name: /löschen/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(row(page, PURPOSE)).toHaveCount(0);

    await page.goto(`/dokumente?q=${RUN}`);
    for (const name of [INVOICE, OWN_VALUES, UNREADABLE, WEBP, PLAIN, MANUAL, USER_FILE, COST_FILE, PROOF_FILE]) {
      await page.getByRole("button", { name: `${name} löschen` }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(row(page, name)).toHaveCount(0);
    }

    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: `${COST} löschen` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(row(page, COST)).toHaveCount(0);
  });
});
