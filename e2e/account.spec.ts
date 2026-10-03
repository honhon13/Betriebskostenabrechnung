import { expect, test, type Locator, type Page } from "@playwright/test";

import { login, openAdd, parseCents } from "./helpers";

// „E2E Einzahlung …“: so räumt global-setup Reste abgebrochener Läufe weg.
const RUN = Date.now().toString(36);
const DEPOSIT = `E2E Einzahlung Konto ${RUN}`;
const PAYOUT = `E2E Einzahlung Konto Auszahlung ${RUN}`;
const EXPECTED = `E2E Einzahlung Konto offen ${RUN}`;
const EARLIER = `E2E Einzahlung Konto vor Stichtag ${RUN}`;
const KONTO = "/einzahlungen/konto";

const isoDay = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(date);
/** Stichtag ist heute: gezählt wird damit nur, was die Tests selbst buchen. */
const TODAY = isoDay(new Date());
const YESTERDAY = isoDay(new Date(Date.now() - 24 * 60 * 60 * 1000));
const german = (iso: string) => iso.split("-").reverse().join(".");

const row = (scope: Page | Locator, text: string) => scope.getByRole("row").filter({ hasText: text });

/** Karte „Konten je TOP“ bzw. die Karte auf dem Dashboard. */
const card = (page: Page, heading: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

/** Anfangssaldo, Einzahlungen, Auszahlungen und aktueller Saldo einer TOP in Cent. */
async function figures(page: Page, top: string): Promise<[number, number, number, number]> {
  const cells = await row(card(page, "Konten je TOP"), top).getByRole("cell").allTextContents();
  return cells.map(parseCents) as [number, number, number, number];
}

async function addPayment(
  page: Page,
  values: { amount: string; purpose: string; date?: string; status?: string },
): Promise<void> {
  const dialog = await openAdd(page, "Einzahlung hinzufügen");
  if (values.date) await dialog.getByLabel("Datum").fill(values.date);
  await dialog.getByLabel("Betrag (€)").fill(values.amount);
  await dialog.locator('select[name="unitId"]').selectOption({ label: "TOP 3" });
  await dialog.getByLabel("Beschreibung / Verwendungszweck").fill(values.purpose);
  if (values.status) await dialog.getByLabel("Zahlungsstatus").selectOption({ label: values.status });
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
}

test.describe.serial("Abrechnungskonto mit Anfangsbestand", () => {
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

  test("ohne Einrichtung gibt es keinen Kontostand – einrichten kann nur ADMIN", async () => {
    // Auf dem Dashboard weist eine Karte die Verwaltung auf die fehlende Einrichtung hin.
    await expect(admin.getByText("Die laufende Kontoführung ist noch nicht eingerichtet")).toBeVisible();
    await admin.getByRole("link", { name: "Konto einrichten" }).click();
    await expect(admin).toHaveURL(new RegExp(`${KONTO}$`));
    await expect(admin.getByText("Die Kontoführung ist noch nicht eingerichtet")).toBeVisible();
    await expect(admin.getByRole("button", { name: "Konto einrichten" })).toBeVisible();

    // Erreichbar ist das Konto als Reiter im Bereich Einzahlungen.
    await admin.goto("/einzahlungen");
    await admin.getByRole("navigation", { name: "Bereiche der Einzahlungen" }).getByRole("link", { name: "Abrechnungskonto" }).click();
    await expect(admin).toHaveURL(new RegExp(`${KONTO}$`));

    await user.goto(KONTO);
    await expect(user.getByText("Die Kontoführung ist noch nicht eingerichtet")).toBeVisible();
    await expect(user.getByRole("button", { name: /einrichten|ändern/ })).toHaveCount(0);
    await user.goto("/dashboard");
    await expect(user.getByRole("heading", { name: "Abrechnungskonto" })).toHaveCount(0);
  });

  test("ADMIN legt Stichtag und je TOP einen Anfangssaldo fest – Guthaben, Rückstand und null", async () => {
    await admin.getByRole("button", { name: "Konto einrichten" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Stichtag").fill(TODAY);
    await dialog.getByLabel("Anfangssaldo TOP 1 (€)").fill("kein betrag");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    // Der Fehler steht am Feld der betroffenen TOP; die Eingaben bleiben stehen.
    await expect(dialog.getByText("Bitte einen Betrag wie 1.234,56 angeben.")).toBeVisible();
    await expect(dialog.getByLabel("Stichtag")).toHaveValue(TODAY);

    await dialog.getByLabel("Anfangssaldo TOP 1 (€)").fill("250,00");
    // Ein Rückstand, den auch spätere Einzahlungen aus den Beispieldaten nicht ausgleichen.
    await dialog.getByLabel("Anfangssaldo TOP 2 (€)").fill("-12.000,50");
    await dialog.getByLabel("Notiz TOP 2").fill("Rückstand aus dem Vorjahr");
    // TOP 3 bleibt leer – das zählt als 0,00.
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    await expect(admin.getByText(`Laufende Kontoführung seit ${german(TODAY)}`)).toBeVisible();
    const [top1, top2, top3] = [await figures(admin, "TOP 1"), await figures(admin, "TOP 2"), await figures(admin, "TOP 3")];
    expect([top1[0], top2[0], top3[0]]).toEqual([250_00, -12_000_50, 0]);
    // Anfangssaldo + Einzahlungen − Auszahlungen = aktueller Saldo
    for (const [opening, inflow, outflow, balance] of [top1, top2, top3]) {
      expect(opening + inflow - outflow).toBe(balance);
    }
    const accounts = card(admin, "Konten je TOP");
    await expect(row(accounts, "TOP 1")).toContainText("Guthaben");
    await expect(row(accounts, "TOP 2")).toContainText("Rückstand");
    // Der Gesamtbestand ist die Summe der Salden aller TOPs.
    const total = (await row(accounts, "Gesamtbestand").getByRole("cell").allTextContents()).map(parseCents);
    expect(total[0]).toBe(250_00 - 12_000_50);
    expect(total[3]).toBe(top1[3] + top2[3] + top3[3]);

    // Die Notiz steht am Anfangssaldo im Konto der TOP.
    await admin.locator("details").filter({ hasText: "TOP 2" }).locator("summary").click();
    await expect(row(admin, "Anfangssaldo zum Stichtag").filter({ hasText: "Rückstand aus dem Vorjahr" })).toBeVisible();
  });

  test("Ein- und Auszahlungen werden weitergeführt – der Anfangsbestand bleibt, wie er ist", async () => {
    const before = await figures(admin, "TOP 3");

    await addPayment(admin, { amount: "77,00", purpose: DEPOSIT });
    await addPayment(admin, { amount: "-20,00", purpose: PAYOUT });
    // Zählt nicht: eine erwartete, noch nicht eingegangene Zahlung und eine vor dem Stichtag.
    await addPayment(admin, { amount: "500,00", purpose: EXPECTED, status: "Offen" });
    await addPayment(admin, { amount: "300,00", purpose: EARLIER, date: YESTERDAY });

    await admin.goto(KONTO);
    const after = await figures(admin, "TOP 3");
    expect(after).toEqual([before[0], before[1] + 77_00, before[2] + 20_00, before[3] + 57_00]);

    // Kontoauszug der TOP: chronologisch, mit Saldo nach jeder Bewegung.
    const ledger = admin.locator("details").filter({ hasText: "TOP 3" });
    await ledger.locator("summary").click();
    await expect(row(ledger, "Anfangssaldo zum Stichtag")).toContainText(german(TODAY));
    const deposit = (await row(ledger, DEPOSIT).getByRole("cell").allTextContents()).map(parseCents);
    const payout = (await row(ledger, PAYOUT).getByRole("cell").allTextContents()).map(parseCents);
    // Zellen: Datum, Einzahlung, Auszahlung, Saldo
    expect(deposit[1]).toBe(77_00);
    expect(payout[2]).toBe(20_00);
    expect(payout[3]).toBe(deposit[3] - 20_00);
    // Die Fußzeile nennt Summen und aktuellen Saldo – wie die Übersicht.
    const footer = (await row(ledger, "Aktueller Saldo TOP 3").getByRole("cell").allTextContents()).map(parseCents);
    expect(footer).toEqual([after[1], after[2], after[3]]);
    await expect(row(ledger, EXPECTED)).toHaveCount(0);
    await expect(row(ledger, EARLIER)).toHaveCount(0);
  });

  test("Anfangsbestand ändern geht nur über das Formular – und steht im Audit-Log", async () => {
    const before = await figures(admin, "TOP 3");
    await admin.getByRole("button", { name: "Anfangsbestand ändern" }).click();
    const dialog = admin.getByRole("dialog");
    // Das Formular zeigt den gespeicherten Stand.
    await expect(dialog.getByLabel("Stichtag")).toHaveValue(TODAY);
    await expect(dialog.getByLabel("Anfangssaldo TOP 1 (€)")).toHaveValue("250,00");
    await expect(dialog.getByLabel("Anfangssaldo TOP 2 (€)")).toHaveValue("-12000,50");
    await dialog.getByLabel("Anfangssaldo TOP 3 (€)").fill("100,00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    // Die Bewegungen bleiben, der Saldo folgt dem neuen Anfangsbestand.
    await expect(row(card(admin, "Konten je TOP"), "TOP 3")).toContainText("€ 100,00");
    expect(await figures(admin, "TOP 3")).toEqual([100_00, before[1], before[2], before[3] + 100_00]);

    await admin.goto("/einstellungen/protokoll?bereich=account");
    const entries = admin.getByRole("table").locator("tbody").getByRole("row");
    await expect(entries.nth(0)).toContainText("Anfangsbestand geändert");
    await expect(entries.nth(0)).toContainText(/Anfangssaldo TOP 3: €\s0,00 → .*€\s100,00/);
    await expect(entries.nth(0)).toContainText("top2");
    // Unverändertes steht nicht in der Liste.
    await expect(entries.nth(0)).not.toContainText("Anfangssaldo TOP 1");
    await expect(entries.nth(1)).toContainText("Anfangsbestand festgelegt");
    await expect(entries.nth(1)).toContainText(`Abrechnungskonto – Stichtag ${german(TODAY)}`);
  });

  test("Dashboard zeigt Anfangssaldo, aktuelle Bewegungen und aktuellen Saldo je TOP", async () => {
    await admin.goto("/dashboard");
    const account = card(admin, "Abrechnungskonto");
    for (const top of ["TOP 1", "TOP 2", "TOP 3"]) {
      await expect(account.getByRole("rowheader", { name: top })).toBeVisible();
    }
    for (const column of ["Anfangssaldo", "Einzahlungen", "Auszahlungen", "Aktueller Saldo"]) {
      await expect(account.getByRole("columnheader", { name: column })).toBeVisible();
    }
    await expect(account.getByRole("rowheader", { name: "Gesamtbestand" })).toBeVisible();
    // Die jüngsten Bewegungen über alle TOPs – höchstens fünf, jede mit der TOP davor.
    await expect(account.getByRole("heading", { name: "Aktuelle Bewegungen" })).toBeVisible();
    const movements = account.getByRole("listitem");
    expect(await movements.count()).toBeGreaterThan(0);
    expect(await movements.count()).toBeLessThanOrEqual(5);
    await expect(movements.first()).toContainText(/TOP \d · /);
    await account.getByRole("link", { name: "Zum Konto" }).click();
    await expect(admin).toHaveURL(new RegExp(`${KONTO}$`));
  });

  test("USER sehen nur das Konto der eigenen TOP und können den Anfangsbestand nicht ändern", async () => {
    await user.goto(KONTO);
    const main = user.getByRole("main");
    await expect(main.getByText("Meine Kontobewegungen")).toBeVisible();
    await expect(row(user, "Anfangssaldo zum Stichtag")).toContainText("250,00");
    await expect(main.getByText("TOP 2")).toHaveCount(0);
    await expect(main.getByText("TOP 3")).toHaveCount(0);
    await expect(main.getByText(DEPOSIT)).toHaveCount(0);
    await expect(user.getByRole("button", { name: /Anfangsbestand|einrichten/ })).toHaveCount(0);

    await user.goto("/dashboard");
    const account = card(user, "Abrechnungskonto");
    await expect(account.getByRole("rowheader", { name: "TOP 1" })).toBeVisible();
    await expect(account.getByRole("rowheader")).toHaveCount(1);
    await expect(account).not.toContainText("Gesamtbestand");
  });

  test("Testdaten wieder löschen", async () => {
    await admin.goto("/einzahlungen?jahr=alle&top=3");
    for (const purpose of [DEPOSIT, PAYOUT, EXPECTED, EARLIER]) {
      await row(admin, purpose).getByRole("button", { name: /löschen/ }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
      await expect(admin.getByRole("dialog")).toBeHidden();
      await expect(row(admin, purpose)).toHaveCount(0);
    }
  });
});
