import { expect, type Page } from "@playwright/test";

export type SeedUser = "top1" | "top2" | "top3";

export function passwordOf(user: SeedUser): string {
  const password = process.env[`SEED_PASSWORD_${user.toUpperCase()}`];
  if (!password) throw new Error(`SEED_PASSWORD_${user.toUpperCase()} fehlt in .env.local`);
  return password;
}

export async function login(page: Page, user: SeedUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(user);
  await page.getByLabel("Passwort", { exact: true }).fill(passwordOf(user));
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** "€ 1.234,56" → 123456 */
export function parseCents(text: string): number {
  const digits = text.replace(/[^\d,-]/g, "").replace(",", ".");
  return Math.round(Number(digits) * 100);
}

/** Die Seite darf auf keinem Gerät seitlich überlaufen. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "Seite läuft horizontal über").toBeLessThanOrEqual(0);
}

export const CURRENT_YEAR = new Date().getFullYear();
export const RELEASED_YEAR = CURRENT_YEAR - 1;

/** Minimal gültiges PDF für Upload-Tests; `marker` macht den Inhalt je Lauf eindeutig. */
export function tinyPdf(marker: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% ${marker}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
      `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n` +
      `trailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}
