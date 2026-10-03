import "server-only";

import { eq, sql } from "drizzle-orm";

import { hashPassword, needsRehash, verifyPassword } from "@/auth/password";
import {
  createSession,
  destroySession,
  destroyUserSessions,
  readSessionUser,
} from "@/auth/session";
import { getDb } from "@/db/client";
import { units, users } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import type { SessionUser } from "@/types/auth";

import { recordAudit, type AuditActor } from "./audit.service";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const INVALID_CREDENTIALS = "Benutzername oder Passwort ist falsch.";

/** Hash eines Zufallswerts – hält die Antwortzeit gleich, wenn es den Benutzer nicht gibt. */
let dummyHash: Promise<string> | undefined;

/** Benutzername und TOP eines Kontos fürs Audit-Log – beim Login gibt es noch keine Sitzung. */
async function auditActorOf(user: typeof users.$inferSelect): Promise<AuditActor> {
  const [unit] =
    user.unitId === null
      ? []
      : await getDb().select({ name: units.name }).from(units).where(eq(units.id, user.unitId)).limit(1);
  return { id: user.id, username: user.username, unitName: unit?.name ?? null };
}

/**
 * Prüft die Zugangsdaten und legt bei Erfolg eine Sitzung an. Nach fünf
 * Fehlversuchen wird das Konto 15 Minuten gesperrt (Schutz gegen Durchprobieren).
 *
 * Protokolliert werden Anmeldungen und falsche Passwörter zu bestehenden Konten. Versuche
 * mit unbekanntem Benutzernamen oder während einer Sperre bleiben außen vor: sie lassen sich
 * beliebig oft wiederholen und würden das Protokoll fluten.
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
    await recordAudit(await auditActorOf(user), {
      action: "auth.login_failed",
      entity: { type: "user", id: user.id },
      summary: `Benutzer ${user.username}`,
      details: {
        note: locked
          ? `Falsches Passwort – Konto nach ${MAX_FAILED_LOGINS} Fehlversuchen für ${LOCK_MINUTES} Minuten gesperrt.`
          : `Falsches Passwort (Fehlversuch ${failed} von ${MAX_FAILED_LOGINS}).`,
      },
    });
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
  await recordAudit(await auditActorOf(user), {
    action: "auth.login",
    entity: { type: "user", id: user.id },
    summary: `Benutzer ${user.username}`,
  });
}

export async function logout(): Promise<void> {
  // Vor dem Beenden lesen: danach gibt es keine Sitzung mehr, aus der der Benutzer hervorgeht.
  const user = await readSessionUser();
  await destroySession();
  if (user) {
    await recordAudit(user, {
      action: "auth.logout",
      entity: { type: "user", id: user.id },
      summary: `Benutzer ${user.username}`,
    });
  }
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
  await recordAudit(actor, {
    action: "auth.password_changed",
    entity: { type: "user", id: actor.id },
    summary: `Benutzer ${actor.username}`,
    details: { note: "Eigenes Passwort geändert – andere Sitzungen beendet." },
  });
}
