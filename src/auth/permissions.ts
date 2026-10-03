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

  "document:read": "Dokumente ansehen",
  "document:write": "Dokumente hochladen und bearbeiten",
  "document:delete": "Dokumente löschen",
  "document:ocr": "Dokumente per OCR auslesen",

  // Einreichen: eigene Einträge erfassen, die erst nach Prüfung offiziell zählen.
  "period:submit": "Abrechnungsjahre zur Prüfung einreichen",
  "cost:submit": "Kosten zur Prüfung einreichen",
  "payment:submit": "Einzahlungen zur Prüfung einreichen",
  "document:submit": "Dokumente zur Prüfung einreichen",
  "review:manage": "Eingereichte Einträge prüfen, freigeben und ablehnen",

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
    description:
      "Liest freigegebene Daten der eigenen TOP und reicht eigene Einträge zur Prüfung ein.",
    permissions: [
      "dashboard:view",
      "period:read",
      "cost:read",
      "payment:read",
      "document:read",
      "period:submit",
      "cost:submit",
      "payment:submit",
      "document:submit",
    ],
  },
];
