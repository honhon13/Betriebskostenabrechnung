import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import type { Metadata } from "next";

import {
  createRoleAction,
  createUserAction,
  deleteRoleAction,
  deleteUserAction,
  resetUserPasswordAction,
  updateRolePermissionsAction,
  updateUserAction,
} from "@/app/actions/settings";
import { requireUser } from "@/auth/current-user";
import { MIN_PASSWORD_LENGTH } from "@/auth/password-policy";
import { PERMISSIONS, ROLE_KEYS, type Permission } from "@/auth/permissions";
import { can } from "@/auth/rbac";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { ResetPasswordButton } from "@/components/settings/reset-password-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { NoAccess } from "@/components/ui/no-access";
import { formatDateTime } from "@/lib/format";
import { listUnits } from "@/services/masterdata.service";
import { listRoles, listUsers, type RoleDto, type UserDto } from "@/services/users.service";
import type { UnitDto } from "@/types/billing";

export const metadata: Metadata = { title: "Benutzer & Rollen" };

/** Rechte nach Bereich gruppiert – der Teil vor dem Doppelpunkt. */
const PERMISSION_GROUPS: { title: string; prefix: string }[] = [
  { title: "Dashboard", prefix: "dashboard" },
  { title: "Abrechnungsjahre", prefix: "period" },
  { title: "Kosten", prefix: "cost" },
  { title: "Einzahlungen", prefix: "payment" },
  { title: "Belege", prefix: "receipt" },
  { title: "Verwaltung", prefix: "masterdata" },
  { title: "Benutzer", prefix: "user" },
  { title: "Datenumfang", prefix: "scope" },
];

function RoleAndUnitFields({
  roles,
  units,
  user,
}: {
  roles: RoleDto[];
  units: UnitDto[];
  user?: UserDto;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Rolle" name="roleId">
        <Select name="roleId" defaultValue={user?.roleId ?? roles.find((r) => r.key === ROLE_KEYS.USER)?.id} required>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Wohneinheit" name="unitId" optional>
        <Select name="unitId" defaultValue={user?.unitId ?? ""}>
          <option value="">Keine</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export default async function UsersPage() {
  const user = await requireUser();
  if (!can(user, "user:manage")) return <NoAccess />;

  const [users, roles, units] = await Promise.all([listUsers(user), listRoles(user), listUnits(user)]);
  const permissionKeys = Object.keys(PERMISSIONS) as Permission[];

  const columns: Column<UserDto>[] = [
    {
      key: "user",
      header: "Benutzer",
      mobile: false,
      cell: (u) => (
        <>
          <span className="font-medium">{u.username}</span>
          <span className="block text-xs text-muted">{u.displayName}</span>
        </>
      ),
    },
    { key: "role", header: "Rolle", cell: (u) => u.roleName },
    { key: "unit", header: "Wohneinheit", cell: (u) => u.unitName ?? <span className="text-subtle">–</span> },
    {
      key: "status",
      header: "Status",
      cell: (u) =>
        !u.isActive ? (
          <Badge>Deaktiviert</Badge>
        ) : u.mustChangePassword ? (
          <Badge tone="warning">Initialpasswort</Badge>
        ) : (
          <Badge tone="success">Aktiv</Badge>
        ),
    },
    { key: "login", header: "Letzter Login", cell: (u) => formatDateTime(u.lastLoginAt), className: "whitespace-nowrap" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Benutzer"
          description="Zugänge mit Rolle und zugeordneter Wohneinheit."
          action={
            <FormDialog
              trigger={
                <>
                  <UserPlus aria-hidden />
                  Benutzer
                </>
              }
              triggerSize="sm"
              title="Benutzer anlegen"
              description="Das Initialpasswort muss beim ersten Login geändert werden."
              action={createUserAction}
              submitLabel="Anlegen"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Benutzername" name="username">
                  <Input name="username" autoCapitalize="none" autoComplete="off" required />
                </Field>
                <Field label="Anzeigename" name="displayName">
                  <Input name="displayName" autoComplete="off" required />
                </Field>
              </div>
              <RoleAndUnitFields roles={roles} units={units} />
              <Field
                label="Initialpasswort"
                name="password"
                hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`}
              >
                <Input name="password" type="text" autoComplete="off" required />
              </Field>
            </FormDialog>
          }
        />
        <div className="pt-3">
          <DataTable
            caption="Benutzer"
            rows={users}
            columns={columns}
            rowKey={(u) => u.id}
            mobileTitle={(u) => (
              <>
                {u.username}
                <span className="block text-xs font-normal text-muted">{u.displayName}</span>
              </>
            )}
            actions={(u) => (
              <>
                <FormDialog
                  trigger={<Pencil aria-hidden />}
                  triggerVariant="ghost"
                  triggerSize="icon"
                  triggerLabel={`${u.username} bearbeiten`}
                  title={`Benutzer ${u.username}`}
                  action={updateUserAction.bind(null, u.id)}
                >
                  <Field label="Anzeigename" name="displayName">
                    <Input name="displayName" defaultValue={u.displayName} required />
                  </Field>
                  <RoleAndUnitFields roles={roles} units={units} user={u} />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox name="isActive" defaultChecked={u.isActive} />
                    Aktiv – darf sich anmelden
                  </label>
                </FormDialog>
                <ResetPasswordButton
                  username={u.username}
                  action={resetUserPasswordAction.bind(null, u.id)}
                />
                {u.id === user.id ? null : (
                  <ConfirmAction
                    trigger={<Trash2 aria-hidden />}
                    triggerLabel={`${u.username} löschen`}
                    title="Benutzer löschen?"
                    description={
                      <>
                        Der Zugang <strong>{u.username}</strong> wird endgültig gelöscht. Erfasste
                        Daten bleiben erhalten.
                      </>
                    }
                    confirmLabel="Löschen"
                    destructive
                    action={deleteUserAction.bind(null, u.id)}
                  />
                )}
              </>
            )}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Rollen & Rechte"
          description="Eine Rolle ist ein Bündel von Rechten. Ohne die beiden Datenumfang-Rechte sieht eine Rolle nur freigegebene Daten der eigenen TOP."
          action={
            <FormDialog
              trigger={
                <>
                  <Plus aria-hidden />
                  Rolle
                </>
              }
              triggerSize="sm"
              title="Rolle anlegen"
              description="Die Rechte vergibst du danach in der Liste."
              action={createRoleAction}
              submitLabel="Anlegen"
            >
              <Field label="Name" name="name">
                <Input name="name" maxLength={40} required />
              </Field>
              <Field label="Beschreibung" name="description" optional>
                <Textarea name="description" rows={2} />
              </Field>
            </FormDialog>
          }
        />
        <CardContent className="space-y-3">
          {roles.map((role) => {
            const locked = role.key === ROLE_KEYS.ADMIN;
            return (
              <details key={role.id} className="group rounded-lg border border-border">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="font-medium">{role.name}</span>
                    {role.description ? (
                      <span className="block text-xs text-muted">{role.description}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {role.userCount} Benutzer · {role.permissions.length} Rechte
                    {role.isSystem ? <Badge>System</Badge> : null}
                  </span>
                </summary>
                <div className="border-t border-border p-3">
                  <ActionForm
                    action={updateRolePermissionsAction.bind(null, role.id)}
                    submitLabel="Rechte speichern"
                    showSuccess
                  >
                    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                      {PERMISSION_GROUPS.map((group) => (
                        <fieldset key={group.prefix} className="space-y-1.5">
                          <legend className="text-xs font-medium text-muted">{group.title}</legend>
                          {permissionKeys
                            .filter((key) => key.startsWith(`${group.prefix}:`))
                            .map((key) => (
                              <label key={key} className="flex items-start gap-2 text-sm">
                                <Checkbox
                                  name="permissions"
                                  value={key}
                                  defaultChecked={role.permissions.includes(key)}
                                  disabled={locked}
                                  className="mt-0.5"
                                />
                                {PERMISSIONS[key]}
                              </label>
                            ))}
                        </fieldset>
                      ))}
                    </div>
                    {locked ? (
                      <p className="text-xs text-subtle">
                        Die Administrator-Rolle hat immer alle Rechte und kann nicht eingeschränkt werden.
                      </p>
                    ) : null}
                  </ActionForm>
                  {role.isSystem ? null : (
                    <div className="mt-2 flex justify-end">
                      <ConfirmAction
                        trigger={
                          <>
                            <Trash2 aria-hidden />
                            Rolle löschen
                          </>
                        }
                        triggerSize="sm"
                        title="Rolle löschen?"
                        description={<>Die Rolle „{role.name}“ wird gelöscht. Das geht nur, solange sie keinem Benutzer zugewiesen ist.</>}
                        confirmLabel="Löschen"
                        destructive
                        action={deleteRoleAction.bind(null, role.id)}
                      />
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
