import { expect, test } from "@playwright/test";

import { CURRENT_YEAR, RELEASED_YEAR, login, pdfText } from "./helpers";

const pdfUrl = (year: number, query = "") => `/api/abrechnung/${year}/pdf${query}`;

test.describe("Jahresabrechnung als PDF", () => {
  test("ADMIN: Dialog erstellt die Gesamtabrechnung und die Abrechnung je TOP", async ({ page }) => {
    await login(page, "top2");
    await page.goto(`/abrechnung/${RELEASED_YEAR}`);
    // Kosten laut Oberfläche (erste Kachel) – dieselbe Zahl muss im PDF stehen.
    const total = /[\d.]+,\d{2}/.exec(await page.getByRole("region", { name: "Gesamt" }).innerText())![0];

    await page.getByRole("button", { name: "Jahresabrechnung erstellen" }).click();
    const dialog = page.getByRole("dialog");
    // Das Jahr der Ansicht ist vorgewählt.
    await expect(dialog.getByLabel("Abrechnungsjahr")).toHaveValue(String(RELEASED_YEAR));
    await expect(dialog.getByLabel("Umfang")).toHaveValue("alle");
    await dialog.getByRole("button", { name: "PDF erstellen" }).click();
    await expect(dialog.getByText("Die Jahresabrechnung ist erstellt.")).toBeVisible();
    await expect(dialog.locator("iframe")).toHaveAttribute("src", /^blob:/);
    await expect(dialog.getByRole("link", { name: "In neuem Tab öffnen" })).toHaveAttribute(
      "href",
      pdfUrl(RELEASED_YEAR),
    );
    await expect(dialog.getByRole("link", { name: "Herunterladen" })).toHaveAttribute(
      "href",
      pdfUrl(RELEASED_YEAR, "?download=1"),
    );

    // Anderer Umfang: die alte Vorschau verschwindet, erstellt wird die Abrechnung der TOP.
    await dialog.getByLabel("Umfang").selectOption({ label: "Nur TOP 3" });
    await expect(dialog.locator("iframe")).toHaveCount(0);
    await dialog.getByRole("button", { name: "PDF erstellen" }).click();
    await expect(dialog.getByRole("link", { name: "Herunterladen" })).toHaveAttribute(
      "href",
      pdfUrl(RELEASED_YEAR, "?top=3&download=1"),
    );
    await dialog.getByRole("button", { name: "Schließen" }).last().click();
    await expect(dialog).toBeHidden();

    // Gesamtabrechnung: alle TOPs, alle Abschnitte, dieselbe Summe wie in der Oberfläche.
    const overall = await page.request.get(pdfUrl(RELEASED_YEAR));
    expect(overall.status()).toBe(200);
    expect(overall.headers()["content-type"]).toBe("application/pdf");
    expect(overall.headers()["content-disposition"]).toBe(
      `inline; filename*=UTF-8''Betriebskostenabrechnung-${RELEASED_YEAR}.pdf`,
    );
    const body = await overall.body();
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdfText(body);
    for (const expected of [
      `Betriebskostenabrechnung ${RELEASED_YEAR}`,
      "Gesamtabrechnung aller TOPs",
      "Freigegeben am",
      "Ergebnis",
      "Kostenaufstellung",
      "Einzahlungen",
      "Belegübersicht",
      "TOP 1",
      "TOP 2",
      "TOP 3",
      total,
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text).not.toContain("Entwurf");

    // Download und Einzel-TOP
    const download = await page.request.get(pdfUrl(RELEASED_YEAR, "?top=3&download=1"));
    expect(download.headers()["content-disposition"]).toBe(
      `attachment; filename*=UTF-8''Betriebskostenabrechnung-${RELEASED_YEAR}-TOP-3.pdf`,
    );
    const single = pdfText(await download.body());
    expect(single).toContain("Anteil TOP 3");
    expect(single).not.toContain("Gesamtabrechnung aller TOPs");

    // Ein Jahr im Entwurf ist als solcher gekennzeichnet.
    const draft = pdfText(await (await page.request.get(pdfUrl(CURRENT_YEAR))).body());
    expect(draft).toContain("Entwurf");
    expect(draft).not.toContain("Freigegeben am");

    expect((await page.request.get(pdfUrl(RELEASED_YEAR, "?top=99"))).status()).toBe(404);
    expect((await page.request.get(pdfUrl(1999))).status()).toBe(404);
    expect((await page.request.get("/api/abrechnung/abc/pdf")).status()).toBe(404);
  });

  test("USER: nur die eigene TOP und nur freigegebene Jahre", async ({ page }) => {
    await login(page, "top1");
    await page.goto("/abrechnung");
    await page.getByRole("button", { name: "Jahresabrechnung erstellen" }).click();
    const dialog = page.getByRole("dialog");
    // Nur freigegebene Jahre zur Wahl, kein Umfang: es ist immer die eigene TOP.
    await expect(dialog.getByLabel("Abrechnungsjahr").locator("option")).toHaveText([String(RELEASED_YEAR)]);
    await expect(dialog.getByLabel("Umfang")).toHaveCount(0);
    await dialog.getByRole("button", { name: "PDF erstellen" }).click();
    await expect(dialog.getByText("Die Jahresabrechnung ist erstellt.")).toBeVisible();

    // Auch mit dem Parameter einer fremden TOP kommt die eigene Abrechnung – ohne Daten anderer TOPs.
    for (const query of ["", "?top=3"]) {
      const response = await page.request.get(pdfUrl(RELEASED_YEAR, query));
      expect(response.status()).toBe(200);
      expect(response.headers()["content-disposition"]).toContain(
        `Betriebskostenabrechnung-${RELEASED_YEAR}-TOP-1.pdf`,
      );
      const text = pdfText(await response.body());
      expect(text).toContain("Anteil TOP 1");
      expect(text).not.toContain("TOP 2");
      expect(text).not.toContain("TOP 3");
      expect(text).not.toContain("Gesamtabrechnung");
    }

    // Ein Jahr im Entwurf existiert für USER nicht.
    expect((await page.request.get(pdfUrl(CURRENT_YEAR))).status()).toBe(404);
  });

  test("ohne Sitzung gibt es kein PDF", async ({ request }) => {
    expect((await request.get(pdfUrl(RELEASED_YEAR))).status()).toBe(401);
  });
});
