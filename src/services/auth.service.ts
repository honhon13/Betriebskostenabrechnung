import "server-only";

import { eq, sql } from "drizzle-orm";

import { hashPassword, needsRehash, verifyPassword } from "@/auth/password";
import { createSession, destroySession, destroyUserSessions } from "@/auth/session";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import type { SessionUser } from "@/types/auth";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const INVALID_CREDENTIALS = "Benutzername oder Passwort ist falsch.";

/** Hash eines Zufallswerts – hält die Antwortzeit gleich, wenn es den Benutzer nicht gibt. */
let dummyHash: Promise<string> | undefined;

/**
 * Prüft die Zugangsdaten und legt bei Erfolg eine Sitzung an. Nach fünf
 * Fehlversuchen wird das Konto 15 Minuten gesperrt (Schutz gegen Durchprobieren).
 */
export async function login(username: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  if (!user || !user.isActive) {
    dummyHash ??= hashPassword("timing-equalizer");
    await verifyPassword(password, await dummyHash);
    throw new DomainError(INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new DomainError(
      `Zu viele Fehlversuche. Bitte in ${LOCK_MINUTES} Minuten erneut versuchen.`,
    );
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLoginCount + 1;
    const locked = failed >= MAX_FAILED_LOGINS;
    await db
      .update(users)
      .set({
        failedLoginCount: locked ? 0 : sql`${users.failedLoginCount} + 1`,
        lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, user.id));
    throw new DomainError(INVALID_CREDENTIALS);
  }

  await db
    .update(users)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      // Hash-Parameter wurden seit dem letzten Login angehoben → still erneuern.
      ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
    })
    .where(eq(users.id, user.id));

  await createSession(user.id);
}

export async function logout(): Promise<void> {
  await destroySession();
}

/** Eigenes Passwort ändern. Alle anderen Sitzungen des Benutzers werden beendet. */
export async function changeOwnPassword(
  actor: SessionUser,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new DomainError("Das aktuelle Passwort ist falsch.");
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(users.id, actor.id));

  await destroyUserSessions(actor.id);
  await createSession(actor.id);
}
