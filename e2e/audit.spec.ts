import { expect, test, type Page } from "@playwright/test";

import { createPool } from "../src/db/connection";
import { getDirectDatabaseUrl, loadEnv } from "../src/db/load-env";
import { CURRENT_YEAR, login, openAdd, passwordOf } from "./helpers";

const RUN = Date.now().toString(36);
const COST = `E2E Testkosten Audit ${RUN}`;
const LOG = "/einstellungen/protokoll";

/** Zeilen des Protokolls – ohne Kopfzeile, neueste zuerst. */
const entries = (page: Page) => page.getByRole("table").locator("tbody").getByRole("row");

test.describe.serial("Audit-Log", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, "top2");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("ADMIN erreicht das Audit-Log über die Einstellungen – die Anmeldung steht darin", async () => {
    await page.goto("/einstellungen");
    await page.getByRole("link", { name: "Audit-Log" }).click();
    await expect(page).toHaveURL(new RegExp(`${LOG}$`));
    await expect(page.getByRole("heading", { name: "Audit-Log" })).toBeVisible();

    // Die Anmeldung dieses Tests ist der jüngste Eintrag: Zeitpunkt, Benutzer/TOP, Aktion, Datensatz.
    const newest = entries(page).first();
    await expect(newest).toContainText("Anmeldung");
    await expect(newest).toContainText("top2");
    await expect(newest).toContainText("TOP 2");
    await expect(newest).toContainText("Benutzer top2");
    await expect(newest).toContainText(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);
    // Nur lesen: keine Schaltfläche zum Bearbeiten oder Löschen.
    await expect(page.getByRole("main").getByRole("button", { name: /löschen|bearbeiten/i })).toHaveCount(0);
  });

  test("Kosten anlegen, ändern und löschen – mit vorherigem und neuem Wert", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    let dialog = await openAdd(page, "Kostenposition hinzufügen");
    await dialog.getByLabel("Beschreibung").fill(COST);
    await dialog.getByLabel("Betrag (€)").fill("10,00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: `${COST} bearbeiten` }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Betrag (€)").fill("12,50");
    await dialog.getByLabel("Rechnungssteller").fill("Audit GmbH");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: `${COST} löschen` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // Suche und Bereichsfilter liegen in der URL.
    await page.goto(`${LOG}?q=${RUN}&bereich=cost`);
    await expect(page.getByText("3 Einträge in dieser Auswahl")).toBeVisible();
    const [deleted, updated, created] = [entries(page).nth(0), entries(page).nth(1), entries(page).nth(2)];

    await expect(created).toContainText("Kostenposition angelegt");
    await expect(created).toContainText(`${COST} · € 10,00 · ${CURRENT_YEAR}`);
    // Die Werte des neuen Datensatzes sind eingeklappt.
    await created.locator("summary").click();
    await expect(created).toContainText("Betrag: € 10,00");
    await expect(created).toContainText(`Abrechnungsjahr: ${CURRENT_YEAR}`);

    await expect(updated).toContainText("Kostenposition geändert");
    // Intl setzt zwischen € und Betrag ein geschütztes Leerzeichen; der Pfeil heißt für Screenreader „geändert zu“.
    await expect(updated).toContainText(/Betrag: €\s10,00 → .*€\s12,50/);
    await expect(updated).toContainText(/Rechnungssteller: leer → .*Audit GmbH/);
    // Unverändertes steht nicht in der Liste.
    await expect(updated).not.toContainText("Beschreibung:");

    await expect(deleted).toContainText("Kostenposition gelöscht");
    await expect(deleted).toContainText(`${COST} · € 12,50 · ${CURRENT_YEAR}`);
    for (const row of [created, updated, deleted]) await expect(row).toContainText("top2");
  });

  test("fehlgeschlagene Anmeldung, Anmeldung und Abmeldung eines Benutzers", async ({ browser }) => {
    const other = await browser.newPage();
    await other.goto("/login");
    await other.getByLabel("Benutzername").fill("top3");
    await other.getByLabel("Passwort", { exact: true }).fill("definitiv-falsch");
    await other.getByRole("button", { name: "Anmelden" }).click();
    await expect(other.getByRole("alert").filter({ hasText: "ist falsch" })).toBeVisible();
    await other.getByLabel("Passwort", { exact: true }).fill(passwordOf("top3"));
    await other.getByRole("button", { name: "Anmelden" }).click();
    await expect(other).toHaveURL(/\/dashboard/);
    await other.getByRole("button", { name: "Logout" }).click();
    await expect(other).toHaveURL(/\/login/);
    await other.close();

    await page.goto(`${LOG}?q=top3&bereich=auth`);
    await expect(entries(page).nth(0)).toContainText("Abmeldung");
    await expect(entries(page).nth(1)).toContainText("Anmeldung");
    await expect(entries(page).nth(2)).toContainText("Anmeldung fehlgeschlagen");
    await expect(entries(page).nth(2)).toContainText("Falsches Passwort");
    for (const index of [0, 1, 2]) await expect(entries(page).nth(index)).toContainText("TOP 3");

    // Der Benutzerfilter zeigt nur Einträge dieses Benutzers.
    await page.goto(LOG);
    await page.getByLabel("Benutzer", { exact: true }).selectOption({ label: "top3" });
    await expect(page).toHaveURL(/benutzer=\d+/);
    await expect(entries(page).first()).toContainText("top3");
    await expect(entries(page).filter({ hasText: "top2" })).toHaveCount(0);
  });

  test("USER sehen das Audit-Log nicht", async ({ browser }) => {
    const user = await browser.newPage();
    await login(user, "top1");
    await user.goto("/einstellungen");
    await expect(user.getByRole("link", { name: "Audit-Log" })).toHaveCount(0);
    await user.goto(LOG);
    await expect(user.getByText("Kein Zugriff")).toBeVisible();
    await expect(user.getByRole("table")).toHaveCount(0);
    await user.close();
  });

  test("Einträge lassen sich auch an der Anwendung vorbei weder ändern noch löschen", async () => {
    loadEnv();
    const pool = createPool(getDirectDatabaseUrl(), 1);
    try {
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM audit_log");
      for (const statement of [
        "UPDATE audit_log SET summary = 'manipuliert'",
        "DELETE FROM audit_log",
        "TRUNCATE audit_log",
      ]) {
        await expect(pool.query(statement), statement).rejects.toThrow(/unveränderlich/);
      }
      const after = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE summary <> 'manipuliert'");
      expect(after.rows[0].n).toBe(rows[0].n);
    } finally {
      await pool.end();
    }
  });
});
