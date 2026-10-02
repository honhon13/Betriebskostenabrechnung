import type { Permission } from "@/auth/permissions";

/** Angemeldeter Benutzer, wie er serverseitig aus der Sitzung geladen wird. */
export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  roleKey: string;
  roleName: string;
  unitId: number | null;
  unitName: string | null;
  permissions: Permission[];
  mustChangePassword: boolean;
}

/** Welche Daten ein Benutzer sehen darf – abgeleitet aus den scope:-Rechten. */
export interface DataScope {
  /** true = alle TOPs, sonst nur `unitId`. */
  allUnits: boolean;
  unitId: number | null;
  /** true = auch nicht freigegebene Abrechnungsjahre. */
  includeDrafts: boolean;
}
