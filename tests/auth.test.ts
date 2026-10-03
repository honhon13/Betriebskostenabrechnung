import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/auth/errors";
import { generatePassword, hashPassword, needsRehash, verifyPassword } from "@/auth/password";
import { ALL_PERMISSIONS, ROLE_DEFINITIONS, ROLE_KEYS, type Permission } from "@/auth/permissions";
import {
  authorize,
  authorizeGlobalWrite,
  can,
  canAccessPeriodStatus,
  canAccessUnit,
  getDataScope,
} from "@/auth/rbac";

const permissionsOf = (key: string) => ROLE_DEFINITIONS.find((r) => r.key === key)!.permissions;
const admin = { permissions: permissionsOf(ROLE_KEYS.ADMIN), unitId: 2 };
const user = { permissions: permissionsOf(ROLE_KEYS.USER), unitId: 1 };

describe("Rollen", () => {
  it("ADMIN hat jedes Recht des Katalogs", () => {
    expect(new Set(admin.permissions)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it("USER darf lesen und einreichen – nicht direkt schreiben, löschen, prüfen oder alle TOPs sehen", () => {
    const forbidden = user.permissions.filter(
      (p) => /:(write|delete|release|manage|ocr)$/.test(p) || p.startsWith("scope:"),
    );
    expect(forbidden).toEqual([]);
    expect(user.permissions.filter((p) => p.endsWith(":submit"))).toHaveLength(4);
  });
});

describe("rbac", () => {
  it("prüft einzelne Rechte", () => {
    expect(can(admin, "cost:delete")).toBe(true);
    expect(can(user, "cost:delete")).toBe(false);
    expect(() => authorize(user, "cost:write")).toThrow(ForbiddenError);
    expect(() => authorize(user, "cost:read")).not.toThrow();
  });

  it("leitet den Datenumfang aus den scope-Rechten ab", () => {
    expect(getDataScope(admin)).toEqual({ allUnits: true, unitId: 2, includeDrafts: true });
    expect(getDataScope(user)).toEqual({ allUnits: false, unitId: 1, includeDrafts: false });
  });

  it("USER sieht nur die eigene TOP und nur freigegebene Jahre", () => {
    expect(canAccessUnit(user, 1)).toBe(true);
    expect(canAccessUnit(user, 2)).toBe(false);
    expect(canAccessUnit({ ...user, unitId: null }, 1)).toBe(false);
    expect(canAccessPeriodStatus(user, "released")).toBe(true);
    expect(canAccessPeriodStatus(user, "draft")).toBe(false);
    expect(canAccessPeriodStatus(admin, "draft")).toBe(true);
  });

  it("verlangt für TOP-übergreifende Schreibzugriffe den Blick auf alle TOPs", () => {
    const writerWithoutScope = { permissions: ["cost:write"] as Permission[], unitId: 1 };
    expect(() => authorizeGlobalWrite(writerWithoutScope, "cost:write")).toThrow(ForbiddenError);
    expect(() => authorizeGlobalWrite(admin, "cost:write")).not.toThrow();
  });
});

describe("Passwörter", () => {
  it("verifiziert das richtige und lehnt das falsche Passwort ab", async () => {
    const hash = await hashPassword("korrektes-pferd-batterie");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("korrektes");
    expect(await verifyPassword("korrektes-pferd-batterie", hash)).toBe(true);
    expect(await verifyPassword("falsches-pferd-batterie", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it("erzeugt für dasselbe Passwort unterschiedliche Hashes (Salt)", async () => {
    const [a, b] = await Promise.all([hashPassword("gleich-gleich"), hashPassword("gleich-gleich")]);
    expect(a).not.toBe(b);
  });

  it("lehnt kaputte Hashes ab, statt zu werfen", async () => {
    expect(await verifyPassword("egal", "")).toBe(false);
    expect(await verifyPassword("egal", "bcrypt$foo")).toBe(false);
    expect(await verifyPassword("egal", "scrypt$x$y$z$salt$hash")).toBe(false);
  });

  it("generiert Passwörter in gewünschter Länge ohne verwechselbare Zeichen", () => {
    const password = generatePassword(16);
    expect(password).toHaveLength(16);
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
