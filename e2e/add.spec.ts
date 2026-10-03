import { expect, test, type Page } from "@playwright/test";

import { CURRENT_YEAR, login, openAdd, tinyPdf } from "./helpers";

// „Hinzufügen“: beliebig viele Einträge nacheinander – jeder ein eigener Datensatz, nichts wird
// überschrieben, und Neues steht sofort in der Liste.
const RUN = Date.now().toString(36);
const COSTS = [1, 2, 3].map((n) => `E2E Testkosten Serie ${n} ${RUN}`);
const PURPOSES = [1, 2].map((n) => `E2E Einzahlung Serie ${n} ${RUN}`);
const SUBMITTED = `E2E Einzahlung Serie eingereicht ${RUN}`;
const FILES = [1, 2, 3].map((n) => `e2e-serie-${n}-${RUN}.pdf`);
const LATER = `e2e-serie-nachtrag-${RUN}.pdf`;

const rows = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const pdf = (name: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: tinyPdf(`OCR-RECHNUNG ${name}`),
});
const addButton = (page: Page) =>
  page.locator("main header").getByRole("button", { name: "Hinzufügen", exact: true });

test.describe.serial("Hinzufügen", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, "top2");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("steht in jeder relevanten Ansicht oben rechts – die Aktion des Bereichs zuerst", async () => {
    const first: Record<string, RegExp> = {
      "/dashboard": /^Kostenposition hinzufügen/,
      "/abrechnung": /^Kostenposition hinzufügen/,
      [`/abrechnung/${CURRENT_YEAR}`]: /^Kostenposition hinzufügen/,
      [`/abrechnung/${CURRENT_YEAR}/kosten`]: /^Kostenposition hinzufügen/,
      [`/abrechnung/${CURRENT_YEAR}/belege`]: /^Kostenposition hinzufügen/,
      "/einzahlungen": /^Einzahlung hinzufügen/,
      "/dokumente": /^Dokument hochladen/,
    };
    for (const [path, primary] of Object.entries(first)) {
      await page.goto(path);
      await addButton(page).click();
      const menu = page.getByRole("dialog", { name: "Hinzufügen" });
      const entries = menu.getByRole("listitem").getByRole("button");
      await expect(entries, path).toHaveCount(4);
      await expect(entries.first(), path).toHaveAccessibleName(primary);
      for (const label of [
        /^Kostenposition hinzufügen/,
        /^Einzahlung hinzufügen/,
        /^Dokument hochladen/,
        /^Abrechnungsjahr hinzufügen/,
      ]) {
        await expect(menu.getByRole("button", { name: label }), path).toBeVisible();
      }
      await menu.getByRole("button", { name: "Schließen" }).click();
      await expect(menu).toBeHidden();
    }
  });

  test("mehrere Kostenpositionen nacheinander – jede bleibt als eigener Eintrag bestehen", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const before = await page.getByRole("table").getByRole("row").count();

    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    await dialog.getByRole("checkbox", { name: "Weiteren Eintrag anlegen" }).check();
    for (const [index, name] of COSTS.entries()) {
      // Vor dem letzten Eintrag das Häkchen entfernen: danach schließt sich der Dialog.
      if (index === COSTS.length - 1) {
        await dialog.getByRole("checkbox", { name: "Weiteren Eintrag anlegen" }).uncheck();
      }
      await dialog.getByLabel("Beschreibung").fill(name);
      await dialog.getByLabel("Betrag (€)").fill(`${index + 1}0,00`);
      await dialog.getByRole("button", { name: "Speichern" }).click();
      if (index < COSTS.length - 1) {
        const saved = index + 1;
        await expect(
          dialog.getByText(`Gespeichert – ${saved} ${saved === 1 ? "Eintrag" : "Einträge"} angelegt`),
        ).toBeVisible();
        // Das Formular ist für den nächsten Eintrag wieder leer.
        await expect(dialog.getByLabel("Beschreibung")).toHaveValue("");
      }
    }
    await expect(dialog).toBeHidden();

    // Ohne Neuladen: alle drei stehen in der Liste, jede mit ihrem eigenen Betrag.
    for (const [index, name] of COSTS.entries()) {
      await expect(rows(page, name)).toHaveCount(1);
      await expect(rows(page, name)).toContainText(`€ ${index + 1}0,00`);
    }
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(before + COSTS.length);
  });

  test("mehrere Einzahlungen – aus der Liste und vom Dashboard aus", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}`);
    let dialog = await openAdd(page, "Einzahlung hinzufügen");
    await dialog.getByLabel("Betrag (€)").fill("11,00");
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 1" });
    await dialog.getByLabel("Beschreibung / Verwendungszweck").fill(PURPOSES[0]);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(rows(page, PURPOSES[0])).toContainText("€ 11,00");

    await page.goto(`/dashboard?jahr=${CURRENT_YEAR}`);
    dialog = await openAdd(page, "Einzahlung hinzufügen");
    // Das Jahr der Ansicht ist vorausgewählt.
    await expect(dialog.locator('select[name="periodId"] option:checked')).toHaveText(String(CURRENT_YEAR));
    await dialog.getByLabel("Betrag (€)").fill("22,00");
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 1" });
    await dialog.getByLabel("Beschreibung / Verwendungszweck").fill(PURPOSES[1]);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}&top=1`);
    await expect(rows(page, PURPOSES[0])).toContainText("€ 11,00");
    await expect(rows(page, PURPOSES[1])).toContainText("€ 22,00");
  });

  test("mehrere Dokumente: auf einmal und nacheinander, mit OCR, ohne Überschreiben", async () => {
    test.setTimeout(90_000);
    await page.goto(`/dokumente?q=${RUN}`);
    const dialog = await openAdd(page, "Dokument hochladen");
    await dialog.locator('select[name="periodId"]').selectOption({ label: String(CURRENT_YEAR) });

    // Drei Dateien auf einmal: Typ und Jahr gelten für alle, Rechnungsdaten kommen je Dokument per OCR.
    await dialog.locator('input[name="file"]').setInputFiles(FILES.map(pdf));
    await expect(dialog.getByText("3 Dateien gewählt")).toBeVisible();
    await expect(dialog.getByText("Rechnungsdaten (Rechnungssteller")).toBeHidden();
    await dialog.getByRole("button", { name: "3 Dokumente hochladen und auslesen" }).click();
    const log = dialog.getByRole("status").filter({ hasText: "hochgeladen" });
    await expect(log).toContainText("3 Dokumente hochgeladen", { timeout: 45_000 });
    for (const name of FILES) await expect(log).toContainText(name);

    // Der Dialog bleibt offen: ein weiteres Dokument – diesmal mit Prüfschritt.
    await dialog.locator('input[name="file"]').setInputFiles(pdf(LATER));
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();
    await expect(dialog.getByRole("heading", { name: "Erkannte Daten prüfen" })).toBeVisible();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(log).toContainText("4 Dokumente hochgeladen");

    // Dieselbe Datei noch einmal: abgelehnt – das vorhandene Dokument bleibt unberührt.
    await dialog.locator('input[name="file"]').setInputFiles(pdf(FILES[0]));
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();
    await expect(log).toContainText("4 Dokumente hochgeladen · 1 nicht gespeichert");
    await expect(log).toContainText("wurde bereits als");
    await dialog.getByRole("button", { name: "Fertig" }).click();
    await expect(dialog).toBeHidden();

    // Alle vier stehen in der Liste – je ein eigenes Dokument mit eigener Datei, per OCR ausgelesen.
    const hrefs = new Set<string>();
    for (const name of [...FILES, LATER]) {
      await expect(rows(page, name)).toHaveCount(1);
      await expect(rows(page, name)).toContainText("Verarbeitet");
      await expect(rows(page, name)).toContainText("Rauchfangkehrer Muster GmbH");
      const href = await rows(page, name)
        .getByRole("link", { name: `${name} herunterladen` })
        .getAttribute("href");
      hrefs.add(href!);
    }
    expect(hrefs.size).toBe(4);
  });

  test("ohne offenes Jahr erklärt das Menü, warum sich keine Kosten anlegen lassen", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}`);
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Freigeben" }).click();
    await expect(page.getByRole("button", { name: "Freigabe zurücknehmen" })).toBeVisible();

    // finally: die Freigabe wird auch nach einem Fehlschlag zurückgenommen – die übrigen Tests
    // setzen das laufende Jahr im Entwurf voraus.
    try {
      await addButton(page).click();
      const menu = page.getByRole("dialog", { name: "Hinzufügen" });
      const cost = menu.getByRole("button", { name: /^Kostenposition hinzufügen/ });
      await expect(cost).toHaveAttribute("aria-disabled", "true");
      await expect(cost).toContainText("Alle Abrechnungsjahre sind freigegeben");
      // Ein Klick auf den gesperrten Eintrag öffnet nichts.
      await cost.click({ force: true });
      await expect(menu.getByRole("heading", { name: "Hinzufügen", exact: true })).toBeVisible();
      // Einzahlungen und Dokumente bleiben auch nach der Freigabe möglich.
      await expect(menu.getByRole("button", { name: /^Einzahlung hinzufügen/ })).not.toHaveAttribute(
        "aria-disabled",
      );
    } finally {
      await page.goto(`/abrechnung/${CURRENT_YEAR}`);
      await page.getByRole("button", { name: "Freigabe zurücknehmen" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Zurücknehmen" }).click();
      await expect(page.getByRole("button", { name: "Freigeben" })).toBeVisible();
    }
  });

  test("USER reichen von jeder Ansicht aus ein und landen bei „Meine Eingaben“", async ({ browser }) => {
    const user = await browser.newPage();
    await login(user, "top1");
    const dialog = await openAdd(user, "Einzahlung einreichen");
    await dialog.getByLabel("Betrag (€)").fill("33,00");
    await dialog.getByLabel("Beschreibung / Verwendungszweck").fill(SUBMITTED);
    await dialog.getByRole("button", { name: "Einreichen" }).click();

    await expect(user).toHaveURL(/\/eingaben$/);
    await expect(rows(user, SUBMITTED)).toContainText("Ausstehende Prüfung");
    await user.close();
  });

  test("Testdaten wieder löschen", async () => {
    const confirm = async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
    };

    await page.goto("/pruefung");
    await rows(page, SUBMITTED).getByRole("button", { name: /löschen/ }).click();
    await confirm();
    await expect(rows(page, SUBMITTED)).toHaveCount(0);

    await page.goto(`/dokumente?q=${RUN}`);
    for (const name of [...FILES, LATER]) {
      await page.getByRole("button", { name: `${name} löschen` }).click();
      await confirm();
      await expect(rows(page, name)).toHaveCount(0);
    }

    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    for (const name of COSTS) {
      await page.getByRole("button", { name: `${name} löschen` }).click();
      await confirm();
      await expect(rows(page, name)).toHaveCount(0);
    }

    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}&top=1`);
    for (const purpose of PURPOSES) {
      await rows(page, purpose).getByRole("button", { name: /löschen/ }).click();
      await confirm();
      await expect(rows(page, purpose)).toHaveCount(0);
    }
  });
});
