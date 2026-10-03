import { createHash } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { CURRENT_YEAR, expectAbove, login, openAdd, tinyPdf } from "./helpers";

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
const COST_UNREADABLE = `e2e-ocr-kostenbeleg-unlesbar-${RUN}.pdf`;
const COST_DISCARDED = `e2e-ocr-kostenbeleg-verworfen-${RUN}.pdf`;
const COST_PLAIN = `E2E Testkosten ohne OCR ${RUN}`;
const COST_PLAIN_A = `e2e-ocr-kostenbeleg-ohne-a-${RUN}.pdf`;
const COST_PLAIN_B = `e2e-ocr-kostenbeleg-ohne-b-${RUN}.pdf`;
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
  const dialog = await openAdd(page, "Dokument hochladen");
  await dialog.locator('select[name="periodId"]').selectOption({ label: String(CURRENT_YEAR) });
  return dialog;
}

/** Nach dem Prüfschritt steht der Dialog wieder beim Upload – „Fertig“ schließt ihn. */
async function finish(dialog: Locator): Promise<void> {
  await expect(dialog.getByRole("heading", { name: "Dokument hochladen" })).toBeVisible();
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toBeHidden();
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
    await dialog.locator('input[name="file"]').setInputFiles(pdf(INVOICE, "OCR-RECHNUNG"));
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
    // Der Dialog bleibt für das nächste Dokument offen und führt Buch über das Hochgeladene.
    await expect(dialog.getByRole("status").filter({ hasText: "1 Dokument hochgeladen" })).toContainText(INVOICE);
    await finish(dialog);

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
    await dialog.locator('input[name="file"]').setInputFiles(pdf(OWN_VALUES, "OCR-RECHNUNG"));
    await dialog.getByText("Rechnungsdaten (Rechnungssteller").click();
    // Im Upload-Schritt nennt auch der OCR-Hinweis den Rechnungssteller – daher über den Feldnamen.
    await dialog.locator('input[name="supplier"]').fill("Mein eigener Eintrag");
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByText("OCR verarbeitet – 8 Felder übernommen")).toBeVisible();
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("Mein eigener Eintrag");
    await expect(dialog.getByLabel("Rechnungsnummer")).toHaveValue("RE-2026-0042");
    await dialog.getByRole("button", { name: "Später ergänzen" }).click();
    await finish(dialog);
    await expect(row(page, OWN_VALUES)).toContainText("Mein eigener Eintrag · Nr. RE-2026-0042");
  });

  test("nicht lesbares Dokument: Upload gelingt, OCR meldet den Fehler", async () => {
    const dialog = await openUpload(page);
    await dialog.locator('input[name="file"]').setInputFiles(pdf(UNREADABLE, "OCR-UNLESBAR"));
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByText(`„${UNREADABLE}“ wurde hochgeladen.`)).toBeVisible();
    const error = dialog.getByRole("alert").filter({ hasText: "OCR-Fehler" });
    await expect(error).toContainText("nicht lesbar oder das Format wird nicht unterstützt");
    // Alle Felder bleiben leer und lassen sich manuell ausfüllen.
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("");
    await expect(dialog.getByLabel("Brutto (€)")).toHaveValue("");
    await dialog.getByLabel("Rechnungssteller").fill("Von Hand ergänzt");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("status").filter({ hasText: UNREADABLE })).toContainText("OCR-Fehler");
    await finish(dialog);

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
    await dialog.locator('input[name="file"]').setInputFiles({
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
    await finish(dialog);
    await expect(row(page, WEBP)).toContainText("Fehler");
  });

  test("Dokument ohne Rechnungsdaten: verarbeitet, Felder bleiben leer", async () => {
    const dialog = await openUpload(page);
    await dialog.locator('input[name="file"]').setInputFiles(pdf(PLAIN, "nur ein Brief"));
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByText("OCR verarbeitet – keine Daten übernommen")).toBeVisible();
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("");
    await dialog.getByRole("button", { name: "Später ergänzen" }).click();
    await finish(dialog);
    await expect(row(page, PLAIN)).toContainText("Verarbeitet");
  });

  test("ohne Häkchen bleibt der OCR-Status offen – Auslesen geht später per Schaltfläche", async () => {
    const dialog = await openUpload(page);
    await dialog.getByRole("checkbox", { name: /Automatisch per OCR auslesen/ }).uncheck();
    await dialog.locator('input[name="file"]').setInputFiles(pdf(MANUAL, "OCR-RECHNUNG"));
    await dialog.getByRole("button", { name: "Hochladen", exact: true }).click();
    await expect(dialog.getByRole("status").filter({ hasText: "1 Dokument hochgeladen" })).toContainText(MANUAL);
    // Kein Prüfschritt: das Formular ist wieder leer und bereit für das nächste Dokument.
    await finish(dialog);

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

  test("Kostenformular: Beleg wählen → OCR füllt die Felder → prüfen → speichern", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    // Der Beleg-Upload steht ganz oben – vor den Eingabefeldern – und ist wie der Upload-Dialog
    // aufgebaut: Dateifeld für mehrere Dateien, OCR vorbelegt.
    const picker = dialog.getByLabel("Beleg hochladen");
    await expect(picker).toHaveAttribute("multiple", "");
    const ocr = dialog.getByRole("checkbox", { name: "Automatisch per OCR auslesen" });
    await expect(ocr).toBeChecked();
    await expectAbove(picker, ocr);
    await expectAbove(ocr, dialog.getByLabel("Kostenart"));
    // Die Rechnungsnummer ist von Hand eingetragen – sie bleibt stehen.
    await dialog.getByLabel("Rechnungsnummer").fill("EIGENE-NR");
    await picker.setInputFiles(pdf(COST_FILE, "OCR-RECHNUNG"));

    // Die erkannten Werte stehen vor dem Speichern in den Feldern …
    await expect(dialog.getByRole("status").filter({ hasText: COST_FILE })).toContainText(
      "Ausgelesen – übernommen: Rechnungssteller, Rechnungsdatum, Leistungszeitraum von, " +
        "Leistungszeitraum bis, Beschreibung, Netto, MwSt., Betrag (brutto)",
    );
    await expect(dialog.getByText("1 Beleg hochgeladen")).toBeVisible();
    await expect(dialog.getByLabel("Weiteren Beleg hochladen")).toBeVisible();
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("Rauchfangkehrer Muster GmbH");
    await expect(dialog.getByLabel("Rechnungsnummer")).toHaveValue("EIGENE-NR");
    await expect(dialog.getByLabel("Rechnungsdatum")).toHaveValue("2026-03-15");
    await expect(dialog.getByLabel("Leistungszeitraum von")).toHaveValue("2026-01-01");
    await expect(dialog.getByLabel("Leistungszeitraum bis")).toHaveValue("2026-03-31");
    await expect(dialog.getByLabel("Beschreibung")).toHaveValue("Kehrung, Abgasmessung");
    await expect(dialog.getByLabel("Netto (€)")).toHaveValue("179,00");
    await expect(dialog.getByLabel("MwSt. (€)")).toHaveValue("35,80");
    await expect(dialog.getByLabel("Betrag (€)")).toHaveValue("214,80");

    // … und lassen sich prüfen und korrigieren.
    await dialog.getByLabel("Beschreibung").fill(COST);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    const costRow = row(page, COST);
    await expect(costRow).toContainText("Rauchfangkehrer Muster GmbH");
    await expect(costRow).toContainText("15.03.2026");
    await expect(costRow).toContainText("Leistung 01.01.2026 – 31.03.2026 · netto € 179,00 · MwSt. € 35,80");
    await expect(costRow).toContainText("€ 214,80");
    await expect(costRow.getByRole("button", { name: COST_FILE })).toBeVisible();

    // Das Dokument ist verknüpft, verarbeitet und trägt die im Formular geprüften Rechnungsdaten.
    await page.goto(`/dokumente?q=${RUN}`);
    const documentRow = row(page, COST_FILE);
    await expect(documentRow).toContainText("Verarbeitet");
    await expect(documentRow).toContainText(COST);
    await expect(documentRow).toContainText("Rauchfangkehrer Muster GmbH · Nr. EIGENE-NR");
    await expect(documentRow).toContainText("netto € 179,00 · MwSt. € 35,80 · brutto € 214,80");
    await expect(documentRow).toContainText("Leistung 01.01.2026 – 31.03.2026");
    // Was die OCR erkannt hat, bleibt daneben gespeichert.
    await page.getByRole("button", { name: `${COST_FILE} bearbeiten` }).click();
    await expect(page.getByRole("dialog").getByRole("status").filter({ hasText: "Von OCR erkannt" })).toContainText(
      "Nr. RE-2026-0042 ·",
    );
    await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();
  });

  test("Kostenformular: ein OCR-Fehler blockiert nicht – Felder von Hand, mehrere Belege je Position", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: `${COST} bearbeiten` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Weiteren Beleg hochladen").setInputFiles(pdf(COST_UNREADABLE, "OCR-UNLESBAR"));
    await expect(dialog.getByRole("status").filter({ hasText: COST_UNREADABLE })).toContainText(
      "Gespeichert – OCR-Fehler",
    );
    // Eingetragenes bleibt unangetastet, das Formular lässt sich normal speichern.
    await expect(dialog.getByLabel("Rechnungsnummer")).toHaveValue("EIGENE-NR");
    await dialog.getByLabel("Notiz").fill("zweiter Beleg von Hand ergänzt");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    const costRow = row(page, COST);
    await expect(costRow.getByRole("button", { name: COST_FILE })).toBeVisible();
    await expect(costRow.getByRole("button", { name: COST_UNREADABLE })).toBeVisible();
    // Bei mehreren Belegen behält jeder seine eigenen Daten – der erste wird nicht überschrieben.
    await page.goto(`/dokumente?q=${RUN}`);
    await expect(row(page, COST_FILE)).toContainText("Nr. EIGENE-NR");
    await expect(row(page, COST_UNREADABLE)).toContainText("Fehler");
  });

  test("Kostenformular: Abbrechen oder Entfernen hinterlässt keinen verwaisten Beleg", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    await dialog.getByLabel("Beleg hochladen").setInputFiles(pdf(COST_DISCARDED, "OCR-RECHNUNG"));
    await expect(dialog.getByRole("status").filter({ hasText: COST_DISCARDED })).toContainText("Ausgelesen");
    // Entfernen löscht den Beleg; die übernommenen Werte bleiben zum Korrigieren stehen.
    await dialog.getByRole("button", { name: `${COST_DISCARDED} entfernen` }).click();
    await expect(dialog.getByText(COST_DISCARDED)).toHaveCount(0);
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("Rauchfangkehrer Muster GmbH");

    // Noch einmal hochladen und dann abbrechen.
    await dialog.getByLabel("Beleg hochladen").setInputFiles(pdf(COST_DISCARDED, "OCR-RECHNUNG"));
    await expect(dialog.getByRole("status").filter({ hasText: COST_DISCARDED })).toContainText("Ausgelesen");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toBeHidden();

    // Das Aufräumen läuft im Hintergrund – kurz darauf ist der Beleg verschwunden.
    await expect(async () => {
      await page.goto(`/dokumente?q=${RUN}`);
      await expect(row(page, COST_FILE)).toBeVisible();
      await expect(row(page, COST_DISCARDED)).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  });

  test("Kostenformular: mehrere Belege auf einmal; ohne Häkchen wird nur gespeichert", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    await dialog.getByRole("checkbox", { name: "Automatisch per OCR auslesen" }).uncheck();
    await dialog
      .getByLabel("Beleg hochladen")
      .setInputFiles([pdf(COST_PLAIN_A, "OCR-RECHNUNG"), pdf(COST_PLAIN_B, "OCR-RECHNUNG")]);

    // Beide sind gespeichert, aber nicht ausgelesen – die Felder bleiben leer.
    await expect(dialog.getByText("2 Belege hochgeladen")).toBeVisible();
    for (const name of [COST_PLAIN_A, COST_PLAIN_B]) {
      await expect(dialog.getByRole("status").filter({ hasText: name })).toContainText("Gespeichert.");
    }
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("");
    await expect(dialog.getByLabel("Betrag (€)")).toHaveValue("");

    await dialog.getByLabel("Beschreibung").fill(COST_PLAIN);
    await dialog.getByLabel("Betrag (€)").fill("10,00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    // Beide Originale hängen an der Position; ausgelesen wurde keines.
    const costRow = row(page, COST_PLAIN);
    await expect(costRow.getByRole("button", { name: COST_PLAIN_A })).toBeVisible();
    await expect(costRow.getByRole("button", { name: COST_PLAIN_B })).toBeVisible();
    await page.goto(`/dokumente?q=${RUN}`);
    for (const name of [COST_PLAIN_A, COST_PLAIN_B]) {
      await expect(row(page, name)).toContainText(COST_PLAIN);
      await expect(row(page, name)).toContainText("Offen");
    }
  });

  test("Einzahlungsformular: angehängter Nachweis wird ausgelesen", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}&top=3`);
    const dialog = await openAdd(page, "Einzahlung hinzufügen");
    await expect(dialog.getByText("wird automatisch per OCR ausgelesen")).toBeVisible();
    await dialog.getByLabel("Betrag (€)").fill("55,55");
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 3" });
    await dialog.getByLabel("Beschreibung / Verwendungszweck").fill(PURPOSE);
    await dialog.locator('input[name="file"]').setInputFiles(pdf(PROOF_FILE, "nur ein Kontoauszug"));
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
    for (const name of [
      INVOICE,
      OWN_VALUES,
      UNREADABLE,
      WEBP,
      PLAIN,
      MANUAL,
      USER_FILE,
      COST_FILE,
      COST_UNREADABLE,
      COST_PLAIN_A,
      COST_PLAIN_B,
      PROOF_FILE,
    ]) {
      await page.getByRole("button", { name: `${name} löschen` }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(row(page, name)).toHaveCount(0);
    }

    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    for (const cost of [COST, COST_PLAIN]) {
      await page.getByRole("button", { name: `${cost} löschen` }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(row(page, cost)).toHaveCount(0);
    }
  });
});
