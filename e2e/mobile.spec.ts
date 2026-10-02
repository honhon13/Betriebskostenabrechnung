import { expect, test } from "@playwright/test";

import { CURRENT_YEAR, RELEASED_YEAR, expectNoHorizontalOverflow, login } from "./helpers";

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
    await page.getByRole("button", { name: "Kosten erfassen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Beschreibung")).toBeVisible();

    // Speichern und Abbrechen müssen ohne Scrollen im sichtbaren Bereich liegen.
    const save = dialog.getByRole("button", { name: "Speichern" });
    await expect(save).toBeInViewport();
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toBeHidden();
  });
});
