import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { getDb } from "@/db/client";
import { roles, rolePermissions, sessions, units, users } from "@/db/schema";
import type { SessionUser } from "@/types/auth";

import { isPermission } from "./permissions";

export const SESSION_COOKIE = "bk_session";

const DAY_MS = 24 * 60 * 60 * 1000;

function sessionTtlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : 14) * DAY_MS;
}

/** In der Datenbank liegt nur der Hash – ein DB-Leak liefert keine gültigen Cookies. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  const db = getDb();
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent });
  // Abgelaufene Sitzungen bei der Gelegenheit aufräumen.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Beendet die aktuelle Sitzung (Logout). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Beendet alle Sitzungen eines Benutzers, z. B. nach Passwortwechsel oder Deaktivierung. */
export async function destroyUserSessions(userId: number): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Lädt den Benutzer zur Sitzung aus der Datenbank. Rolle, Rechte und Aktiv-Status
 * werden bei jedem Request frisch gelesen – Änderungen wirken also sofort.
 */
export async function readSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      mustChangePassword: users.mustChangePassword,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
      unitId: units.id,
      unitName: units.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .leftJoin(units, eq(units.id, users.unitId))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!row) return null;

  const permissionRows = await db
    .select({ permission: rolePermissions.permission })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, row.roleId));

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    roleKey: row.roleKey,
    roleName: row.roleName,
    unitId: row.unitId,
    unitName: row.unitName,
    mustChangePassword: row.mustChangePassword,
    // Unbekannte Einträge (z. B. aus einer älteren Version) werden ignoriert.
    permissions: permissionRows.map((r) => r.permission).filter(isPermission),
  };
}
