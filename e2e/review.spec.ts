import { expect, test, type Page } from "@playwright/test";

import { CURRENT_YEAR, RELEASED_YEAR, expectAbove, login, openAdd, parseCents, tinyPdf } from "./helpers";

// Prüf-Workflow: TOP 1 reicht ein, TOP 2 (ADMIN) prüft. Offiziell zählt nur Freigegebenes.
const RUN = Date.now().toString(36);
const COST = `E2E Testkosten eingereicht ${RUN}`;
const COST_FILE = `e2e-eingereicht-rechnung-${RUN}.pdf`;
const PURPOSE = `E2E Einzahlung eingereicht ${RUN}`;
const PROOF = `e2e-eingereicht-nachweis-${RUN}.pdf`;
const DOCUMENT = `e2e-eingereicht-dokument-${RUN}.pdf`;
const PROPOSED_YEAR = CURRENT_YEAR + 2;

// .first(): eine eingereichte Position taucht auch als Verknüpfung in der Dokumentenliste auf.
const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text }).first();
const rows = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: tinyPdf(name) });

/** Gesamtkosten des laufenden Jahres laut Abrechnung der Verwaltung. */
async function officialCosts(admin: Page): Promise<number> {
  await admin.goto(`/abrechnung/${CURRENT_YEAR}`);
  const cells = await row(admin, "Kosten gesamt").getByRole("cell").allTextContents();
  return parseCents(cells[0]);
}

test.describe.serial("Prüfung von USER-Eingaben", () => {
  let admin: Page;
  let user: Page;
  let costsBefore: number;

  test.beforeAll(async ({ browser }) => {
    admin = await browser.newPage();
    await login(admin, "top2");
    user = await browser.newPage();
    await login(user, "top1");
    costsBefore = await officialCosts(admin);
  });

  test.afterAll(async () => {
    await admin.close();
    await user.close();
  });

  test("Navigation: USER sieht „Meine Eingaben“, ADMIN „Prüfung“", async () => {
    await user.goto("/dashboard");
    const userNav = user.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(userNav.getByRole("link", { name: "Meine Eingaben" })).toBeVisible();
    await expect(userNav.getByRole("link", { name: /Prüfung/ })).toHaveCount(0);

    await admin.goto("/dashboard");
    const adminNav = admin.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(adminNav.getByRole("link", { name: /Prüfung/ })).toBeVisible();
    await expect(adminNav.getByRole("link", { name: "Meine Eingaben" })).toHaveCount(0);

    // Die Prüfliste ist der Verwaltung vorbehalten.
    await user.goto("/pruefung");
    await expect(user.getByText("Kein Zugriff")).toBeVisible();
  });

  test("USER reicht Kosten mit Beleg ein – Status „Ausstehende Prüfung“", async () => {
    await user.goto("/eingaben");
    const dialog = await openAdd(user, "Kosten einreichen");
    // Umlageschlüssel und TOP-Zuordnung sind Sache der Verwaltung.
    await expect(dialog.locator('select[name="allocationKeyId"]')).toHaveCount(0);
    await expect(dialog.locator('input[name="unitIds"]')).toHaveCount(0);
    // Auch beim Einreichen steht der Beleg-Upload ganz oben, vor den Eingabefeldern.
    await expectAbove(dialog.getByLabel("Beleg hochladen"), dialog.getByLabel("Kostenart"));
    await dialog.getByLabel("Kostenart").selectOption({ label: "Rauchfangkehrer" });
    await dialog.getByLabel("Beschreibung").fill(COST);
    await dialog.getByLabel("Betrag (€)").fill("120,00");
    await dialog.locator('input[name="file"]').setInputFiles(pdf(COST_FILE));
    await dialog.getByRole("button", { name: "Einreichen" }).click();
    await expect(dialog).toBeHidden();

    const costRow = row(user, COST);
    await expect(costRow).toContainText("Ausstehende Prüfung");
    await expect(costRow).toContainText("€ 120,00");
    await expect(costRow.getByRole("button", { name: COST_FILE })).toBeVisible();
  });

  test("USER reicht Einzahlung, Dokument und Abrechnungsjahr ein", async () => {
    let dialog = await openAdd(user, "Einzahlung einreichen");
    await expect(dialog.getByText("Für TOP 1.")).toBeVisible();
    await dialog.getByLabel("Betrag (€)").fill("77,77");
    await dialog.getByLabel("Beschreibung / Verwendungszweck").fill(PURPOSE);
    await dialog.locator('input[name="file"]').setInputFiles(pdf(PROOF));
    await dialog.getByRole("button", { name: "Einreichen" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(user, PURPOSE)).toContainText("Ausstehende Prüfung");

    dialog = await openAdd(user, "Dokument einreichen");
    await dialog.locator('input[name="file"]').setInputFiles(pdf(DOCUMENT));
    await dialog.getByLabel("Dokumenttyp").selectOption({ label: "Vertrag" });
    // Verknüpfen lässt sich nur mit eigenen Kostenpositionen.
    await dialog.getByRole("checkbox", { name: new RegExp(COST) }).check();
    await expect(dialog.getByRole("checkbox")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Hochladen" }).click();
    const log = dialog.getByRole("status").filter({ hasText: "1 Dokument eingereicht" });
    await expect(log).toContainText("wartet auf Prüfung");
    await dialog.getByRole("button", { name: "Fertig" }).click();
    await expect(row(user, DOCUMENT)).toContainText("Ausstehende Prüfung");

    dialog = await openAdd(user, "Abrechnungsjahr vorschlagen");
    await dialog.getByLabel("Jahr").fill(String(PROPOSED_YEAR));
    await dialog.getByRole("button", { name: "Einreichen" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(user, String(PROPOSED_YEAR))).toContainText("Ausstehende Prüfung");

    // Löschen können USER nichts.
    await expect(user.getByRole("button", { name: /löschen/ })).toHaveCount(0);
  });

  test("Eingereichtes zählt nicht offiziell und ist für andere TOPs unsichtbar", async ({ browser }) => {
    expect(await officialCosts(admin)).toBe(costsBefore);

    // Die Verwaltung sieht die Position markiert, aber nicht in der Summe.
    await admin.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await expect(row(admin, COST)).toContainText("Ausstehende Prüfung");
    await expect(admin.getByText(/eingereicht, nicht freigegeben/)).toBeVisible();

    // Das vorgeschlagene Jahr gibt es für andere Benutzer nicht.
    const other = await browser.newPage();
    await login(other, "top3");
    await other.goto("/eingaben");
    await expect(other.getByText(COST)).toHaveCount(0);
    await expect(other.getByText(PURPOSE)).toHaveCount(0);
    await other.goto(`/dokumente?q=${RUN}`);
    await expect(other.getByText("Keine Treffer")).toBeVisible();
    await other.close();

    // Dashboards weisen auf die offene Prüfung hin.
    await admin.goto(`/dashboard?jahr=${CURRENT_YEAR}`);
    await expect(admin.getByRole("link", { name: /warte(t|n) auf Prüfung/ })).toBeVisible();
    await user.goto("/dashboard");
    await expect(user.getByRole("link", { name: /Eigene Eingaben? warte(t|n) auf Prüfung/ })).toBeVisible();
  });

  test("ADMIN gibt die Kosten frei – erst jetzt zählen sie", async () => {
    await admin.goto("/pruefung");
    await expect(admin.getByRole("heading", { name: /Ausstehend – \d+ Einträge?/ })).toBeVisible();
    for (const text of [COST, PURPOSE, DOCUMENT, `Abrechnungsjahr ${PROPOSED_YEAR}`]) {
      await expect(row(admin, text)).toBeVisible();
    }
    // Der Beleg lässt sich direkt bei der Prüfung ansehen.
    await expect(row(admin, COST).getByRole("button", { name: COST_FILE })).toBeVisible();

    await admin.getByRole("button", { name: `${COST} freigeben` }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Kommentar").fill("Passt, danke.");
    await dialog.getByRole("button", { name: "Freigeben" }).click();
    await expect(dialog).toBeHidden();
    // Die Belege der Position – angehängt oder nachträglich verknüpft – werden mit freigegeben.
    await expect(rows(admin, COST)).toHaveCount(0);
    await expect(rows(admin, COST_FILE)).toHaveCount(0);
    await expect(rows(admin, DOCUMENT)).toHaveCount(0);

    // In der Liste „Freigegeben“ mit Prüfdatum und Kommentar.
    await admin.getByRole("link", { name: "Freigegeben" }).click();
    await expect(row(admin, COST)).toContainText("Passt, danke.");
    await expect(row(admin, COST)).toContainText("geprüft am");

    expect(await officialCosts(admin)).toBe(costsBefore + 120_00);
    await user.goto("/eingaben");
    await expect(row(user, COST)).toContainText("Freigegeben");
    await expect(row(user, COST)).toContainText("Passt, danke.");
  });

  test("ADMIN lehnt die Einzahlung ab – der Kommentar erreicht den USER", async () => {
    await admin.goto("/pruefung");
    await admin.getByRole("button", { name: /Einzahlung TOP 1 ablehnen/ }).first().click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Kommentar").fill("Betrag stimmt nicht mit dem Kontoauszug überein.");
    await dialog.getByRole("button", { name: "Ablehnen" }).click();
    await expect(dialog).toBeHidden();

    await admin.getByRole("link", { name: "Abgelehnt" }).click();
    await expect(row(admin, PURPOSE)).toContainText("Betrag stimmt nicht");

    await user.goto("/eingaben");
    await expect(row(user, PURPOSE)).toContainText("Abgelehnt");
    await expect(row(user, PURPOSE)).toContainText("Betrag stimmt nicht mit dem Kontoauszug überein.");
    await user.goto("/dashboard");
    await expect(user.getByRole("link", { name: /Eigene Eingaben? wurden? abgelehnt/ })).toBeVisible();
  });

  test("Änderung eines freigegebenen Eintrags muss erneut geprüft werden", async () => {
    await user.goto("/eingaben");
    await user.getByRole("button", { name: `${COST} bearbeiten` }).click();
    const dialog = user.getByRole("dialog");
    await dialog.getByLabel("Betrag (€)").fill("150,00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(user, COST)).toContainText("Ausstehende Prüfung");
    await expect(row(user, COST)).toContainText("€ 150,00");

    // Bis zur erneuten Freigabe zählt der Eintrag nicht mehr.
    expect(await officialCosts(admin)).toBe(costsBefore);

    await admin.goto("/pruefung");
    await admin.getByRole("button", { name: `${COST} freigeben` }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Freigeben" }).click();
    await expect(admin.getByRole("dialog")).toBeHidden();
    expect(await officialCosts(admin)).toBe(costsBefore + 150_00);
  });

  test("ADMIN kann eingereichte Kosten bearbeiten: Umlageschlüssel und TOPs festlegen", async () => {
    await admin.goto("/pruefung?status=freigegeben");
    await row(admin, COST).getByRole("link", { name: `${COST} bearbeiten` }).click();
    await expect(admin).toHaveURL(new RegExp(`/abrechnung/${CURRENT_YEAR}/kosten\\?position=\\d+`));
    await admin.getByRole("button", { name: `${COST} bearbeiten` }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("TOP 2").uncheck();
    await dialog.getByLabel("TOP 3").uncheck();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(admin, COST)).toContainText("TOP 1");
    // Die Bearbeitung durch die Verwaltung ändert den Prüfstand nicht.
    await expect(row(admin, COST)).not.toContainText("Ausstehende Prüfung");
  });

  test("Dokument einzeln freigeben, Jahr ablehnen", async () => {
    // Der Nachweis der abgelehnten Einzahlung wartet weiter – eine Ablehnung nimmt Belege nicht mit.
    await admin.goto("/pruefung");
    await admin.getByRole("button", { name: `${PROOF} freigeben` }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Freigeben" }).click();
    await expect(admin.getByRole("dialog")).toBeHidden();
    await expect(rows(admin, PROOF)).toHaveCount(0);

    await admin.getByRole("button", { name: `Abrechnungsjahr ${PROPOSED_YEAR} ablehnen` }).click();
    await admin.getByRole("dialog").getByLabel("Kommentar").fill("Noch zu früh.");
    await admin.getByRole("dialog").getByRole("button", { name: "Ablehnen" }).click();
    await expect(admin.getByRole("dialog")).toBeHidden();

    await user.goto("/eingaben");
    const ownDocuments = user.getByRole("table", { name: "Eingereichte Dokumente" });
    for (const name of [DOCUMENT, COST_FILE, PROOF]) {
      await expect(ownDocuments.getByRole("row").filter({ hasText: name })).toContainText("Freigegeben");
    }
    await expect(row(user, String(PROPOSED_YEAR))).toContainText("Abgelehnt");
    await expect(row(user, String(PROPOSED_YEAR))).toContainText("Noch zu früh.");
  });

  test("nur der ADMIN löscht – Aufräumen über Prüfliste und Listen", async () => {
    await admin.goto("/pruefung?status=abgelehnt");
    await row(admin, PURPOSE).getByRole("button", { name: /löschen/ }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(rows(admin, PURPOSE)).toHaveCount(0);

    await admin.goto(`/dokumente?q=${RUN}`);
    for (const name of [DOCUMENT, COST_FILE, PROOF]) {
      await admin.getByRole("button", { name: `${name} löschen` }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(rows(admin, name)).toHaveCount(0);
    }

    await admin.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await admin.getByRole("button", { name: `${COST} löschen` }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(rows(admin, COST)).toHaveCount(0);
    expect(await officialCosts(admin)).toBe(costsBefore);

    // Das abgelehnte Jahr sieht nur die Verwaltung – und nur sie kann es löschen.
    await admin.goto(`/abrechnung/${PROPOSED_YEAR}`);
    await admin.getByRole("button", { name: `Abrechnungsjahr ${PROPOSED_YEAR} löschen` }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(admin).toHaveURL(/\/abrechnung$/);

    await user.goto("/eingaben");
    for (const text of [COST, PURPOSE, DOCUMENT]) await expect(user.getByText(text)).toHaveCount(0);
  });
});

test.describe("Dashboard – Kostenverlauf", () => {
  test("ADMIN: gestapelt nach TOP, Zeitraum wählbar, Werte stimmen mit der Abrechnung überein", async ({
    page,
  }) => {
    await login(page, "top2");
    await page.goto(`/dashboard?jahr=${RELEASED_YEAR}`);
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Kostenverlauf" }) });
    await expect(card.getByText(`Kosten je Monat im Abrechnungsjahr ${RELEASED_YEAR}`)).toBeVisible();
    // Achsen und Legende
    await expect(card.getByText("Kosten (€)")).toBeVisible();
    await expect(card.getByRole("img").getByText("Monat", { exact: true })).toBeVisible();
    for (const top of ["TOP 1", "TOP 2", "TOP 3"]) {
      await expect(card.locator("figcaption").getByText(top)).toBeVisible();
    }

    // Die Tabelle zum Diagramm summiert auf die Gesamtkosten des Jahres.
    const total = parseCents(
      await page.locator("div").filter({ hasText: /^Gesamtkosten/ }).first().locator("p").first().innerText(),
    );
    await card.getByText("Werte als Tabelle").click();
    const sums = await card.locator("tbody tr td:last-child").allTextContents();
    expect(sums.map(parseCents).reduce((a, b) => a + b, 0)).toBe(total);

    // Zeitraum: alle Jahre
    await card.getByLabel("Zeitraum des Kostenverlaufs").selectOption({ label: "Alle Jahre" });
    await expect(page).toHaveURL(/verlauf=jahre/);
    await expect(card.getByText("Kosten je Abrechnungsjahr")).toBeVisible();
    await expect(card.getByRole("img").getByText("Abrechnungsjahr", { exact: true })).toBeVisible();
    // Die Tabelle bleibt beim Wechsel des Zeitraums aufgeklappt.
    await expect(card.getByRole("rowheader", { name: `Abrechnungsjahr ${RELEASED_YEAR}` })).toBeVisible();
    await expect(card.getByRole("rowheader", { name: `Abrechnungsjahr ${CURRENT_YEAR}` })).toBeVisible();
  });

  test("USER: nur der eigene Anteil in freigegebenen Jahren", async ({ page }) => {
    await login(page, "top1");
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Kostenverlauf" }) });
    await expect(card.locator("figcaption").getByText("Mein Kostenanteil")).toBeVisible();
    await expect(card.getByText(/TOP [23]/)).toHaveCount(0);

    // Nur freigegebene Jahre stehen zur Auswahl – auch im Jahresvergleich.
    const options = await card.getByLabel("Zeitraum des Kostenverlaufs").locator("option").allTextContents();
    expect(options).toEqual([`Monate ${RELEASED_YEAR}`, "Alle Jahre"]);
    await page.goto(`/dashboard?verlauf=${CURRENT_YEAR}`);
    await expect(card.getByText(`Abrechnungsjahr ${RELEASED_YEAR}`)).toBeVisible();
    await page.goto("/dashboard?verlauf=jahre");
    await card.getByText("Werte als Tabelle").click();
    await expect(card.getByRole("rowheader")).toHaveCount(1);

    // Der eigene Anteil im Diagramm entspricht dem Kostenanteil der Abrechnung.
    const share = parseCents(
      await page.locator("div").filter({ hasText: /^Mein Kostenanteil/ }).first().locator("p").first().innerText(),
    );
    expect(parseCents(await card.locator("tbody tr td").first().innerText())).toBe(share);
  });
});
