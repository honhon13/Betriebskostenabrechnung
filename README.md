# Betriebskostenabrechnung

Private Betriebskostenabrechnung für drei Wohneinheiten (TOP 1–3): Kosten erfassen, nach
Umlageschlüsseln verteilen, Einzahlungen verbuchen, Belege ablegen und die Abrechnung je
TOP freigeben.

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Drizzle ORM · Neon PostgreSQL ·
deploybar auf Vercel.

## Lokal starten

```bash
npm install
cp .env.example .env.local   # DATABASE_URL und DATABASE_URL_UNPOOLED eintragen
npm run db:migrate           # Schema anlegen
npm run db:seed              # Rollen, TOP 1–3, Benutzer, Kostenarten, Umlageschlüssel
npm run db:seed:demo         # optional: Beispieldaten (nur für Entwicklung)
npm run dev                  # http://localhost:3000
```

Der Seed legt die Benutzer `top1`, `top2` (ADMIN) und `top3` an. Ohne `SEED_PASSWORD_TOP1…3`
erzeugt er Zufallspasswörter und gibt sie **einmalig** aus; sie müssen beim ersten Login
geändert werden. Der Seed ist idempotent und überschreibt keine bestehenden Passwörter.

## Rollen und Sichtbarkeit

| Benutzer | Rolle | Darf |
| --- | --- | --- |
| `top2` | ADMIN | Alles: Kosten, Einzahlungen, Belege, Freigabe, Löschen, Stammdaten, Benutzer |
| `top1`, `top3` | USER | Nur lesen – und nur **freigegebene** Daten der **eigenen** TOP |

Eine Abrechnung ist zunächst ein **Entwurf** und nur für die Verwaltung sichtbar. Mit
„Freigeben" sehen die TOPs ihren Kostenanteil, ihre Einzahlungen und die Belege zu den
Kostenpositionen, an denen sie beteiligt sind. Freigegebene Jahre sind gegen Änderungen an
Kosten und Umlageschlüsseln gesperrt („Freigabe zurücknehmen" hebt das auf).

Rollen sind Bündel von Rechten und lassen sich unter *Einstellungen → Benutzer & Rollen*
anpassen oder neu anlegen. Zwei Rechte steuern den Datenumfang:

- `scope:all_units` – Daten aller TOPs statt nur der eigenen
- `scope:drafts` – auch nicht freigegebene Abrechnungsjahre

## Architektur

```
src/
  app/           Seiten, Layouts, Route Handler und Server Actions (app/actions)
  components/    UI-Bausteine (ui, forms, layout) und Fachkomponenten
  auth/          Passwort-Hashing, Sitzungen, Rechtekatalog, RBAC-Prüfungen
  services/      Fachlogik mit Rechteprüfung – einziger Weg zur Datenbank
    storage/     Ablage der Belegdateien (lokal, Vercel Blob)
    ocr/         OCRService (Azure Document Intelligence)
  db/            Drizzle-Schema, Migrationen, Seed
  lib/           Reine Hilfsfunktionen: Verteilung, Beträge, Validierung, Formate
  types/         DTOs zwischen Services und Oberfläche
tests/           Unit-Tests (Vitest)
e2e/             End-to-End-Tests (Playwright)
```

**Zugriffskontrolle** passiert serverseitig an drei Stellen, von außen nach innen:

1. `src/proxy.ts` leitet Besucher ohne Sitzungs-Cookie zum Login (nur Vorfilter).
2. Jede Seite, Server Action und jeder Route Handler lädt den Benutzer aus der
   Datenbank-Sitzung (`src/auth/current-user.ts`).
3. Jede Service-Funktion beginnt mit `authorize(actor, "<recht>")` und filtert Daten nach
   dem Datenumfang des Benutzers. Die Oberfläche blendet Schaltflächen nur aus – verbindlich
   ist der Service. `tests/service-authorization.test.ts` prüft das für jede schreibende
   Funktion.

**Sicherheit:** Passwörter als scrypt-Hash (N=2¹⁷, Parameter im Hash gespeichert), Sitzungen
als zufälliges Token im httpOnly-Cookie, in der Datenbank liegt nur dessen SHA-256. Fünf
Fehlversuche sperren ein Konto für 15 Minuten. Passwortwechsel und -reset beenden alle
Sitzungen des Benutzers.

**Beträge** werden in Cent gespeichert und gerechnet. Die Verteilung nutzt das Verfahren der
größten Reste – die Summe der Anteile entspricht immer exakt dem Betrag.

### Erweitern

| Vorhaben | Wo |
| --- | --- |
| Neues Recht | Eintrag in `src/auth/permissions.ts`, Prüfung im Service |
| Neue Rolle | In der Oberfläche anlegen oder `ROLE_DEFINITIONS` ergänzen |
| Neuer Umlageschlüssel | *Einstellungen → Stammdaten* (Werte je Abrechnungsjahr) |
| Anderer Datei-Speicher | Klasse mit `StorageService` + Eintrag in `services/storage/index.ts` |
| Anderer OCR-Anbieter | Klasse mit `OCRService` + `services/ocr/index.ts` |
| Schemaänderung | `src/db/schema.ts` ändern → `npm run db:generate` → `npm run db:migrate` |

## Belege und OCR

Dateien liegen nie in PostgreSQL – die Tabelle `receipts` speichert nur Anbieter und
Schlüssel. Jeder Abruf läuft über `/api/belege/[id]/datei` und wird dort gegen Sitzung, Rechte
und Sichtbereich geprüft. Erlaubt sind PDF, JPEG, PNG, WebP, HEIC und TIFF bis 4 MB; der Typ
wird am Dateiinhalt erkannt. Größere Fotos verkleinert der Browser vor dem Upload.

| `STORAGE_DRIVER` | Verwendung |
| --- | --- |
| `local` | Dateisystem unter `.data/uploads` – nur lokale Entwicklung |
| `vercel-blob` | Privater Vercel-Blob-Store, benötigt `BLOB_READ_WRITE_TOKEN` |

OCR ist vorbereitet und wird aktiv, sobald `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` und
`AZURE_DOCUMENT_INTELLIGENCE_KEY` gesetzt sind. Dann erscheint bei jedem Beleg „per OCR
auslesen": Datum, Rechnungsnummer, Lieferant und Betrag werden mit dem Modell
`prebuilt-invoice` erkannt und füllen leere Metadaten-Felder.

## Deployment auf Vercel

1. Repository in Vercel importieren (Framework wird erkannt, Region `fra1` steht in
   `vercel.json` – passend zur Neon-Region Frankfurt).
2. Unter *Storage* die Neon-Datenbank mit dem Projekt verbinden. Die Integration setzt
   `DATABASE_URL` und `DATABASE_URL_UNPOOLED` automatisch.
3. Unter *Storage* einen **privaten** Blob-Store anlegen und verbinden
   (`BLOB_READ_WRITE_TOKEN`). Ohne ihn sind Uploads auf Vercel deaktiviert.
4. Optional die Azure-Variablen für OCR setzen.
5. Deployen. Migrationen laufen bewusst nicht automatisch beim Build, sondern mit
   `npm run db:migrate` gegen die Produktionsdatenbank.

Alle Variablen sind in [.env.example](.env.example) beschrieben.

## Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` / `build` / `start` | Entwicklung, Produktions-Build, Produktionsserver |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm test` | Unit-Tests: Verteilung, Beträge, RBAC, Passwörter, Service-Rechte |
| `npm run test:e2e` | Build + Playwright (Desktop und Mobil) gegen die DB aus `.env.local` |
| `npm run db:generate` | Migration aus Schemaänderungen erzeugen |
| `npm run db:migrate` | Migrationen ausführen |
| `npm run db:seed` / `db:seed:demo` | Grunddaten / Beispieldaten |
| `npm run db:studio` | Drizzle Studio |

Migration und Seed verwenden `DATABASE_URL_UNPOOLED`. Eine in der Shell gesetzte Variable
hat Vorrang vor `.env.local` – so lässt sich das Ziel pro Aufruf wählen.

Die End-to-End-Tests schreiben in die Datenbank und setzen das laufende Abrechnungsjahr auf
„Entwurf" zurück. Sie gehören auf einen Entwicklungs-Branch, nie auf die Produktionsdatenbank.
