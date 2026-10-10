import { expect, test, type Locator, type Page } from "@playwright/test";

import { CURRENT_YEAR, login, openAdd, parseCents, pdfText, tileCents, tinyPdf } from "./helpers";

// Gutschriften und automatische Kostenart. Die OCR läuft gegen den Azure-Nachbau
// (e2e/mock-azure.mjs): OCR-GUTSCHRIFT liefert eine Gutschrift über € 60,00 des Rauchfangkehrers,
// OCR-UNKLAR eine Rechnung der „Muster Handels GmbH“, deren Inhalt zu keiner Kostenart passt.
const RUN = Date.now().toString(36);
const CREDIT = `E2E Testkosten Gutschrift ${RUN}`;
const CREDIT_FILE = `e2e-gutschrift-${RUN}.pdf`;
const UNCLEAR = `E2E Testkosten unklar ${RUN}`;
const UNCLEAR_FILE = `e2e-unklar-a-${RUN}.pdf`;
const LEARNED = `E2E Testkosten gelernt ${RUN}`;
const LEARNED_FILE = `e2e-unklar-b-${RUN}.pdf`;
const DOCUMENT = `e2e-gutschrift-dokument-${RUN}.pdf`;
const CREDIT_CENTS = 60_00;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const pdf = (name: string, marker: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: tinyPdf(`${marker} ${name}`),
});
/** Die im Auswahlfeld gewählte Option. */
const chosen = (select: Locator) => select.locator("option:checked");
const card = (page: Page, heading: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });

interface Figures {
  costs: number;
  credits: number;
  net: number;
  payments: number;
}

/** Kennzahlen des laufenden Jahres laut Dashboard. */
async function dashboardFigures(page: Page): Promise<Figures> {
  await page.goto(`/dashboard?jahr=${CURRENT_YEAR}`);
  return {
    costs: await tileCents(page, "Kosten"),
    credits: await tileCents(page, "Gutschriften"),
    net: await tileCents(page, "Nettokosten"),
    payments: await tileCents(page, "Einzahlungen gesamt"),
  };
}

test.describe.serial("Gutschriften und automatische Kostenart", () => {
  let page: Page;
  let before: Figures;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, "top2");
    before = await dashboardFigures(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("Dashboard führt Gutschriften als eigene Position – auch wenn es keine gibt", async () => {
    await page.goto(`/dashboard?jahr=${CURRENT_YEAR}`);
    expect(before.net).toBe(before.costs + before.credits);
    const tile = page.locator("div.rounded-xl").filter({ has: page.getByText("Gutschriften", { exact: true }) });
    await expect(tile.first()).toContainText(before.credits === 0 ? "Keine Gutschriften" : "Gutschrift");
  });

  test("Kostenformular: Gutschrift wird erkannt, der Betrag steht mit Minus, die Kostenart ist zugeordnet", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    await dialog.getByLabel("Beleg hochladen").setInputFiles(pdf(CREDIT_FILE, "OCR-GUTSCHRIFT"));

    const receipt = dialog.getByRole("status").filter({ hasText: CREDIT_FILE });
    await expect(receipt).toContainText("Als Gutschrift erkannt (Titel „Gutschrift“).");
    await expect(receipt).toContainText("Kostenart: Rauchfangkehrer.");

    // Der Dienst liefert positive Beträge – im Formular stehen sie als Gutschrift mit Minus.
    await expect(dialog.getByLabel("Betrag (€)")).toHaveValue("-60,00");
    await expect(dialog.getByLabel("Netto (€)")).toHaveValue("-50,00");
    await expect(dialog.getByLabel("MwSt. (€)")).toHaveValue("-10,00");
    await expect(dialog.getByText("Gutschrift: mindert die Nettokosten")).toBeVisible();
    await expect(dialog.getByLabel("Rechnungsnummer")).toHaveValue("GS-2026-0007");

    // Kostenart aus dem Beleg – samt Begründung, zum Prüfen vor dem Speichern.
    await expect(chosen(dialog.getByLabel("Kostenart"))).toHaveText("Rauchfangkehrer");
    await expect(dialog.getByText(/Automatisch zugeordnet – .* Bitte prüfen\./)).toBeVisible();

    await dialog.getByLabel("Beschreibung").fill(CREDIT);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    // In der Kostenliste ist die Position als Gutschrift markiert und steht getrennt in der Summe.
    const creditRow = row(page, CREDIT);
    await expect(creditRow).toContainText("Gutschrift");
    await expect(creditRow).toContainText("Rauchfangkehrer");
    await expect(creditRow).toContainText("-€ 60,00");
    const list = card(page, "Kostenpositionen");
    await expect(list).toContainText(/1 Gutschrift · -€\s60,00 · Nettokosten/);
    expect(parseCents((await row(page, "Gutschriften (1)").getByRole("cell").allTextContents())[1])).toBe(
      -CREDIT_CENTS,
    );
  });

  test("Beleg: Dokumenttyp Gutschrift, Kostenart und Erkennung sind gespeichert", async () => {
    await page.goto(`/dokumente?q=${RUN}`);
    const documentRow = row(page, CREDIT_FILE);
    await expect(documentRow).toContainText("Gutschrift");
    await expect(documentRow).toContainText("Verarbeitet");
    await expect(documentRow).toContainText("Kostenart: Rauchfangkehrer");
    await expect(documentRow).toContainText("netto -€ 50,00 · MwSt. -€ 10,00 · brutto -€ 60,00");
    await expect(documentRow).toContainText(CREDIT);

    await page.getByRole("button", { name: `${CREDIT_FILE} bearbeiten` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('select[name="type"]')).toHaveValue("credit_note");
    await expect(chosen(dialog.getByLabel("Kostenart"))).toHaveText("Rauchfangkehrer");
    // Was die OCR erkannt und vorgeschlagen hat, bleibt nachvollziehbar gespeichert.
    const recognized = dialog.getByRole("status").filter({ hasText: "Von OCR erkannt" });
    await expect(recognized).toContainText("Als Gutschrift erkannt (Titel „Gutschrift“).");
    await expect(recognized).toContainText("Rauchfangkehrer");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();

    // Der Dokumenttyp ist filterbar.
    await page.goto(`/dokumente?q=${RUN}&typ=credit_note`);
    await expect(row(page, CREDIT_FILE)).toBeVisible();
    await page.goto(`/dokumente?q=${RUN}&typ=invoice`);
    await expect(row(page, CREDIT_FILE)).toHaveCount(0);
  });

  test("Dashboard: Anzahl und Betrag getrennt – Kosten und Einzahlungen bleiben unverändert", async () => {
    const after = await dashboardFigures(page);
    expect(after.costs).toBe(before.costs);
    expect(after.payments).toBe(before.payments);
    expect(after.credits).toBe(before.credits - CREDIT_CENTS);
    expect(after.net).toBe(before.net - CREDIT_CENTS);
    expect(after.net).toBe(after.costs + after.credits);

    const tile = page.locator("div.rounded-xl").filter({ has: page.getByText("Gutschriften", { exact: true }) });
    await expect(tile.first()).toContainText(/\d+ Gutschrift(en)? – minder[tn] die Kosten/);
    await expect(page.getByText(/Kostenposition(en)? · \d+ Gutschrift/)).toBeVisible();

    // Je Kostenart steht die Gutschrift neben den Kosten, nicht darin.
    const category = card(page, "Kosten nach Kostenart").getByRole("listitem").filter({ hasText: "Rauchfangkehrer" });
    await expect(category).toContainText("1 Gutschrift");
    await expect(category).toContainText("-€ 60,00");

    const activity = card(page, "Letzte Aktivitäten").getByRole("listitem").filter({ hasText: CREDIT });
    await expect(activity).toContainText("Gutschrift erfasst");

    // Der Kostenverlauf nennt die Gutschriften eigens; die Tabelle endet bei den Nettokosten.
    const trend = card(page, "Kostenverlauf");
    await expect(trend).toContainText(/Gutschriften -€\s[\d.]+,\d{2}, Nettokosten/);
    await trend.getByText("Werte als Tabelle").click();
    await expect(trend.getByRole("columnheader", { name: "Gutschriften" })).toBeVisible();
    const sums = await trend.locator("tbody tr td:last-child").allTextContents();
    expect(sums.map(parseCents).reduce((a, b) => a + b, 0)).toBe(after.net);
  });

  test("Abrechnung, Monats- und Jahresübersicht weisen die Gutschrift getrennt aus", async () => {
    // Abrechnung: Kacheln und Fußzeile der Kostenverteilung.
    await page.goto(`/abrechnung/${CURRENT_YEAR}`);
    const costs = await tileCents(page, "Kosten");
    const credits = await tileCents(page, "Gutschriften");
    expect(await tileCents(page, "Nettokosten")).toBe(costs + credits);
    expect(credits).toBeLessThanOrEqual(-CREDIT_CENTS);

    // Summenzeilen der Kostenverteilung, gefunden über ihre Zeilenüberschrift.
    const cells = async (name: string | RegExp) =>
      (
        await page
          .getByRole("row")
          .filter({ has: page.getByRole("rowheader", { name, exact: true }) })
          .getByRole("cell")
          .allTextContents()
      ).map(parseCents);
    const [costTotal, , ...costShares] = await cells("Kosten");
    const [creditTotal, , ...creditShares] = await cells(/^Gutschriften/);
    const [netTotal, , ...netShares] = await cells("Nettokosten");
    expect(costShares).toHaveLength(3);
    expect(costTotal).toBe(costs);
    expect(creditTotal).toBe(credits);
    expect(netTotal).toBe(costTotal + creditTotal);
    // Die Gutschrift geht ohne Rundungsdifferenz auf die TOPs auf – je TOP: Kosten + Gutschrift = netto.
    expect(creditShares.reduce((a, b) => a + b, 0)).toBe(creditTotal);
    expect(netShares).toEqual(costShares.map((share, index) => share + creditShares[index]));
    // Die Position selbst ist in der Verteilung als Gutschrift markiert.
    await expect(row(page, CREDIT).first()).toContainText("Gutschrift");

    // Monatsübersicht: eigene Spalte, die Gutschrift steht im April (Belegdatum 02.04.).
    await page.goto(`/abrechnung/${CURRENT_YEAR}/monate`);
    await expect(page.getByRole("columnheader", { name: "Gutschriften" })).toBeVisible();
    const april = (await row(page, "April").getByRole("cell").allTextContents()).map(parseCents);
    expect(april[1]).toBeLessThanOrEqual(-CREDIT_CENTS);
    const [yearCosts, yearCredits] = (
      await row(page, `Jahr ${CURRENT_YEAR}`).getByRole("cell").allTextContents()
    ).map(parseCents);
    expect(yearCosts).toBe(costs);
    expect(yearCredits).toBe(credits);

    // Jahresübersicht: Kosten, Gutschriften (mit Anzahl) und Nettokosten nebeneinander.
    await page.goto("/abrechnung");
    for (const header of ["Kosten", "Gutschriften", "Nettokosten"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    await expect(row(page, String(CURRENT_YEAR))).toContainText(/-€\s[\d.]+,\d{2}\s*\(\d+\)/);
  });

  test("Jahresabrechnung als PDF führt Gutschriften in einem eigenen Abschnitt", async () => {
    const text = pdfText(await (await page.request.get(`/api/abrechnung/${CURRENT_YEAR}/pdf`)).body());
    for (const expected of [/Gutschriften \(\d+\)/, /Summe Kosten/, /Summe Gutschriften/, /Nettokosten/]) {
      expect(text).toMatch(expected);
    }
    expect(text).toContain(CREDIT);
    // Die Gutschrift steht nach der Kostenaufstellung, nicht zwischen den Kosten.
    expect(text.indexOf(CREDIT)).toBeGreaterThan(text.indexOf("Summe Kosten"));
  });

  test("Kontobewegungen bleiben unberührt: die Gutschrift ist keine Ein- oder Auszahlung", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}`);
    await expect(page.getByText(CREDIT)).toHaveCount(0);
    await page.goto("/einzahlungen/konto");
    await expect(page.getByText(CREDIT)).toHaveCount(0);
  });

  test("unsichere Kostenart: die Auswahl bleibt offen und muss von Hand gewählt werden", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    await dialog.getByLabel("Beleg hochladen").setInputFiles(pdf(UNCLEAR_FILE, "OCR-UNKLAR"));

    await expect(dialog.getByRole("status").filter({ hasText: UNCLEAR_FILE })).toContainText(
      "Kostenart offen – bitte wählen.",
    );
    // Eine gewöhnliche Rechnung: keine Gutschrift, positiver Betrag.
    await expect(dialog.getByLabel("Betrag (€)")).toHaveValue("120,00");
    await expect(dialog.getByLabel("Rechnungssteller")).toHaveValue("Muster Handels GmbH");
    const category = dialog.getByLabel("Kostenart");
    await expect(category).toHaveValue("");
    await expect(chosen(category)).toHaveText("Bitte wählen …");
    await expect(dialog.getByText("Keine passende Kostenart erkannt. Bitte die Kostenart wählen.")).toBeVisible();

    // Ohne Kostenart wird nicht gespeichert.
    await dialog.getByLabel("Beschreibung").fill(UNCLEAR);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "Bitte eine Kostenart wählen." })).toBeVisible();

    await category.selectOption({ label: "Verwaltung" });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, UNCLEAR)).toContainText("Verwaltung · Muster Handels GmbH");

    // Am Beleg steht die von Hand gewählte Kostenart; die OCR hatte keine vorgeschlagen.
    await page.goto(`/dokumente?q=${RUN}`);
    await expect(row(page, UNCLEAR_FILE)).toContainText("Kostenart: Verwaltung");
    await expect(row(page, UNCLEAR_FILE)).toContainText("Rechnung");
  });

  test("bisherige Zuordnung: der nächste Beleg desselben Rechnungsstellers wird automatisch zugeordnet", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    const dialog = await openAdd(page, "Kostenposition hinzufügen");
    await dialog.getByLabel("Beleg hochladen").setInputFiles(pdf(LEARNED_FILE, "OCR-UNKLAR"));

    await expect(dialog.getByRole("status").filter({ hasText: LEARNED_FILE })).toContainText(
      "Kostenart: Verwaltung.",
    );
    await expect(chosen(dialog.getByLabel("Kostenart"))).toHaveText("Verwaltung");
    await expect(
      dialog.getByText("Automatisch zugeordnet – Rechnungssteller bisher 1× dieser Kostenart zugeordnet. Bitte prüfen."),
    ).toBeVisible();

    // Die Zuordnung bleibt ein Vorschlag: von Hand geändert, gilt die eigene Wahl.
    await dialog.getByLabel("Kostenart").selectOption({ label: "Sonstiges" });
    await expect(dialog.getByText(/Automatisch zugeordnet/)).toHaveCount(0);
    await dialog.getByLabel("Beschreibung").fill(LEARNED);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, LEARNED)).toContainText("Sonstiges · Muster Handels GmbH");
  });

  test("Dokument-Upload: Gutschrift und Kostenart stehen im Prüfschritt und lassen sich korrigieren", async () => {
    await page.goto(`/dokumente?q=${RUN}`);
    const dialog = await openAdd(page, "Dokument hochladen");
    await dialog.locator('select[name="periodId"]').selectOption({ label: String(CURRENT_YEAR) });
    // Die Kostenart darf beim Upload offen bleiben – die OCR ordnet sie zu.
    await expect(chosen(dialog.getByLabel("Kostenart"))).toHaveText("Offen – noch nicht zugeordnet");
    await dialog.locator('input[name="file"]').setInputFiles(pdf(DOCUMENT, "OCR-GUTSCHRIFT"));
    await dialog.getByRole("button", { name: "Hochladen und auslesen" }).click();

    await expect(dialog.getByRole("heading", { name: "Erkannte Daten prüfen" })).toBeVisible();
    const summary = dialog.getByRole("status").filter({ hasText: "Dokumenttyp: Gutschrift · Kostenart: Rauchfangkehrer" });
    await expect(summary).toContainText("Als Gutschrift erkannt (Titel „Gutschrift“).");
    await expect(summary).toContainText("Kostenart automatisch zugeordnet: Rauchfangkehrer");
    await expect(dialog.locator('select[name="type"]')).toHaveValue("credit_note");
    await expect(chosen(dialog.getByLabel("Kostenart"))).toHaveText("Rauchfangkehrer");
    await expect(dialog.getByLabel("Brutto (€)")).toHaveValue("-60,00");

    // Von Hand korrigieren – die eigene Wahl wird gespeichert.
    await dialog.getByLabel("Kostenart").selectOption({ label: "Wartung / Instandhaltung" });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("heading", { name: "Dokument hochladen" })).toBeVisible();
    await dialog.getByRole("button", { name: "Fertig" }).click();
    await expect(dialog).toBeHidden();

    const documentRow = row(page, DOCUMENT);
    await expect(documentRow).toContainText("Gutschrift");
    await expect(documentRow).toContainText("Kostenart: Wartung / Instandhaltung");

    // Erneutes Auslesen überschreibt die Korrektur nicht.
    await page.getByRole("button", { name: `${DOCUMENT} erneut per OCR auslesen` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Auslesen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(documentRow).toContainText("Kostenart: Wartung / Instandhaltung");
    await expect(documentRow).toContainText("brutto -€ 60,00");
  });

  test("Audit-Log hält Erkennung und Zuordnung fest", async () => {
    await page.goto(`/einstellungen/protokoll?q=${CREDIT_FILE}&bereich=document`);
    const ocr = page.getByRole("table").locator("tbody").getByRole("row").filter({ hasText: "Dokument per OCR ausgelesen" });
    await expect(ocr).toContainText("Als Gutschrift erkannt (Titel „Gutschrift“).");
    await expect(ocr).toContainText("Kostenart automatisch zugeordnet: Rauchfangkehrer");
    await expect(ocr).toContainText(/Dokumenttyp: Rechnung → .*Gutschrift/);
    await expect(ocr).toContainText(/Kostenart: leer → .*Rauchfangkehrer/);

    // Die Kostenposition ist als Gutschrift protokolliert.
    await page.goto(`/einstellungen/protokoll?q=${RUN}&bereich=cost`);
    const created = page.getByRole("table").locator("tbody").getByRole("row").filter({ hasText: CREDIT });
    await expect(created).toContainText("Kostenposition angelegt");
    await created.locator("summary").click();
    await expect(created).toContainText("Art der Position: Gutschrift");
  });

  test("USER: eigene Sicht mit eigener Position für Gutschriften – nichts aus dem Entwurfsjahr", async ({ browser }) => {
    const user = await browser.newPage();
    await login(user, "top1");
    await expect(user.getByText("Gutschriften (mein Anteil)", { exact: true })).toBeVisible();
    await expect(user.getByText("Mein Kostenanteil", { exact: true }).first()).toBeVisible();
    // Das laufende Jahr ist ein Entwurf – weder die Gutschrift noch ihr Beleg sind sichtbar.
    await expect(user.getByText(CREDIT)).toHaveCount(0);
    await user.goto(`/dokumente?q=${RUN}`);
    await expect(user.getByText(CREDIT_FILE)).toHaveCount(0);
    await user.close();
  });

  test("Testdaten wieder löschen – danach stimmen die Kennzahlen wie zuvor", async () => {
    await page.goto(`/dokumente?q=${RUN}`);
    for (const name of [CREDIT_FILE, UNCLEAR_FILE, LEARNED_FILE, DOCUMENT]) {
      await page.getByRole("button", { name: `${name} löschen` }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(row(page, name)).toHaveCount(0);
    }

    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    for (const cost of [CREDIT, UNCLEAR, LEARNED]) {
      await page.getByRole("button", { name: `${cost} löschen` }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(row(page, cost)).toHaveCount(0);
    }

    expect(await dashboardFigures(page)).toEqual(before);
  });
});
