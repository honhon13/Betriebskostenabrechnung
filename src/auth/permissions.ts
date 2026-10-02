/**
 * Rechtekatalog. Rollen sind nur Bündel dieser Rechte (Tabelle role_permissions) –
 * für eine neue Rolle genügt ein Eintrag in ROLE_DEFINITIONS bzw. in der Datenbank,
 * für ein neues Recht eine Zeile hier plus die Prüfung im jeweiligen Service.
 */
export const PERMISSIONS = {
  "dashboard:view": "Dashboard ansehen",

  "period:read": "Abrechnungen ansehen",
  "period:write": "Abrechnungsjahre anlegen und bearbeiten",
  "period:release": "Abrechnungen freigeben",
  "period:delete": "Abrechnungsjahre löschen",

  "cost:read": "Kosten ansehen",
  "cost:write": "Kosten erfassen und bearbeiten",
  "cost:delete": "Kosten löschen",

  "payment:read": "Einzahlungen ansehen",
  "payment:write": "Einzahlungen erfassen und bearbeiten",
  "payment:delete": "Einzahlungen löschen",

  "receipt:read": "Belege ansehen",
  "receipt:write": "Belege hochladen und bearbeiten",
  "receipt:delete": "Belege löschen",
  "receipt:ocr": "Belege per OCR auslesen",

  "masterdata:write": "Stammdaten pflegen (TOPs, Kostenarten, Umlageschlüssel)",
  "user:manage": "Benutzer und Rollen verwalten",

  // Datenumfang: ohne diese Rechte gilt „nur eigene TOP“ bzw. „nur freigegeben“.
  "scope:all_units": "Daten aller TOPs sehen",
  "scope:drafts": "Nicht freigegebene Abrechnungen sehen",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

export const ROLE_KEYS = { ADMIN: "ADMIN", USER: "USER" } as const;

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

/** Systemrollen – der Seed gleicht die Datenbank mit dieser Liste ab. */
export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: ROLE_KEYS.ADMIN,
    name: "Administrator",
    description: "Vollzugriff auf alle TOPs inklusive Löschen und Benutzerverwaltung.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: ROLE_KEYS.USER,
    name: "Benutzer",
    description: "Lesezugriff auf freigegebene Daten der eigenen TOP.",
    permissions: ["dashboard:view", "period:read", "cost:read", "payment:read", "receipt:read"],
  },
];
