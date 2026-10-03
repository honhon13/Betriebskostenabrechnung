import { expect, test, type Page } from "@playwright/test";

import { CURRENT_YEAR, login } from "./helpers";

// „E2E Testkosten …“: so räumt global-setup Vorlagen und erzeugte Positionen abgebrochener Läufe weg.
const RUN = Date.now().toString(36);
const TEMPLATE = `E2E Testkosten Vorlage ${RUN}`;
const ONLY_TOP3 = `E2E Testkosten Vorlage TOP3 ${RUN}`;
const JANUARY = `${TEMPLATE} Jänner ${CURRENT_YEAR}`;
const FEBRUARY = `${TEMPLATE} Februar ${CURRENT_YEAR}`;
const MARCH = `${TEMPLATE} März ${CURRENT_YEAR}`;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

test.describe.serial("Wiederkehrende Kosten", () => {
  let admin: Page;
  let user: Page;

  test.beforeAll(async ({ browser }) => {
    admin = await browser.newPage();
    await login(admin, "top2");
    user = await browser.newPage();
    await login(user, "top1");
  });

  test.afterAll(async () => {
    await admin.close();
    await user.close();
  });

  test("ADMIN legt Vorlagen an: Betragstyp, Intervall, Umlageschlüssel und TOP-Zuordnung", async () => {
    await admin.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Wiederkehrende Kosten" }).click();
    await expect(admin).toHaveURL(/\/wiederkehrend$/);

    await admin.getByRole("button", { name: "Vorlage", exact: true }).click();
    let dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Kostenart").selectOption({ label: "Hausbetreuung / Reinigung" });
    // Der Standardschlüssel der Kostenart ist vorgewählt.
    await expect(dialog.getByLabel("Umlageschlüssel").locator("option:checked")).toContainText("Wohnfläche");
    await dialog.getByLabel("Beschreibung").fill(TEMPLATE);
    // Ein Fixbetrag braucht einen Betrag.
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(dialog.getByText("Bitte den Betrag je Zeitraum angeben.")).toBeVisible();
    await dialog.getByLabel("Betrag je Zeitraum (€)").fill("120,00");
    await dialog.getByLabel("Rechnungssteller").fill("Hausbetreuung Muster");
    await dialog.getByLabel("Umlageschlüssel").selectOption({ label: "Gleiche Teile" });
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(dialog).toBeHidden();

    const template = row(admin, TEMPLATE);
    for (const text of ["Hausbetreuung / Reinigung", "Monatlich", "€ 120,00", "je Monat", "Gleiche Teile", "Alle", "0 von 12"]) {
      await expect(template).toContainText(text);
    }

    // Zweite Vorlage: quartalsweise, variabler Betrag, nur TOP 3.
    await admin.getByRole("button", { name: "Vorlage", exact: true }).click();
    dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Beschreibung").fill(ONLY_TOP3);
    await dialog.getByLabel("Intervall").selectOption({ label: "Quartalsweise" });
    await dialog.getByLabel("Betragstyp").selectOption({ label: "Variabel – Betrag beim Erzeugen" });
    await dialog.getByLabel("TOP 1").uncheck();
    await dialog.getByLabel("TOP 2").uncheck();
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(dialog).toBeHidden();
    for (const text of ["Quartalsweise", "variabel", "je Quartal", "TOP 3", "0 von 4"]) {
      await expect(row(admin, ONLY_TOP3)).toContainText(text);
    }
  });

  test("Kostenpositionen erzeugen: je gewähltem Monat eine – Erzeugtes ist danach gesperrt", async () => {
    await admin.getByRole("button", { name: `Kostenpositionen aus ${TEMPLATE} erzeugen` }).click();
    let dialog = admin.getByRole("dialog");
    await expect(dialog.getByLabel("Abrechnungsjahr")).toContainText(String(CURRENT_YEAR));
    await expect(dialog.getByRole("checkbox")).toHaveCount(12);
    // Der Fixbetrag der Vorlage ist vorgeschlagen.
    await expect(dialog.getByLabel("Betrag je Zeitraum (€)")).toHaveValue("120,00");
    await dialog.getByLabel(`Jänner ${CURRENT_YEAR}`).check();
    await dialog.getByLabel(`Februar ${CURRENT_YEAR}`).check();
    await expect(dialog.getByText(`Es entstehen 2 Kostenpositionen, z. B. „${JANUARY}“`)).toBeVisible();
    await dialog.getByRole("button", { name: "Erzeugen" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(admin, TEMPLATE)).toContainText("2 von 12");

    // Erzeugte Zeiträume sind abgehakt und gesperrt, doppelt erzeugen geht nicht.
    await admin.getByRole("button", { name: `Kostenpositionen aus ${TEMPLATE} erzeugen` }).click();
    dialog = admin.getByRole("dialog");
    await expect(dialog.getByText("bereits erzeugt")).toHaveCount(2);
    await expect(dialog.getByLabel(`Jänner ${CURRENT_YEAR}`)).toBeDisabled();
    await expect(dialog.getByLabel(`Jänner ${CURRENT_YEAR}`)).toBeChecked();
    await expect(dialog.getByLabel(`März ${CURRENT_YEAR}`)).toBeEnabled();
    // Ohne Zeitraum gibt es nichts zu erzeugen.
    await dialog.getByRole("button", { name: "Erzeugen" }).click();
    await expect(dialog.getByText("Bitte mindestens einen Zeitraum auswählen.")).toBeVisible();
    await dialog.getByRole("button", { name: "Abbrechen" }).click();

    // Die Positionen stehen bei den Kosten: Werte aus der Vorlage, Zeitraum als Leistungszeitraum.
    await admin.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const january = row(admin, JANUARY);
    for (const text of [
      "€ 120,00",
      "Hausbetreuung / Reinigung · Hausbetreuung Muster",
      `Leistung 01.01.${CURRENT_YEAR} – 31.01.${CURRENT_YEAR}`,
      `01.01.${CURRENT_YEAR}`,
      "Gleiche Teile",
      "Alle",
    ]) {
      await expect(january).toContainText(text);
    }
    await expect(row(admin, FEBRUARY)).toContainText(`Leistung 01.02.${CURRENT_YEAR} – `);
  });

  test("erzeugte Positionen und Vorlage sind voneinander unabhängig", async () => {
    // Position ändern – die Vorlage bleibt.
    await admin.getByRole("button", { name: `${JANUARY} bearbeiten` }).click();
    let dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Betrag (€)").fill("99,00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(admin, JANUARY)).toContainText("€ 99,00");

    // Vorlage ändern – die Positionen bleiben.
    await admin.goto("/wiederkehrend");
    await expect(row(admin, TEMPLATE)).toContainText("€ 120,00");
    await admin.getByRole("button", { name: `Vorlage ${TEMPLATE} bearbeiten` }).click();
    dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Betrag je Zeitraum (€)").fill("130,00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(admin, TEMPLATE)).toContainText("€ 130,00");
    // Die geänderte Position zählt weiter als erzeugt.
    await expect(row(admin, TEMPLATE)).toContainText("2 von 12");

    await admin.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await expect(row(admin, JANUARY)).toContainText("€ 99,00");
    await expect(row(admin, FEBRUARY)).toContainText("€ 120,00");
  });

  test("USER verwenden Vorlagen ihrer TOP zum Einreichen – pflegen können sie sie nicht", async () => {
    await user.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Wiederkehrende Kosten" }).click();
    await expect(row(user, TEMPLATE)).toBeVisible();
    // Vorlagen, an denen die eigene TOP nicht beteiligt ist, sind unsichtbar.
    await expect(row(user, ONLY_TOP3)).toHaveCount(0);
    await expect(user.getByRole("button", { name: "Vorlage", exact: true })).toHaveCount(0);
    await expect(user.getByRole("button", { name: /bearbeiten|löschen/ })).toHaveCount(0);

    await user.getByRole("button", { name: `Kosten aus ${TEMPLATE} einreichen` }).click();
    const dialog = user.getByRole("dialog");
    await expect(dialog.getByText("bereits erzeugt")).toHaveCount(2);
    await dialog.getByLabel(`März ${CURRENT_YEAR}`).check();
    await expect(dialog.getByText("zur Prüfung eingereicht")).toBeVisible();
    await expect(dialog.getByLabel("Betrag je Zeitraum (€)")).toHaveValue("130,00");
    await dialog.getByRole("button", { name: "Einreichen" }).click();
    await expect(dialog).toBeHidden();

    await user.goto("/eingaben");
    await expect(row(user, MARCH)).toContainText("Ausstehende Prüfung");
    await expect(row(user, MARCH)).toContainText("€ 130,00");

    // Bei der Verwaltung: ungeprüft, mit Schlüssel und TOPs der Vorlage statt der Kostenart.
    await admin.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await expect(row(admin, MARCH)).toContainText("Ausstehende Prüfung");
    await expect(row(admin, MARCH)).toContainText("Gleiche Teile");
  });

  test("Vorlage löschen lässt die Kostenpositionen bestehen – alles steht im Audit-Log", async () => {
    await admin.goto("/wiederkehrend");
    for (const name of [TEMPLATE, ONLY_TOP3]) {
      await admin.getByRole("button", { name: `Vorlage ${name} löschen` }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(admin.getByRole("dialog")).toBeHidden();
      await expect(row(admin, name)).toHaveCount(0);
    }

    await admin.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    for (const name of [JANUARY, FEBRUARY, MARCH]) {
      await expect(row(admin, name)).toHaveCount(1);
      await admin.getByRole("button", { name: `${name} löschen` }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(row(admin, name)).toHaveCount(0);
    }

    await admin.goto(`/einstellungen/protokoll?q=${RUN}&bereich=recurring`);
    const log = admin.getByRole("table");
    await expect(log.getByText("Vorlage angelegt")).toHaveCount(2);
    await expect(log.getByText("Vorlage geändert")).toHaveCount(1);
    await expect(log.getByText("Vorlage gelöscht")).toHaveCount(2);
    await expect(log).toContainText(/Betrag: €\s120,00 → .*€\s130,00/);

    // Erzeugen und Einreichen stehen bei den Kosten – mit Herkunft und dem jeweiligen Benutzer.
    await admin.goto(`/einstellungen/protokoll?q=${encodeURIComponent(MARCH)}&bereich=cost`);
    const submitted = log.locator("tbody").getByRole("row").filter({ hasText: "Kosten eingereicht" });
    await expect(submitted).toContainText("top1");
    await expect(submitted).toContainText(`Aus der Vorlage „${TEMPLATE}“ erzeugt.`);
  });
});
