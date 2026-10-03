import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  CURRENT_YEAR,
  RELEASED_YEAR,
  expectAbove,
  expectNoHorizontalOverflow,
  login,
  openAdd,
} from "./helpers";

const RUN = Date.now().toString(36);
const COST = `E2E Testkosten Foto ${RUN}`;
const COST_PHOTO = `e2e-foto-kosten-${RUN}.png`;
const DOCUMENT_PHOTO = `e2e-foto-dokument-${RUN}.png`;

/** Foto wie aus der Handy-Kamera: PNG-Signatur plus die Marke, an der der OCR-Nachbau eine Rechnung erkennt. */
const photo = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`OCR-RECHNUNG ${name}`),
  ]),
});

/** Tippt auf „Beleg fotografieren“; die Kamera des Geräts liefert im Test das Foto. */
async function takePhoto(page: Page, dialog: Locator, name: string): Promise<void> {
  const button = dialog.getByRole("button", { name: "Beleg fotografieren" });
  await expect(button).toBeVisible();
  // capture="environment": das Handy öffnet die Rückkamera statt der Dateiauswahl.
  await expect(dialog.locator('input[type="file"][capture="environment"]')).toHaveAttribute(
    "accept",
    "image/*",
  );
  const camera = page.waitForEvent("filechooser");
  await button.click();
  await (await camera).setFiles(photo(name));
}

test.describe("Mobil", () => {
  test("Navigation ist eingeklappt und lässt sich öffnen", async ({ page }) => {
    await login(page, "top2");

    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav).toBeHidden();

    await page.getByRole("button", { name: "Navigation öffnen" }).click();
    await expect(nav).toBeVisible();
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Einstellungen" })).toBeVisible();

    await expect(nav.getByRole("link", { name: "Dokumente" })).toBeVisible();
    await nav.getByRole("link", { name: "Einzahlungen" }).click();
    await expect(page).toHaveURL(/\/einzahlungen/);
    await expect(nav).toBeHidden();
  });

  test("keine Seite läuft seitlich über", async ({ page }) => {
    await login(page, "top2");
    for (const path of [
      "/dashboard",
      "/abrechnung",
      `/abrechnung/${RELEASED_YEAR}`,
      `/abrechnung/${RELEASED_YEAR}/monate`,
      `/abrechnung/${CURRENT_YEAR}/kosten`,
      `/abrechnung/${CURRENT_YEAR}/schluessel`,
      `/abrechnung/${CURRENT_YEAR}/belege`,
      "/einzahlungen",
      "/dokumente",
      "/pruefung",
      "/einstellungen",
      "/einstellungen/stammdaten",
      "/einstellungen/benutzer",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("Formulardialog ist auf dem Handy bedienbar", async ({ page }) => {
    await login(page, "top2");
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    // „Hinzufügen“ liegt im sichtbaren Bereich; die Auswahl kommt als Sheet von unten.
    await expect(page.getByRole("button", { name: "Hinzufügen", exact: true })).toBeInViewport();
    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    await expect(dialog.getByLabel("Beschreibung")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Speichern und Abbrechen müssen ohne Scrollen im sichtbaren Bereich liegen.
    const save = dialog.getByRole("button", { name: "Speichern" });
    await expect(save).toBeInViewport();
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toBeHidden();
  });
  test("Beleg fotografieren im Kostenformular: Foto → OCR → Felder prüfen → speichern", async ({ page }) => {
    await login(page, "top2");
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    // Wie im Upload-Dialog: Kamera, Dateifeld und OCR-Häkchen stehen oben, vor den Eingabefeldern.
    const camera = dialog.getByRole("button", { name: "Beleg fotografieren" });
    const picker = dialog.getByLabel("Beleg hochladen");
    const ocr = dialog.getByRole("checkbox", { name: "Automatisch per OCR auslesen" });
    await expectAbove(camera, picker);
    await expectAbove(picker, ocr);
    await expectAbove(ocr, dialog.getByLabel("Kostenart"));
    await takePhoto(page, dialog, COST_PHOTO);

    // Das Foto ist gespeichert und ausgelesen; die erkannten Werte stehen in den Feldern.
    const result = dialog.getByRole("status").filter({ hasText: COST_PHOTO });
    await expect(result).toContainText("Ausgelesen – übernommen");
    await expect(result).toBeInViewport();
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("Rauchfangkehrer Muster GmbH");
    await expect(dialog.getByLabel("Betrag (€)")).toHaveValue("214,80");
    await expect(dialog.getByLabel("Leistungszeitraum von")).toHaveValue("2026-01-01");
    await expectNoHorizontalOverflow(page);

    await dialog.getByLabel("Beschreibung").fill(COST);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    // Die neue Position steht sofort in der Liste – mit dem Foto als Beleg.
    await expect(page.getByRole("button", { name: `${COST} bearbeiten` })).toBeVisible();
    await expect(page.getByRole("button", { name: COST_PHOTO })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Beleg fotografieren im Upload-Dialog: sofort hochgeladen, ausgelesen, bereit fürs nächste Foto", async ({
    page,
  }) => {
    await login(page, "top2");
    await page.goto(`/dokumente?q=${RUN}`);
    const dialog = await openAdd(page, "Dokument hochladen");
    await dialog.locator('select[name="periodId"]').selectOption({ label: String(CURRENT_YEAR) });
    await takePhoto(page, dialog, DOCUMENT_PHOTO);

    // Ohne weiteren Klick: hochgeladen, ausgelesen, erkannte Daten zum Prüfen.
    await expect(dialog.getByRole("heading", { name: "Erkannte Daten prüfen" })).toBeVisible();
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("Rauchfangkehrer Muster GmbH");
    await dialog.getByRole("button", { name: "Speichern" }).click();

    await expect(dialog.getByRole("status").filter({ hasText: "1 Dokument hochgeladen" })).toContainText(
      DOCUMENT_PHOTO,
    );
    await expect(dialog.getByRole("button", { name: "Beleg fotografieren" })).toBeVisible();
    await dialog.getByRole("button", { name: "Fertig" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Testdaten der Foto-Tests wieder löschen", async ({ page }) => {
    await login(page, "top2");
    const confirm = async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
    };

    await page.goto(`/dokumente?q=${RUN}`);
    for (const name of [COST_PHOTO, DOCUMENT_PHOTO]) {
      await page.getByRole("button", { name: `${name} löschen` }).click();
      await confirm();
      await expect(page.getByRole("button", { name: `${name} löschen` })).toHaveCount(0);
    }

    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: `${COST} löschen` }).click();
    await confirm();
    await expect(page.getByRole("button", { name: `${COST} bearbeiten` })).toHaveCount(0);
  });
});
