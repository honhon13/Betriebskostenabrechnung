import "server-only";

import { and, asc, count, eq, ne } from "drizzle-orm";

import { generatePassword, hashPassword } from "@/auth/password";
import { isPermission, PERMISSIONS, ROLE_KEYS, type Permission } from "@/auth/permissions";
import { authorize } from "@/auth/rbac";
import { destroyUserSessions } from "@/auth/session";
import { getDb, type DbExecutor } from "@/db/client";
import { rolePermissions, roles, sessions, units, users } from "@/db/schema";
import { diffSnapshots, snapshotValues } from "@/lib/audit";
import { DomainError, NotFoundError } from "@/lib/errors";
import type { UserCreateInput, UserUpdateInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";

import { describeUser } from "./audit-snapshots";
import { recordAudit } from "./audit.service";

export interface UserDto {
  id: number;
  username: string;
  displayName: string;
  roleId: number;
  roleName: string;
  unitId: number | null;
  unitName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface RoleDto {
  id: number;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
}

// ---------------------------------------------------------------------------
// Benutzer
// ---------------------------------------------------------------------------

export async function listUsers(actor: SessionUser): Promise<UserDto[]> {
  authorize(actor, "user:manage");
  const rows = await getDb()
    .select({ user: users, roleName: roles.name, unitName: units.name })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .leftJoin(units, eq(units.id, users.unitId))
    .orderBy(asc(users.username));

  // Der Passwort-Hash verlässt den Service nie.
  return rows.map(({ user, roleName, unitName }) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roleId: user.roleId,
    roleName,
    unitId: user.unitId,
    unitName,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }));
}

async function assertRoleAndUnit(
  tx: DbExecutor,
  roleId: number,
  unitId: number | null,
): Promise<void> {
  const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new DomainError("Die Rolle wurde nicht gefunden.");
  if (unitId !== null) {
    const [unit] = await tx.select({ id: units.id }).from(units).where(eq(units.id, unitId)).limit(1);
    if (!unit) throw new DomainError("Die TOP wurde nicht gefunden.");
  }
}

/**
 * Es muss immer mindestens ein aktiver Benutzer übrig bleiben, der Benutzer
 * verwalten darf – sonst sperrt sich die Verwaltung selbst aus.
 */
async function assertUserManagerRemains(tx: DbExecutor): Promise<void> {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(users)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, users.roleId))
    .where(and(eq(users.isActive, true), eq(rolePermissions.permission, "user:manage")));
  if (n === 0) {
    throw new DomainError("Mindestens ein aktiver Administrator muss erhalten bleiben.");
  }
}

export async function createUser(actor: SessionUser, input: UserCreateInput): Promise<void> {
  authorize(actor, "user:manage");
  const passwordHash = await hashPassword(input.password);

  await getDb().transaction(async (tx) => {
    await assertRoleAndUnit(tx, input.roleId, input.unitId);
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1);
    if (existing) throw new DomainError("Dieser Benutzername ist bereits vergeben.");

    const [row] = await tx
      .insert(users)
      .values({
        username: input.username,
        displayName: input.displayName,
        roleId: input.roleId,
        unitId: input.unitId,
        passwordHash,
        // Das Initialpasswort kennt die Verwaltung – beim ersten Login wird es ersetzt.
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    const created = await describeUser(tx, row.id);
    if (created) {
      await recordAudit(
        actor,
        {
          action: "user.created",
          entity: { type: "user", id: row.id },
          summary: created.summary,
          details: { values: snapshotValues(created.snapshot) },
        },
        tx,
      );
    }
  });
}

export async function updateUser(
  actor: SessionUser,
  userId: number,
  input: UserUpdateInput,
): Promise<void> {
  authorize(actor, "user:manage");

  await getDb().transaction(async (tx) => {
    await assertRoleAndUnit(tx, input.roleId, input.unitId);
    const before = await describeUser(tx, userId);
    const [row] = await tx
      .update(users)
      .set({
        displayName: input.displayName,
        roleId: input.roleId,
        unitId: input.unitId,
        isActive: input.isActive,
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!row) throw new NotFoundError("Der Benutzer wurde nicht gefunden.");

    // Deaktivierte Benutzer verlieren sofort ihre Sitzungen.
    if (!input.isActive) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await assertUserManagerRemains(tx);

    const after = await describeUser(tx, userId);
    if (before && after) {
      await recordAudit(
        actor,
        {
          action: "user.updated",
          entity: { type: "user", id: userId },
          summary: after.summary,
          details: { changes: diffSnapshots(before.snapshot, after.snapshot) },
        },
        tx,
      );
    }
  });
}

/** Setzt ein neues Zufallspasswort und gibt es einmalig zurück. */
export async function resetUserPassword(actor: SessionUser, userId: number): Promise<string> {
  authorize(actor, "user:manage");
  const password = generatePassword();

  const [row] = await getDb()
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id, username: users.username });
  if (!row) throw new NotFoundError("Der Benutzer wurde nicht gefunden.");

  await destroyUserSessions(userId);
  await recordAudit(actor, {
    action: "user.password_reset",
    entity: { type: "user", id: userId },
    summary: `Benutzer ${row.username}`,
    details: { note: "Neues Initialpasswort gesetzt – alle Sitzungen des Benutzers beendet." },
  });
  return password;
}

export async function deleteUser(actor: SessionUser, userId: number): Promise<void> {
  authorize(actor, "user:manage");
  if (userId === actor.id) throw new DomainError("Du kannst dein eigenes Konto nicht löschen.");

  await getDb().transaction(async (tx) => {
    const deleted = await describeUser(tx, userId);
    const [row] = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    if (!row) throw new NotFoundError("Der Benutzer wurde nicht gefunden.");
    await assertUserManagerRemains(tx);

    if (deleted) {
      await recordAudit(
        actor,
        {
          action: "user.deleted",
          entity: { type: "user", id: userId },
          summary: deleted.summary,
          details: { values: snapshotValues(deleted.snapshot) },
        },
        tx,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Rollen
// ---------------------------------------------------------------------------

export async function listRoles(actor: SessionUser): Promise<RoleDto[]> {
  authorize(actor, "user:manage");
  const db = getDb();
  const [roleRows, permissionRows, userCounts] = await Promise.all([
    db.select().from(roles).orderBy(asc(roles.id)),
    db.select().from(rolePermissions),
    db.select({ roleId: users.roleId, n: count() }).from(users).groupBy(users.roleId),
  ]);

  return roleRows.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: permissionRows
      .filter((p) => p.roleId === role.id)
      .map((p) => p.permission)
      .filter(isPermission),
    userCount: userCounts.find((c) => c.roleId === role.id)?.n ?? 0,
  }));
}

/** Ersetzt die Rechte einer Rolle. Die Administrator-Rolle behält immer alle Rechte. */
export async function updateRolePermissions(
  actor: SessionUser,
  roleId: number,
  permissions: string[],
): Promise<void> {
  authorize(actor, "user:manage");
  const valid = [...new Set(permissions.filter(isPermission))];

  await getDb().transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw new NotFoundError("Die Rolle wurde nicht gefunden.");
    if (role.key === ROLE_KEYS.ADMIN) {
      throw new DomainError("Die Administrator-Rolle hat immer alle Rechte.");
    }

    const previous = await tx
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    const before = new Set(previous.map((row) => row.permission).filter(isPermission));

    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (valid.length > 0) {
      await tx.insert(rolePermissions).values(valid.map((permission) => ({ roleId, permission })));
    }
    await assertUserManagerRemains(tx);

    const granted = valid.filter((permission) => !before.has(permission));
    const revoked = [...before].filter((permission) => !valid.includes(permission));
    if (granted.length + revoked.length > 0) {
      await recordAudit(
        actor,
        {
          action: "role.permissions_updated",
          entity: { type: "role", id: roleId },
          summary: `Rolle ${role.name}`,
          details: {
            changes: [
              ...granted.map((permission) => ({ field: PERMISSIONS[permission], from: "Nein", to: "Ja" })),
              ...revoked.map((permission) => ({ field: PERMISSIONS[permission], from: "Ja", to: "Nein" })),
            ],
          },
        },
        tx,
      );
    }
  });
}

export async function createRole(
  actor: SessionUser,
  input: { name: string; description: string | null },
): Promise<void> {
  authorize(actor, "user:manage");
  const key = input.name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
  if (!key) throw new DomainError("Bitte einen Namen mit Buchstaben oder Ziffern angeben.");

  const db = getDb();
  const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  if (existing) throw new DomainError("Eine Rolle mit diesem Namen gibt es bereits.");

  const [row] = await db
    .insert(roles)
    .values({ key, name: input.name, description: input.description })
    .returning({ id: roles.id });
  await recordAudit(actor, {
    action: "role.created",
    entity: { type: "role", id: row.id },
    summary: `Rolle ${input.name}`,
    details: input.description
      ? { values: [{ field: "Beschreibung", value: input.description }] }
      : undefined,
  });
}

export async function deleteRole(actor: SessionUser, roleId: number): Promise<void> {
  authorize(actor, "user:manage");
  const db = getDb();
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new NotFoundError("Die Rolle wurde nicht gefunden.");
  if (role.isSystem) throw new DomainError("Systemrollen können nicht gelöscht werden.");

  const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.roleId, roleId));
  if (n > 0) throw new DomainError(`Die Rolle ist noch ${n} Benutzer(n) zugewiesen.`);

  await db.delete(roles).where(and(eq(roles.id, roleId), ne(roles.isSystem, true)));
  await recordAudit(actor, {
    action: "role.deleted",
    entity: { type: "role", id: roleId },
    summary: `Rolle ${role.name}`,
  });
}
