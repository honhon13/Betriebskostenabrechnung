import { expect, test, type Page } from "@playwright/test";

import { CURRENT_YEAR, RELEASED_YEAR, login, parseCents, tinyPdf } from "./helpers";

// Eindeutige Namen je Lauf, damit sich die Tests selbst wieder aufräumen können.
const RUN = Date.now().toString(36);
const COST = `E2E Testkosten ${RUN}`;
const INVOICE = `e2e-rechnung-${RUN}.pdf`;
const FILE = `e2e-vertrag-${RUN}.pdf`;
const PROOF = `e2e-nachweis-${RUN}.pdf`;
const PURPOSE = `E2E Einzahlung ${RUN}`;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: tinyPdf(name) });

/** ID eines Dokuments aus dem Download-Link seiner Tabellenzeile. */
async function documentId(page: Page, fileName: string): Promise<string> {
  const href = await row(page, fileName)
    .getByRole("link", { name: `${fileName} herunterladen` })
    .getAttribute("href");
  return /\/api\/dokumente\/(\d+)\//.exec(href ?? "")![1];
}

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
    await expect(page.getByText("Gesamtkosten")).toBeVisible();
    await expect(page.getByText("Einzahlungen gesamt")).toBeVisible();
    await expect(page.getByText(`Abrechnungsjahr ${RELEASED_YEAR}`).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Abrechnung je TOP" })).toBeVisible();
    for (const top of ["TOP 1", "TOP 2", "TOP 3"]) {
      await expect(page.getByRole("rowheader", { name: top })).toBeVisible();
    }
    for (const heading of ["Kosten nach Kostenart", "Offene Positionen", "Letzte Dokumente", "Letzte Aktivitäten"]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    // Kosten − Einzahlungen je TOP ergibt die Differenz, und die Summenzeile die Kacheln.
    const total = (await row(page, "Gesamt").last().getByRole("cell").allTextContents()).map(parseCents);
    const perUnit = await Promise.all(
      ["TOP 1", "TOP 2", "TOP 3"].map(async (top) =>
        (await row(page, top).first().getByRole("cell").allTextContents()).map(parseCents),
      ),
    );
    expect(perUnit.reduce((acc, cells) => acc + cells[0], 0)).toBe(total[0]);
    expect(perUnit.reduce((acc, cells) => acc + cells[1], 0)).toBe(total[1]);
    for (const [cost, paid, difference] of perUnit) expect(Math.abs(paid - cost)).toBe(difference);
  });

  test("Jahresübersicht listet alle Abrechnungsjahre", async () => {
    await page.goto("/abrechnung");
    await expect(page.getByRole("heading", { name: "Jahresübersicht" })).toBeVisible();
    await expect(row(page, String(RELEASED_YEAR))).toContainText("Freigegeben");
    await expect(row(page, String(CURRENT_YEAR))).toContainText("Entwurf");
    await page.getByRole("table").getByRole("link", { name: String(RELEASED_YEAR) }).click();
    await expect(page.getByRole("heading", { name: `Abrechnung ${RELEASED_YEAR}` })).toBeVisible();
  });

  test("Kostenverteilung geht ohne Rundungsdifferenz auf", async () => {
    await page.goto(`/abrechnung/${RELEASED_YEAR}`);
    const cells = await row(page, "Kosten gesamt").getByRole("cell").allTextContents();
    const [total, , ...shares] = cells.map(parseCents);
    expect(shares).toHaveLength(3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    expect(total).toBeGreaterThan(0);
  });

  test("Abrechnung je TOP zeigt Kostenpositionen und Einzahlungen", async () => {
    await page.goto(`/abrechnung/${RELEASED_YEAR}`);
    await expect(page.getByText("Gesamtkosten")).toBeVisible();
    await expect(page.getByText("Gesamtzahlungen")).toBeVisible();

    const top1 = page.locator("details").filter({ hasText: "TOP 1" }).first();
    await top1.locator("summary").click();
    await expect(top1.getByRole("heading", { name: "Kostenpositionen" })).toBeVisible();
    await expect(top1.getByRole("row").filter({ hasText: "Thermenwartung TOP 1" })).toBeVisible();
    await expect(top1.getByRole("heading", { name: "Einzahlungen" })).toBeVisible();
    await expect(top1.getByText("Betriebskosten-Akonto 01/")).toBeVisible();

    // Thermenwartung ist nur TOP 1 zugeordnet – bei TOP 3 taucht sie nicht auf.
    const top3 = page.locator("details").filter({ hasText: "TOP 3" }).first();
    await top3.locator("summary").click();
    await expect(top3.getByRole("heading", { name: "Kostenpositionen" })).toBeVisible();
    await expect(top3.getByText("Thermenwartung TOP 1")).toHaveCount(0);
  });

  test("Monatsübersicht summiert auf die Jahreswerte", async () => {
    await page.goto(`/abrechnung/${RELEASED_YEAR}/monate`);
    await expect(page.getByRole("heading", { name: `Monatsübersicht ${RELEASED_YEAR}` })).toBeVisible();

    const table = page.getByRole("table");
    await expect(table.getByRole("rowheader")).toHaveCount(13); // 12 Monate + Jahreszeile
    const months = await table.locator("tbody tr").all();
    let costs = 0;
    let payments = 0;
    for (const month of months) {
      const [cost, payment] = (await month.getByRole("cell").allTextContents()).map(parseCents);
      costs += cost;
      payments += payment;
    }
    const [yearCost, yearPayments] = (
      await row(page, `Jahr ${RELEASED_YEAR}`).getByRole("cell").allTextContents()
    ).map(parseCents);
    expect(costs).toBe(yearCost);
    expect(payments).toBe(yearPayments);

    // Sicht einer einzelnen TOP
    await page.getByLabel("TOP", { exact: true }).selectOption({ label: "TOP 1" });
    await expect(page).toHaveURL(/top=1/);
    await expect(page.getByText("TOP 1 · Kosten nach Rechnungsdatum")).toBeVisible();
  });

  test("freigegebene Abrechnung ist gegen Änderungen gesperrt", async () => {
    await page.goto(`/abrechnung/${RELEASED_YEAR}/kosten`);
    await expect(page.getByText("Diese Abrechnung ist freigegeben")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kosten erfassen" })).toHaveCount(0);
  });

  test("Kosten erfassen – mit Validierung und Beleg", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: "Kosten erfassen" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Beschreibung").fill(COST);
    await dialog.getByLabel("Betrag (€)").fill("kein betrag");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByText("Bitte einen Betrag wie 1.234,56 angeben.")).toBeVisible();
    // Eingaben bleiben nach dem Fehler erhalten.
    await expect(dialog.getByLabel("Beschreibung")).toHaveValue(COST);
    await expect(dialog.locator('select[name="periodId"]')).toHaveValue(/\d+/);

    await dialog.getByLabel("Betrag (€)").fill("300,00");
    await dialog.getByLabel("Umlageschlüssel").selectOption({ label: "Gleiche Teile" });
    await dialog.locator('input[type="file"]').setInputFiles(pdf(INVOICE));
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    await expect(row(page, COST)).toContainText("€ 300,00");
    // Der Beleg hängt als Rechnung an der Kostenposition und lässt sich in der Vorschau öffnen.
    await row(page, COST).getByRole("button", { name: INVOICE }).click();
    const preview = page.getByRole("dialog");
    await expect(preview.locator("iframe")).toHaveAttribute("src", /\/api\/dokumente\/\d+\/datei/);
    await expect(preview.getByRole("link", { name: "Herunterladen" })).toBeVisible();
    await preview.getByRole("button", { name: "Schließen" }).click();
  });

  test("neue Kosten erscheinen in der Verteilung zu gleichen Teilen", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}`);
    const shares = (await row(page, COST).first().getByRole("cell").allTextContents()).map(parseCents);
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
    const cells = await row(page, COST).first().getByRole("cell").allTextContents();
    // Intl setzt zwischen € und Betrag ein geschütztes Leerzeichen.
    expect(cells.slice(2).map((c) => c.replace(/\s+/g, " ").trim())).toEqual(["–", "–", "€ 300,00"]);
  });

  test("Dokument hochladen: Typ, Beschreibung, Kostenposition und TOP", async () => {
    await page.goto("/dokumente");
    await page.getByRole("button", { name: "Dokument hochladen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles(pdf(FILE));
    await dialog.getByLabel("Dokumenttyp").selectOption({ label: "Vertrag" });
    await dialog.locator('select[name="periodId"]').selectOption({ label: String(CURRENT_YEAR) });
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 3" });
    await dialog.getByLabel("Beschreibung").fill(`Wartungsvertrag ${RUN}`);
    await dialog.getByRole("checkbox", { name: new RegExp(COST) }).check();
    await dialog.getByRole("button", { name: "Hochladen" }).click();
    await expect(dialog.getByText(`„${FILE}“ wurde hochgeladen.`)).toBeVisible();
    await dialog.getByRole("button", { name: "Schließen" }).click();

    const documentRow = row(page, FILE);
    await expect(documentRow).toContainText("Vertrag");
    await expect(documentRow).toContainText(`Wartungsvertrag ${RUN}`);
    await expect(documentRow).toContainText(COST);
    await expect(documentRow).toContainText("TOP 3");
    await expect(documentRow).toContainText(String(CURRENT_YEAR));

    const response = await page.request.get(`/api/dokumente/${await documentId(page, FILE)}/datei`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await response.body()).toString()).toContain(FILE);
  });

  test("Dokumentenverwaltung: Suche, Filter, Sortierung und Sprung zur Kostenposition", async () => {
    await page.goto("/dokumente");

    // Suche über Dateiname, Beschreibung und verknüpfte Kostenposition
    await page.getByPlaceholder("Dateiname, Beschreibung").fill(`Wartungsvertrag ${RUN}`);
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(page).toHaveURL(/q=Wartungsvertrag/);
    await expect(row(page, FILE)).toBeVisible();
    await expect(row(page, INVOICE)).toHaveCount(0);

    await page.goto(`/dokumente?q=${encodeURIComponent(COST)}`);
    await expect(row(page, FILE)).toBeVisible();
    await expect(row(page, INVOICE)).toBeVisible();

    // Filter nach Typ wirkt sofort
    await page.getByLabel("Dokumenttyp").selectOption({ label: "Rechnung" });
    await expect(page).toHaveURL(/typ=invoice/);
    await expect(row(page, INVOICE)).toBeVisible();
    await expect(row(page, FILE)).toHaveCount(0);

    // Filter nach Jahr und TOP
    await page.goto(`/dokumente?jahr=${RELEASED_YEAR}&q=${RUN}`);
    await expect(page.getByText("Keine Treffer")).toBeVisible();
    await page.goto(`/dokumente?jahr=${CURRENT_YEAR}&top=1&q=${RUN}`);
    await expect(page.getByText("Keine Treffer")).toBeVisible();
    await page.goto(`/dokumente?jahr=${CURRENT_YEAR}&top=3&q=${RUN}`);
    await expect(row(page, FILE)).toBeVisible();
    await expect(row(page, INVOICE)).toBeVisible();

    // Sortierung nach Datum: der Vertrag wurde nach der Rechnung hochgeladen
    const names = async () =>
      (await page.locator("tbody tr").allTextContents()).map((text) => (text.includes(FILE) ? "vertrag" : "rechnung"));
    expect(await names()).toEqual(["vertrag", "rechnung"]);
    await page.getByLabel("Sortierung").selectOption({ label: "Älteste zuerst" });
    await expect(page).toHaveURL(/sort=oldest/);
    expect(await names()).toEqual(["rechnung", "vertrag"]);

    // Verknüpfung führt zur markierten Kostenposition
    await row(page, FILE).getByRole("link", { name: new RegExp(COST) }).click();
    await expect(page).toHaveURL(new RegExp(`/abrechnung/${CURRENT_YEAR}/kosten\\?position=\\d+`));
    await expect(row(page, COST)).toHaveClass(/bg-primary-soft/);
  });

  test("Dokument bearbeiten: Typ und Zuordnung ändern", async () => {
    await page.goto(`/abrechnung/${CURRENT_YEAR}/belege`);
    await expect(page.getByRole("heading", { name: `Dokumente ${CURRENT_YEAR}` })).toBeVisible();
    await page.getByRole("button", { name: `${FILE} bearbeiten` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox", { name: new RegExp(COST) })).toBeChecked();
    await dialog.getByLabel("Dokumenttyp").selectOption({ label: "Sonstiges" });
    await dialog.getByLabel("Rechnungssteller").fill("E2E GmbH");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, FILE)).toContainText("Sonstiges");
    await expect(row(page, FILE)).toContainText("E2E GmbH");
  });

  test("Upload lehnt doppelte und unerlaubte Dateien ab", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}`);
    await page.getByRole("button", { name: "Einzahlung erfassen" }).click();
    // Die Perioden-ID steckt im Formular der Seite.
    const periodId = await page
      .getByRole("dialog")
      .locator('select[name="periodId"] option')
      .filter({ hasText: String(CURRENT_YEAR) })
      .getAttribute("value");
    await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();

    const upload = (name: string, buffer: Buffer) =>
      page.request.post("/api/dokumente", {
        multipart: { periodId: periodId!, file: { name, mimeType: "application/pdf", buffer } },
      });

    const duplicate = await upload(FILE, tinyPdf(FILE));
    expect(duplicate.status()).toBe(400);
    expect((await duplicate.json()).error).toContain("bereits");

    // Als PDF getarntes HTML: der Typ wird am Inhalt erkannt, nicht an Name oder MIME-Angabe.
    const html = await upload("rechnung.pdf", Buffer.from("<html><script>alert(1)</script>"));
    expect(html.status()).toBe(400);
    expect((await html.json()).error).toContain("Dateiformat");
  });

  test("Einzahlung mit Status und Nachweis: offen zählt nicht, eingegangen schon", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}&top=3`);
    const card = page.locator("div").filter({ hasText: /^TOP 3/ }).first();
    const paidBefore = parseCents(await card.locator("dd").first().innerText());

    await page.getByRole("button", { name: "Einzahlung erfassen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Betrag (€)").fill("1.234,56");
    await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 3" });
    await dialog.getByLabel("Beschreibung / Verwendungszweck").fill(PURPOSE);
    await dialog.getByLabel("Zahlungsstatus").selectOption({ label: "Offen" });
    await dialog.getByLabel("Notiz").fill("automatischer Test");
    await dialog.locator('input[type="file"]').setInputFiles(pdf(PROOF));
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    const paymentRow = row(page, PURPOSE);
    await expect(paymentRow).toContainText("€ 1.234,56");
    await expect(paymentRow).toContainText("Offen");
    await expect(paymentRow.getByRole("button", { name: PROOF })).toBeVisible();
    // Eine offene Zahlung verändert die eingegangenen Einzahlungen nicht.
    expect(parseCents(await card.locator("dd").first().innerText())).toBe(paidBefore);
    await expect(card).toContainText("davon noch offen erwartet");

    // Statusfilter
    await page.getByLabel("Zahlungsstatus").selectOption({ label: "Eingegangen" });
    await expect(page).toHaveURL(/status=eingegangen/);
    await expect(row(page, PURPOSE)).toHaveCount(0);
    await page.getByLabel("Zahlungsstatus").selectOption({ label: "Offen" });
    await expect(page).toHaveURL(/status=offen/);
    await expect(row(page, PURPOSE)).toBeVisible();

    // Dashboard führt die erwartete Zahlung unter den offenen Positionen
    await page.goto(`/dashboard?jahr=${CURRENT_YEAR}`);
    await expect(page.getByRole("link", { name: /erwartete Einzahlung(en)? noch offen/ })).toBeVisible();

    // Zahlung geht ein → zählt jetzt mit
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}&top=3`);
    await row(page, PURPOSE).getByRole("button", { name: /bearbeiten/ }).click();
    await page.getByRole("dialog").getByLabel("Zahlungsstatus").selectOption({ label: "Eingegangen" });
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row(page, PURPOSE)).toContainText("Eingegangen");
    expect(parseCents(await card.locator("dd").first().innerText())).toBe(paidBefore + 1234_56);

    // Der Nachweis steht als Zahlungsnachweis in der Dokumentenverwaltung
    await page.goto(`/dokumente?typ=payment_proof&q=${RUN}`);
    await expect(row(page, PROOF)).toContainText("Zahlungsnachweis");
    await expect(row(page, PROOF)).toContainText("Einzahlung TOP 3");
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

  test("Freigabe: USER sehen nur Dokumente und Kosten der eigenen TOP", async ({ browser }) => {
    const ids = { contract: "", invoice: "", proof: "" };
    await page.goto(`/dokumente?q=${RUN}`);
    ids.contract = await documentId(page, FILE);
    ids.invoice = await documentId(page, INVOICE);
    ids.proof = await documentId(page, PROOF);

    const top3 = await browser.newPage();
    await login(top3, "top3");
    const top1 = await browser.newPage();
    await login(top1, "top1");

    // Entwurf: weder Jahr noch Dateien sind für USER erreichbar.
    expect((await top3.goto(`/abrechnung/${CURRENT_YEAR}`))?.status()).toBe(404);
    for (const id of Object.values(ids)) {
      expect((await top3.request.get(`/api/dokumente/${id}/datei`)).status()).toBe(404);
    }

    await page.goto(`/abrechnung/${CURRENT_YEAR}`);
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Freigeben" }).click();
    await expect(page.getByRole("button", { name: "Freigabe zurücknehmen" })).toBeVisible();

    // TOP 3 sieht das Jahr, die ihr direkt zugeordnete Position, deren Belege und ihren Nachweis.
    expect((await top3.goto(`/abrechnung/${CURRENT_YEAR}`))?.status()).toBe(200);
    const ownRow = top3.getByRole("row").filter({ hasText: COST });
    await expect(ownRow).toContainText("€ 300,00");
    await expect(ownRow.getByRole("button", { name: INVOICE })).toBeVisible();
    await expect(top3.getByText(PURPOSE)).toBeVisible();
    await top3.goto(`/dokumente?q=${RUN}`);
    for (const name of [FILE, INVOICE, PROOF]) {
      await expect(top3.getByRole("row").filter({ hasText: name })).toBeVisible();
    }
    for (const id of Object.values(ids)) {
      expect((await top3.request.get(`/api/dokumente/${id}/datei`)).status()).toBe(200);
    }
    // USER können nichts hochladen, bearbeiten oder löschen.
    await expect(top3.getByRole("button", { name: "Dokument hochladen" })).toHaveCount(0);
    await expect(top3.getByRole("button", { name: /bearbeiten|löschen/ })).toHaveCount(0);

    // TOP 1 ist an nichts davon beteiligt: nicht in der Liste, nicht per direkter URL.
    await top1.goto(`/dokumente?q=${RUN}`);
    await expect(top1.getByText("Keine Treffer")).toBeVisible();
    for (const id of Object.values(ids)) {
      expect((await top1.request.get(`/api/dokumente/${id}/datei`)).status()).toBe(404);
    }
    await top1.goto(`/abrechnung/${CURRENT_YEAR}`);
    await expect(top1.getByText(COST)).toHaveCount(0);
    await expect(top1.getByText(PURPOSE)).toHaveCount(0);

    await page.getByRole("button", { name: "Freigabe zurücknehmen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zurücknehmen" }).click();
    await expect(page.getByRole("button", { name: "Freigeben" })).toBeVisible();

    expect((await top3.goto(`/abrechnung/${CURRENT_YEAR}`))?.status()).toBe(404);
    expect((await top3.request.get(`/api/dokumente/${ids.contract}/datei`)).status()).toBe(404);
    await top3.close();
    await top1.close();
  });

  test("Kosten mit Dokumenten lassen sich nicht in ein anderes Jahr verschieben", async () => {
    const nextYear = CURRENT_YEAR + 1;
    await page.goto(`/abrechnung/${CURRENT_YEAR}`);
    await page.getByRole("button", { name: "Neues Jahr" }).click();
    await expect(page.getByRole("dialog").getByLabel("Jahr")).toHaveValue(String(nextYear));
    await page.getByRole("dialog").getByRole("button", { name: "Anlegen" }).click();
    await expect(page).toHaveURL(new RegExp(`/abrechnung/${nextYear}$`));

    await page.goto(`/abrechnung/${CURRENT_YEAR}/kosten`);
    await page.getByRole("button", { name: `${COST} bearbeiten` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Abrechnungsjahr").selectOption({ label: String(nextYear) });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByText("Die Kostenposition hat verknüpfte Dokumente.")).toBeVisible();
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(row(page, COST)).toBeVisible();

    // Das leere Folgejahr lässt sich wieder löschen.
    await page.goto(`/abrechnung/${nextYear}`);
    await page.getByRole("button", { name: `Abrechnungsjahr ${nextYear} löschen` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(page).toHaveURL(/\/abrechnung$/);
    await expect(row(page, String(nextYear))).toHaveCount(0);
  });

  test("Einzahlung, Dokumente und Kosten wieder löschen", async () => {
    await page.goto(`/einzahlungen?jahr=${CURRENT_YEAR}&top=3`);
    await row(page, PURPOSE).getByRole("button", { name: /löschen/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(row(page, PURPOSE)).toHaveCount(0);

    // Der Nachweis bleibt als Dokument erhalten, verliert aber die Verknüpfung.
    await page.goto(`/dokumente?q=${RUN}`);
    await expect(row(page, PROOF)).not.toContainText("Einzahlung TOP 3");

    for (const name of [PROOF, FILE, INVOICE]) {
      await page.getByRole("button", { name: `${name} löschen` }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(row(page, name)).toHaveCount(0);
    }

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
    expect((await fresh.request.get("/api/dokumente/1/datei")).status()).toBe(403);

    await fresh.getByLabel("Aktuelles Passwort").fill("initial-passwort-1");
    await fresh.getByLabel("Neues Passwort", { exact: true }).fill("mein-eigenes-passwort-2");
    await fresh.getByLabel("Neues Passwort wiederholen").fill("mein-eigenes-passwort-2");
    await fresh.getByRole("button", { name: "Passwort speichern" }).click();
    await expect(fresh).toHaveURL(/\/dashboard/);
    await expect(fresh.getByText("Mein Kostenanteil").first()).toBeVisible();

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
