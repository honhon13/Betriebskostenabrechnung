import { expect, test, type Locator, type Page } from "@playwright/test";

import { CURRENT_YEAR, RELEASED_YEAR, login, openAdd, parseCents, tinyPdf } from "./helpers";

// Dashboard-Verlinkungen und Filter der Listenansichten. Gelesen wird vor allem im freigegebenen
// Vorjahr: seine Beispieldaten (9 Kostenpositionen, 12 Akontozahlungen je TOP) sind gesperrt und
// ändern sich durch andere Tests nicht.
const RUN = Date.now().toString(36);
const INVOICE = `e2e-filter-rechnung-${RUN}.pdf`;
const CONTRACT = `e2e-filter-vertrag-${RUN}.pdf`;
const COST = `E2E Testkosten Filter ${RUN}`;

const DASHBOARD = `/dashboard?jahr=${RELEASED_YEAR}`;
const COSTS = `/abrechnung/${RELEASED_YEAR}/kosten`;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
/** Datenzeilen der Tabelle(n) – ohne Kopf- und Summenzeilen. */
const bodyRows = (scope: Page | Locator) => scope.locator("tbody tr");
const card = (page: Page, heading: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** URL endet auf diesen Pfad samt Query – ohne weitere Parameter. */
const endsWith = (path: string) => new RegExp(`${escape(path)}$`);
const pdf = (name: string, marker: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: tinyPdf(`${marker} ${name}`),
});

test.describe.serial("Dashboard-Verlinkungen (ADMIN)", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, "top2");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("Kennzahlen führen in die passende Ansicht – das Jahr wird übernommen", async () => {
    await page.goto(DASHBOARD);
    await page.getByRole("link", { name: "Kosten – Kostenpositionen anzeigen" }).click();
    await expect(page).toHaveURL(endsWith(`${COSTS}?art=kosten`));
    await expect(page.getByLabel("Art", { exact: true })).toHaveValue("kosten");
    await expect(bodyRows(page)).toHaveCount(9);

    await page.goto(DASHBOARD);
    await page.getByRole("link", { name: "Gutschriften – Gutschriften anzeigen" }).click();
    await expect(page).toHaveURL(endsWith(`${COSTS}?art=gutschriften`));
    await expect(page.getByLabel("Art", { exact: true })).toHaveValue("gutschriften");
    // Im Vorjahr gibt es keine Gutschrift – die Liste sagt das, statt alle Kosten zu zeigen.
    await expect(page.getByText("Keine Treffer")).toBeVisible();

    await page.goto(DASHBOARD);
    await page.getByRole("link", { name: "Nettokosten – Abrechnung anzeigen" }).click();
    await expect(page).toHaveURL(endsWith(`/abrechnung/${RELEASED_YEAR}`));

    await page.goto(DASHBOARD);
    await page.getByRole("link", { name: "Einzahlungen gesamt – Einzahlungen anzeigen" }).click();
    await expect(page).toHaveURL(endsWith(`/einzahlungen?jahr=${RELEASED_YEAR}`));
    await expect(page.getByLabel("Abrechnungsjahr")).toHaveValue(String(RELEASED_YEAR));

    await page.goto(DASHBOARD);
    await page.getByRole("link", { name: /– Abrechnung je TOP anzeigen$/ }).click();
    await expect(page).toHaveURL(endsWith(`/abrechnung/${RELEASED_YEAR}`));

    await page.goto(DASHBOARD);
    await page.getByRole("link", { name: "Belege & Dokumente – Dokumente anzeigen" }).click();
    await expect(page).toHaveURL(endsWith(`/dokumente?jahr=${RELEASED_YEAR}`));
    await expect(page.getByLabel("Abrechnungsjahr")).toHaveValue(String(RELEASED_YEAR));

    // Auch die Zahlen der Abrechnungsperiode sind Links.
    await page.goto(DASHBOARD);
    await page.getByRole("link", { name: "9 Kostenpositionen" }).click();
    await expect(page).toHaveURL(endsWith(`${COSTS}?art=kosten`));
  });

  test("Abrechnung je TOP: die TOP, ihre Kosten und ihre Einzahlungen sind einzeln verlinkt", async () => {
    await page.goto(DASHBOARD);
    const statement = card(page, "Abrechnung je TOP");
    await statement.getByRole("link", { name: "TOP 3" }).click();
    await expect(page).toHaveURL(endsWith(`/abrechnung/${RELEASED_YEAR}?top=3#top-3`));
    // Die Abrechnung dieser TOP ist aufgeklappt, die übrigen bleiben zu.
    await expect(page.locator("details#top-3")).toHaveAttribute("open", "");
    await expect(page.locator("details#top-1")).not.toHaveAttribute("open", "");
    await expect(page.locator("details#top-3").getByRole("heading", { name: "Kostenpositionen" })).toBeVisible();

    await page.goto(DASHBOARD);
    await statement.getByTitle("Einzahlungen TOP 1 anzeigen").click();
    await expect(page).toHaveURL(endsWith(`/einzahlungen?jahr=${RELEASED_YEAR}&top=1`));
    await expect(page.getByLabel("TOP", { exact: true })).toHaveValue("1");
    await expect(bodyRows(page)).toHaveCount(12);

    await page.goto(DASHBOARD);
    await statement.getByTitle("Kostenpositionen TOP 3 anzeigen").click();
    await expect(page).toHaveURL(endsWith(`${COSTS}?top=3`));
    await expect(page.getByLabel("TOP", { exact: true })).toHaveValue("3");
    // Die Thermenwartung trägt nur TOP 1 – bei TOP 3 fehlt sie.
    await expect(bodyRows(page)).toHaveCount(8);
    await expect(row(page, "Thermenwartung TOP 1")).toHaveCount(0);

    // Von der Abrechnung einer TOP geht es weiter zu ihren Kosten, Einzahlungen und Dokumenten.
    await page.goto(`/abrechnung/${RELEASED_YEAR}?top=1#top-1`);
    const top1 = page.locator("details#top-1");
    await expect(top1.getByRole("link", { name: "Kostenpositionen TOP 1" })).toHaveAttribute(
      "href",
      `${COSTS}?top=1`,
    );
    await expect(top1.getByRole("link", { name: /^Einzahlungen TOP 1/ })).toHaveAttribute(
      "href",
      `/einzahlungen?jahr=${RELEASED_YEAR}&top=1`,
    );
  });

  test("Kostenarten, Kostenverlauf und offene Positionen führen in die gefilterte Kostenliste", async () => {
    await page.goto(DASHBOARD);
    await card(page, "Kosten nach Kostenart").getByRole("link", { name: "Rauchfangkehrer" }).click();
    await expect(page).toHaveURL(new RegExp(`${escape(COSTS)}\\?kostenart=\\d+&art=kosten$`));
    await expect(page.getByLabel("Kostenart").locator("option:checked")).toHaveText("Rauchfangkehrer");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(row(page, "Kehrung und Überprüfung")).toBeVisible();

    // Kostenverlauf: der Monat in der Tabelle und die Säule im Diagramm führen zu den Kosten des Monats.
    await page.goto(DASHBOARD);
    const trend = card(page, "Kostenverlauf");
    const march = `${COSTS}?von=${RELEASED_YEAR}-03-01&bis=${RELEASED_YEAR}-03-31`;
    await expect(trend.getByRole("img").locator("a").nth(2)).toHaveAttribute("href", march);
    await trend.getByText("Werte als Tabelle").click();
    await trend.locator("table").getByRole("link", { name: `März ${RELEASED_YEAR}` }).click();
    await expect(page).toHaveURL(endsWith(march));
    await expect(page.getByLabel("Von", { exact: true })).toHaveValue(`${RELEASED_YEAR}-03-01`);
    await expect(page.getByLabel("Bis", { exact: true })).toHaveValue(`${RELEASED_YEAR}-03-31`);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(row(page, "Kanalbenützungsgebühr")).toBeVisible();
    // Im Jahresvergleich führt ein Jahr zu seiner Abrechnung.
    await page.goto(`${DASHBOARD}&verlauf=jahre`);
    await expect(trend.getByRole("img").locator("a").first()).toHaveAttribute("href", /^\/abrechnung\/\d{4}$/);
    await expect(trend.getByRole("link", { name: "Monatsübersicht" })).toHaveCount(0);
    await page.goto(DASHBOARD);
    await expect(trend.getByRole("link", { name: "Monatsübersicht" })).toHaveAttribute(
      "href",
      `/abrechnung/${RELEASED_YEAR}/monate`,
    );

    // Offene Positionen: genau die gezählte Auswahl.
    const open = card(page, "Offene Positionen");
    const withoutReceipt = Number(
      await open.getByRole("link", { name: /ohne Beleg/ }).locator("span.font-semibold").innerText(),
    );
    await open.getByRole("link", { name: /ohne Beleg/ }).click();
    await expect(page).toHaveURL(endsWith(`${COSTS}?beleg=ohne&pruefung=freigegeben`));
    await expect(page.getByLabel("Beleg", { exact: true })).toHaveValue("ohne");
    await expect(bodyRows(page)).toHaveCount(withoutReceipt);

    // Letzte Aktivitäten: die Kostenposition ist in der Liste markiert.
    await page.goto(DASHBOARD);
    await card(page, "Letzte Aktivitäten").getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`${escape(COSTS)}\\?position=\\d+$`));
    await expect(page.locator("tbody tr.bg-primary-soft")).toHaveCount(1);
  });

  test("interaktive Elemente zeigen den Zeiger und reagieren auf Hover", async () => {
    await page.goto(DASHBOARD);
    const tileLink = page.getByRole("link", { name: "Kosten – Kostenpositionen anzeigen" });
    await expect(tileLink).toHaveCSS("cursor", "pointer");
    await expect(card(page, "Abrechnung je TOP").getByRole("link", { name: "TOP 1" })).toHaveCSS("cursor", "pointer");
    // Auch Schaltflächen, Auswahlfelder und aufklappbare Bereiche.
    await expect(page.getByRole("button", { name: "Hinzufügen", exact: true })).toHaveCSS("cursor", "pointer");
    await expect(page.getByLabel("Abrechnungsjahr")).toHaveCSS("cursor", "pointer");
    await expect(page.getByText("Werte als Tabelle")).toHaveCSS("cursor", "pointer");

    // Die ganze Kachel ist die Klickfläche und hebt sich beim Überfahren ab.
    const tile = page.locator("div.rounded-xl").filter({ has: tileLink });
    const borderColor = () => tile.evaluate((element) => getComputedStyle(element).borderColor);
    const before = await borderColor();
    const box = (await tile.boundingBox())!;
    await page.mouse.move(box.x + box.width - 12, box.y + box.height - 12);
    await expect.poll(borderColor).not.toBe(before);
    await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
    await expect(page).toHaveURL(endsWith(`${COSTS}?art=kosten`));
  });
});

test.describe.serial("Filter der Listenansichten (ADMIN)", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, "top2");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("Kosten: Suche und Filter lassen sich kombinieren und zurücksetzen", async () => {
    await page.goto(COSTS);
    await expect(bodyRows(page)).toHaveCount(9);
    const list = card(page, "Kostenpositionen");

    await page.getByPlaceholder("Beschreibung, Rechnungssteller").fill("Gemeinde");
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(page).toHaveURL(/q=Gemeinde/);
    await expect(bodyRows(page)).toHaveCount(3);
    await expect(list).toContainText("3 Positionen");
    await expect(list).toContainText("Auswahl aus 9");

    // Ein Auswahlfeld wirkt sofort – die Suche bleibt dabei stehen.
    await page.getByLabel("Kostenart").selectOption({ label: "Müllabfuhr" });
    await expect(page).toHaveURL(/q=Gemeinde.*kostenart=\d+/);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(row(page, "Müllgebühr Jahresvorschreibung")).toBeVisible();
    await expect(page.getByPlaceholder("Beschreibung, Rechnungssteller")).toHaveValue("Gemeinde");
    // Die Summe gilt für die Auswahl.
    expect(parseCents((await row(page, "Summe").getByRole("cell").allTextContents())[1])).toBe(612_00);

    // Zurücksetzen leert alle Filter – auch in den Feldern.
    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(endsWith(COSTS));
    await expect(bodyRows(page)).toHaveCount(9);
    await expect(page.getByPlaceholder("Beschreibung, Rechnungssteller")).toHaveValue("");
    await expect(page.getByLabel("Kostenart")).toHaveValue("alle");
    await expect(page.getByRole("link", { name: "Zurücksetzen" })).toHaveCount(0);

    // TOP und Betrag.
    await page.getByLabel("TOP", { exact: true }).selectOption({ label: "TOP 3" });
    await expect(bodyRows(page)).toHaveCount(8);
    await page.getByLabel("Betrag ab (€)").fill("1.000,00");
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(page).toHaveURL(/top=3.*betragAb=1\.000%2C00/);
    await expect(bodyRows(page)).toHaveCount(2);
    await expect(row(page, "Wasser- und Abwassergebühr")).toBeVisible();
    await expect(row(page, "Gebäudeversicherung Jahresprämie")).toBeVisible();

    // Zeitraum (Rechnungsdatum) – und „Zurück“ im Browser stellt auch die Felder wieder her.
    await page.goto(`${COSTS}?von=${RELEASED_YEAR}-10-01&bis=${RELEASED_YEAR}-12-31`);
    await expect(bodyRows(page)).toHaveCount(3);
    await page.getByLabel("Art", { exact: true }).selectOption({ label: "Nur Gutschriften" });
    await expect(page.getByText("Keine Treffer")).toBeVisible();
    await page.goBack();
    await expect(bodyRows(page)).toHaveCount(3);
    await expect(page.getByLabel("Art", { exact: true })).toHaveValue("alle");

    // Unbekannte oder kaputte Werte in der URL werden ignoriert, statt die Seite zu brechen.
    await page.goto(`${COSTS}?kostenart=abc&top=99&art=x&von=31.12.${RELEASED_YEAR}&betragAb=viel&pruefung=1`);
    await expect(bodyRows(page)).toHaveCount(9);
    await expect(page.getByRole("link", { name: "Zurücksetzen" })).toHaveCount(0);
  });

  test("Einzahlungen: Jahr und TOP gelten für die Seite, die übrigen Filter für die Liste", async () => {
    await page.goto(`/einzahlungen?jahr=${RELEASED_YEAR}&top=1`);
    await expect(bodyRows(page)).toHaveCount(12);

    await page.getByLabel("Von", { exact: true }).fill(`${RELEASED_YEAR}-03-01`);
    await page.getByLabel("Bis", { exact: true }).fill(`${RELEASED_YEAR}-04-30`);
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(page).toHaveURL(new RegExp(`jahr=${RELEASED_YEAR}&top=1.*von=${RELEASED_YEAR}-03-01&bis=${RELEASED_YEAR}-04-30`));
    await expect(bodyRows(page)).toHaveCount(2);
    await expect(card(page, `Einzahlungen ${RELEASED_YEAR}`)).toContainText("2 Einzahlungen · € 300,00 eingegangen – in dieser Auswahl");

    // Kombiniert mit dem Zahlungsstatus bleibt nichts übrig.
    await page.getByLabel("Zahlungsstatus").selectOption({ label: "Offen" });
    await expect(page).toHaveURL(/status=offen.*von=/);
    await expect(page.getByText("Keine Treffer")).toBeVisible();

    // Zurücksetzen behält Jahr und TOP der Seite.
    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(endsWith(`/einzahlungen?jahr=${RELEASED_YEAR}&top=1`));
    await expect(bodyRows(page)).toHaveCount(12);
    await expect(page.getByLabel("Zahlungsstatus")).toHaveValue("alle");

    // Umgekehrt behält der Wechsel der TOP die Filter der Liste.
    await page.goto(`/einzahlungen?jahr=${RELEASED_YEAR}&top=1&q=03%2F${RELEASED_YEAR}`);
    await expect(bodyRows(page)).toHaveCount(1);
    await page.getByLabel("TOP", { exact: true }).selectOption({ label: "TOP 3" });
    await expect(page).toHaveURL(/top=3.*q=03/);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText("TOP 3");

    // Betrag: nur TOP 2 zahlt mehr als € 180 Akonto.
    await page.goto(`/einzahlungen?jahr=${RELEASED_YEAR}&betragAb=180`);
    await expect(bodyRows(page)).toHaveCount(12);
    await expect(bodyRows(page).filter({ hasText: "TOP 2" })).toHaveCount(12);

    // Sprungziel aus dem Dashboard: die Einzahlung ist in der Liste markiert.
    await page.goto(`/dashboard?jahr=${CURRENT_YEAR}`);
    const activity = card(page, "Letzte Aktivitäten")
      .getByRole("link")
      .filter({ hasText: "Einzahlung erfasst" })
      .first();
    if ((await activity.count()) > 0) {
      await activity.click();
      await expect(page).toHaveURL(new RegExp(`/einzahlungen\\?jahr=${CURRENT_YEAR}&zahlung=\\d+$`));
      await expect(page.locator("tbody tr.bg-primary-soft")).toHaveCount(1);
    }
  });

  test("Dokumente: Typ, Kostenart, Zuordnung, OCR-Status, Zeitraum und Betrag", async () => {
    // Zwei Dokumente im laufenden Jahr: eine ausgelesene Rechnung (15.03., € 214,80) und ein Vertrag.
    await page.goto(`/dokumente?q=${RUN}`);
    const dialog = await openAdd(page, "Dokument hochladen");
    const periodId = await dialog
      .locator('select[name="periodId"] option')
      .filter({ hasText: String(CURRENT_YEAR) })
      .getAttribute("value");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    for (const [file, fields] of [
      [pdf(INVOICE, "OCR-RECHNUNG"), { type: "invoice", ocr: "on" }],
      [pdf(CONTRACT, "nur ein Vertrag"), { type: "contract" }],
    ] as const) {
      const response = await page.request.post("/api/dokumente", {
        multipart: { periodId: periodId!, ...fields, file },
      });
      expect(response.status()).toBe(201);
    }

    const filtered = async (query: string, expected: string[]) => {
      await page.goto(`/dokumente?q=${RUN}${query}`);
      for (const name of [INVOICE, CONTRACT]) {
        await expect(row(page, name), `${name} bei ${query}`).toHaveCount(expected.includes(name) ? 1 : 0);
      }
    };
    await filtered("", [INVOICE, CONTRACT]);
    await filtered("&typ=contract", [CONTRACT]);
    await filtered("&ocr=verarbeitet", [INVOICE]);
    await filtered("&ocr=offen", [CONTRACT]);
    await filtered("&zuordnung=ohne", [INVOICE, CONTRACT]);
    await filtered("&zuordnung=mit", []);
    await filtered("&betragAb=200&betragBis=220", [INVOICE]);
    await filtered("&betragAb=500", []);
    await filtered("&von=2026-03-01&bis=2026-03-31", [INVOICE]);
    await filtered("&pruefung=ausstehend", []);
    await filtered("&pruefung=freigegeben&typ=invoice&ocr=verarbeitet&zuordnung=ohne", [INVOICE]);

    // Über die Oberfläche: Kostenart wirkt sofort, die Suche bleibt, Zurücksetzen leert alles.
    await page.goto(`/dokumente?q=${RUN}`);
    await page.getByLabel("Kostenart").selectOption({ label: "Rauchfangkehrer" });
    await expect(page).toHaveURL(new RegExp(`q=${RUN}.*kostenart=\\d+`));
    await expect(row(page, INVOICE)).toHaveCount(1);
    await expect(row(page, CONTRACT)).toHaveCount(0);
    await page.getByLabel("Kostenart").selectOption({ label: "Offen – noch nicht zugeordnet" });
    await expect(page.getByText("Keine Treffer")).toBeVisible();
    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(endsWith("/dokumente"));
    await expect(page.getByLabel("Kostenart")).toHaveValue("alle");

    // Das Dashboard führt mit „Dokumente ohne Zuordnung“ genau in diese Auswahl.
    await page.goto(`/dashboard?jahr=${CURRENT_YEAR}`);
    await card(page, "Offene Positionen").getByRole("link", { name: /ohne Zuordnung/ }).click();
    await expect(page).toHaveURL(endsWith(`/dokumente?jahr=${CURRENT_YEAR}&zuordnung=ohne&pruefung=freigegeben`));
    await expect(page.getByLabel("Zuordnung")).toHaveValue("ohne");
    await expect(row(page, INVOICE)).toHaveCount(1);
    await expect(row(page, CONTRACT)).toHaveCount(1);

    // Aufräumen.
    await page.goto(`/dokumente?q=${RUN}`);
    for (const name of [INVOICE, CONTRACT]) {
      await page.getByRole("button", { name: `${name} löschen` }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(row(page, name)).toHaveCount(0);
    }
  });

  test("Benutzer, Stammdaten, Jahresübersicht und Audit-Log", async () => {
    // Benutzer: Rolle und Suche.
    await page.goto("/einstellungen/benutzer");
    const users = card(page, "Benutzer");
    const all = await bodyRows(users).count();
    expect(all).toBeGreaterThanOrEqual(3);
    await page.getByLabel("Rolle", { exact: true }).selectOption({ label: "Administrator" });
    await expect(page).toHaveURL(/rolle=\d+/);
    await expect(bodyRows(users)).toHaveCount(1);
    await expect(bodyRows(users).first()).toContainText("top2");
    await page.getByPlaceholder("Benutzername, Anzeigename").fill("top3");
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(users.getByText("Keine Treffer")).toBeVisible();
    await users.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(bodyRows(users)).toHaveCount(all);
    await page.goto("/einstellungen/benutzer?top=1&status=aktiv");
    await expect(bodyRows(users)).toHaveCount(1);
    await expect(bodyRows(users).first()).toContainText("top1");

    // Stammdaten: ein Filter für alle drei Listen.
    await page.goto("/einstellungen/stammdaten");
    await page.getByPlaceholder("Name, Beschreibung").fill("müll");
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(bodyRows(card(page, "Kostenarten"))).toHaveCount(1);
    await expect(card(page, "Kostenarten")).toContainText("Müllabfuhr");
    await expect(card(page, "Wohneinheiten")).toContainText("Keine Treffer");
    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(bodyRows(card(page, "Wohneinheiten"))).toHaveCount(3);
    // Die Formulare kennen weiterhin alle Umlageschlüssel – auch wenn die Liste gefiltert ist.
    await page.goto("/einstellungen/stammdaten?q=wohnfl%C3%A4che");
    await expect(bodyRows(card(page, "Umlageschlüssel"))).toHaveCount(1);

    // Jahresübersicht: Status und Zeitraum.
    await page.goto("/abrechnung");
    const years = card(page, "Jahresübersicht");
    await page.getByLabel("Status", { exact: true }).selectOption({ label: "Entwurf" });
    await expect(page).toHaveURL(/status=entwurf/);
    await expect(bodyRows(years).filter({ hasText: String(CURRENT_YEAR) })).toHaveCount(1);
    await expect(bodyRows(years).filter({ hasText: "Freigegeben" })).toHaveCount(0);
    await page.goto(`/abrechnung?bis=${RELEASED_YEAR}`);
    await expect(bodyRows(years)).toHaveCount(1);
    await expect(bodyRows(years).first()).toContainText(String(RELEASED_YEAR));
    await years.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(endsWith("/abrechnung"));

    // Audit-Log: Bereich und Zeitraum kombiniert.
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
    await page.goto(`/einstellungen/protokoll?bereich=auth&von=${today}&bis=${today}`);
    const entries = page.getByRole("table").locator("tbody").getByRole("row");
    await expect(entries.first()).toContainText(/Anmeldung|Abmeldung/);
    await expect(page.getByLabel("Bereich", { exact: true })).toHaveValue("auth");
    await expect(page.getByLabel("Von", { exact: true })).toHaveValue(today);
    await page.goto("/einstellungen/protokoll?von=2000-01-01&bis=2000-01-02");
    await expect(page.getByText("Keine Treffer")).toBeVisible();
  });
});

test.describe.serial("Prüfung und eigene Eingaben", () => {
  let admin: Page;
  let user: Page;

  test.beforeAll(async ({ browser }) => {
    admin = await browser.newPage();
    user = await browser.newPage();
    await login(admin, "top2");
    await login(user, "top1");
  });

  test.afterAll(async () => {
    await admin.close();
    await user.close();
  });

  test("USER filtert die eigenen Eingaben – das Dashboard führt zu den offenen", async () => {
    await user.goto("/eingaben");
    const dialog = await openAdd(user, "Kosten einreichen");
    await dialog.getByLabel("Beschreibung").fill(COST);
    await dialog.getByLabel("Betrag (€)").fill("12,34");
    await dialog.getByRole("button", { name: "Einreichen" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(user, COST)).toBeVisible();

    // Prüfstand, Suche und Jahr.
    await user.getByLabel("Prüfstand").selectOption({ label: "Freigegeben" });
    await expect(user).toHaveURL(/pruefung=freigegeben/);
    await expect(row(user, COST)).toHaveCount(0);
    await user.getByLabel("Prüfstand").selectOption({ label: "Ausstehende Prüfung" });
    await expect(row(user, COST)).toBeVisible();
    await user.getByPlaceholder("Beschreibung, Datei").fill(`Filter ${RUN}`);
    await user.getByRole("button", { name: "Suchen" }).click();
    await expect(user).toHaveURL(/q=Filter.*pruefung=ausstehend/);
    await expect(row(user, COST)).toBeVisible();
    await expect(card(user, "Kosten")).toContainText(/1 eingereichte Position von \d+/);
    await user.goto(`/eingaben?q=${RUN}&pruefung=abgelehnt`);
    await expect(row(user, COST)).toHaveCount(0);
    await user.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(user).toHaveURL(endsWith("/eingaben"));
    await expect(row(user, COST)).toBeVisible();

    await user.goto("/dashboard");
    await card(user, "Offene Positionen").getByRole("link", { name: /wartet auf Prüfung|warten auf Prüfung/ }).click();
    await expect(user).toHaveURL(endsWith("/eingaben?pruefung=ausstehend"));
    await expect(user.getByLabel("Prüfstand")).toHaveValue("ausstehend");
    await expect(row(user, COST)).toBeVisible();
  });

  test("ADMIN filtert die Prüfliste – der Reiter bleibt dabei erhalten", async () => {
    await admin.goto("/dashboard");
    await card(admin, "Offene Positionen").getByRole("link", { name: /auf Prüfung/ }).click();
    await expect(admin).toHaveURL(endsWith("/pruefung"));

    await admin.getByPlaceholder("Eintrag, TOP, Einreicher").fill(RUN);
    await admin.getByRole("button", { name: "Suchen" }).click();
    await expect(admin).toHaveURL(new RegExp(`status=ausstehend&q=${RUN}`));
    await expect(bodyRows(admin)).toHaveCount(1);
    await expect(row(admin, COST)).toBeVisible();

    await admin.getByLabel("Art", { exact: true }).selectOption({ label: "Einzahlung" });
    await expect(admin).toHaveURL(/art=einzahlung/);
    await expect(admin.getByText("Keine Treffer")).toBeVisible();
    await admin.getByLabel("Art", { exact: true }).selectOption({ label: "Kosten" });
    await admin.getByLabel("Eingereicht von").selectOption({ label: "TOP 1" });
    await expect(admin).toHaveURL(/art=kosten.*benutzer=TOP(\+|%20)1/);
    await expect(row(admin, COST)).toBeVisible();

    // Der Wechsel des Reiters nimmt die Filter mit; „Zurücksetzen“ bleibt im Reiter.
    await admin.getByRole("link", { name: "Abgelehnt" }).click();
    await expect(admin).toHaveURL(new RegExp(`status=abgelehnt&q=${RUN}&art=kosten`));
    await expect(row(admin, COST)).toHaveCount(0);
    await admin.goto(`/pruefung?status=ausstehend&q=${RUN}&betragAb=100`);
    await expect(admin.getByText("Keine Treffer")).toBeVisible();
    await admin.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(admin).toHaveURL(endsWith("/pruefung?status=ausstehend"));

    // Aufräumen: nur die Verwaltung löscht.
    await admin.goto(`/pruefung?q=${RUN}`);
    await row(admin, COST).getByRole("button", { name: `${COST} löschen` }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(row(admin, COST)).toHaveCount(0);
  });
});

test.describe("USER: Verlinkungen und Filter respektieren die Rolle", () => {
  test("das Dashboard verlinkt nur, was die Rolle öffnen darf", async ({ page }) => {
    await login(page, "top1");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Kosten (mein Anteil) – Abrechnung anzeigen" })).toHaveAttribute(
      "href",
      `/abrechnung/${RELEASED_YEAR}`,
    );
    await expect(main.getByRole("link", { name: "Mein Kostenanteil – Abrechnung anzeigen" })).toBeVisible();
    // Keine Links in Bereiche der Verwaltung: Kostenliste, Prüfung, Einstellungen.
    await expect(main.locator('a[href*="/kosten"], a[href^="/pruefung"], a[href^="/einstellungen"]')).toHaveCount(0);
    await expect(main.locator('a[href*="top="]')).toHaveCount(0);

    await main.getByRole("link", { name: "Meine Einzahlungen – Einzahlungen anzeigen" }).click();
    await expect(page).toHaveURL(endsWith(`/einzahlungen?jahr=${RELEASED_YEAR}`));
    await expect(bodyRows(page)).toHaveCount(12);
    await expect(bodyRows(page).filter({ hasText: "TOP 1" })).toHaveCount(12);

    // Die eigene TOP führt zur eigenen Abrechnung, die Kostenart ebenfalls.
    await page.goto("/dashboard");
    await card(page, "Kosten nach Kostenart").getByRole("link", { name: "Rauchfangkehrer" }).click();
    await expect(page).toHaveURL(endsWith(`/abrechnung/${RELEASED_YEAR}`));
  });

  test("Filter schränken nur ein – fremde TOPs und Verwaltungsfilter bleiben verschlossen", async ({ page }) => {
    await login(page, "top1");

    // Einzahlungen: filtern ja, eine fremde TOP nie.
    await page.goto(`/einzahlungen?jahr=${RELEASED_YEAR}&top=2&von=${RELEASED_YEAR}-03-01&bis=${RELEASED_YEAR}-03-31`);
    await expect(page.getByLabel("TOP", { exact: true })).toHaveCount(0);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText("TOP 1");
    await expect(page.getByLabel("Zahlungsstatus")).toBeVisible();

    // Dokumente: TOP, Zuordnung und OCR-Status gibt es nicht – und als Parameter wirken sie nicht.
    await page.goto("/dokumente");
    for (const label of ["TOP", "Zuordnung", "OCR-Status"]) {
      await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByLabel("Dokumenttyp")).toBeVisible();
    const own = await bodyRows(page).count();
    await page.goto("/dokumente?top=2&zuordnung=ohne&ocr=offen");
    await expect(bodyRows(page)).toHaveCount(own);
    await expect(page.getByText(/TOP [23]/)).toHaveCount(0);

    // Abrechnung: ?top= klappt nichts Fremdes auf.
    await page.goto(`/abrechnung/${RELEASED_YEAR}?top=2`);
    await expect(page.locator("details")).toHaveCount(1);
    await expect(page.locator("details#top-1")).toHaveAttribute("open", "");
    await expect(page.getByText(/TOP [23]/)).toHaveCount(0);

    // Konto und Vorlagen: keine TOP-Auswahl.
    await page.goto("/einzahlungen/konto?top=2");
    await expect(page.getByLabel("TOP", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/TOP [23]/)).toHaveCount(0);
    await page.goto("/wiederkehrend?top=2&status=inaktiv");
    await expect(page.getByLabel("TOP", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Status", { exact: true })).toHaveCount(0);

    // Listen der Verwaltung bleiben auch mit Filtern in der URL gesperrt.
    for (const path of [
      `${COSTS}?top=1&art=kosten`,
      "/pruefung?art=kosten",
      "/einstellungen/benutzer?q=top",
      "/einstellungen/stammdaten?q=m",
      "/einstellungen/protokoll?bereich=cost",
    ]) {
      await page.goto(path);
      await expect(page.getByText("Kein Zugriff"), path).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    }
  });
});
