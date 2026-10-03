import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test.describe("Anmeldung", () => {
  test("leitet nicht angemeldete Besucher zum Login", async ({ page }) => {
    await page.goto("/abrechnung");
    await expect(page).toHaveURL(/\/login\?next=%2Fabrechnung/);
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  });

  test("Favicon: passende Größen, eingebunden und ohne Anmeldung abrufbar", async ({ page }) => {
    await page.goto("/login");
    // Browser-Tab (auch für Tabs ohne HTML, z. B. ein geöffnetes PDF), Lesezeichen und iOS-Startbildschirm.
    const icons = [
      { selector: 'link[rel="icon"][href^="/favicon.ico"]', type: "image/x-icon", sizes: "48x48" },
      { selector: 'link[rel="icon"][href^="/icon.png"]', type: "image/png", sizes: "192x192" },
      { selector: 'link[rel="apple-touch-icon"]', type: "image/png", sizes: "180x180" },
    ];
    for (const icon of icons) {
      const link = page.locator(icon.selector);
      await expect(link).toHaveAttribute("sizes", icon.sizes);
      const response = await page.request.get((await link.getAttribute("href"))!);
      expect(response.status(), icon.selector).toBe(200);
      expect(response.headers()["content-type"]).toBe(icon.type);
      // Ein Tab-Icon soll klein bleiben – die Originalgrafik hatte 1 MB.
      expect((await response.body()).length, icon.selector).toBeLessThan(100_000);
    }
  });

  test("API antwortet ohne Sitzung mit 401", async ({ request }) => {
    expect((await request.get("/api/dokumente/1/datei")).status()).toBe(401);
    expect((await request.post("/api/dokumente", { multipart: { periodId: "1" } })).status()).toBe(401);
  });

  test("lehnt falsche Zugangsdaten ab, ohne zu verraten, was falsch war", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Benutzername").fill("top3");
    await page.getByLabel("Passwort", { exact: true }).fill("definitiv-falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();
    const error = page.getByRole("alert").filter({ hasText: "Benutzername oder Passwort ist falsch" });
    await expect(error).toBeVisible();
    // Die Eingabe bleibt stehen.
    await expect(page.getByLabel("Benutzername")).toHaveValue("top3");

    await page.getByLabel("Benutzername").fill("gibt-es-nicht");
    await page.getByRole("button", { name: "Anmelden" }).click();
    // Dieselbe Meldung für unbekannte Benutzer wie für ein falsches Passwort.
    await expect(error).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("Login, Sitzungs-Cookie und Logout", async ({ page, context }) => {
    await login(page, "top2");
    const cookie = (await context.cookies()).find((c) => c.name === "bk_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("ein manipuliertes Cookie gilt nicht als Sitzung", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "bk_session", value: "erfunden", url: baseURL! }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
