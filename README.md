# Betriebskostenabrechnung

Private Betriebskostenabrechnung für drei Wohneinheiten (TOP 1–3): Kosten erfassen, nach
Umlageschlüsseln verteilen, Einzahlungen verbuchen, Dokumente ablegen und die Abrechnung je
TOP freigeben. Die TOPs reichen eigene Einträge ein, die Verwaltung prüft sie.

| Bereich | Inhalt |
| --- | --- |
| **Dashboard** | Abrechnungsperiode, Gesamtkosten, Kostenverlauf (Diagramm je Monat oder Jahr), Kosten/Einzahlungen/Differenz je TOP, offene Positionen, letzte Dokumente und Aktivitäten |
| **Abrechnung** | Jahresübersicht; je Jahr: Gesamtsummen, Kostenverteilung, Abrechnung je TOP mit Kostenpositionen und Belegen, Kosten, Monatsübersicht, Umlageschlüssel, Dokumente |
| **Einzahlungen** | Je TOP mit Datum, Betrag, Jahr, Beschreibung, Zahlungsstatus und Nachweis; Guthaben/Nachzahlung je TOP |
| **Dokumente** | Rechnungen, Zahlungsnachweise, Verträge, Sonstiges – mit Suche, Filtern, Sortierung, Vorschau und Download |
| **Meine Eingaben** (USER) | Kosten, Einzahlungen, Dokumente und Abrechnungsjahre einreichen; Prüfstand und Kommentar der Verwaltung sehen |
| **Prüfung** (ADMIN) | Eingereichte Einträge ansehen, freigeben, ablehnen, bearbeiten oder löschen |
| **Einstellungen** | Konto, Stammdaten (TOPs, Kostenarten, Umlageschlüssel), Benutzer und Rollen |

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Drizzle ORM · Neon PostgreSQL ·
deploybar auf Vercel.

## Einträge anlegen

Oben rechts in Dashboard, Abrechnung, Einzahlungen, Dokumente und „Meine Eingaben" steht die
Schaltfläche **Hinzufügen**. Sie bietet an, was der angemeldete Benutzer anlegen darf – die
Aktion des jeweiligen Bereichs zuerst, auf dem Handy als Auswahl von unten:

| Verwaltung (ADMIN) – legt direkt an | Benutzer (USER) – reicht zur Prüfung ein |
| --- | --- |
| Kostenposition hinzufügen | Kosten einreichen |
| Einzahlung hinzufügen | Einzahlung einreichen |
| Dokument hochladen | Dokument einreichen |
| Abrechnungsjahr hinzufügen | Abrechnungsjahr vorschlagen |

- **Beliebig viele Einträge.** Jeder Eintrag ist ein eigener Datensatz; Anlegen überschreibt nie
  etwas Vorhandenes. Mit „Weiteren Eintrag anlegen" bleibt der Dialog für den nächsten offen.
- **Sofort sichtbar.** Die Ansicht aktualisiert sich nach dem Speichern. Reichen USER außerhalb
  von „Meine Eingaben" ein, führt der Dialog danach dorthin.
- **Mehrere Dokumente.** Der Upload-Dialog nimmt mehrere Dateien auf einmal und bleibt nach jedem
  Upload offen; er führt Buch, was gespeichert wurde und was nicht.
- **Beleg zuerst.** Im Kostenformular steht der Beleg-Upload ganz oben, vor den Eingabefeldern,
  und ist wie der Upload-Dialog aufgebaut: fotografieren oder Dateien wählen, die OCR füllt die
  Felder, prüfen, speichern (siehe „Beleg im Kostenformular").
- **Beleg fotografieren.** Auf Handy und Tablet öffnet die Schaltfläche im Kostenformular und im
  Upload-Dialog direkt die Kamera; das Foto wird sofort gespeichert und ausgelesen.
- **Was nicht geht, steht mit Begründung im Menü.** Kosten lassen sich nur in Jahren im Entwurf
  anlegen – ist jedes Jahr freigegeben, erklärt der Eintrag das, statt zu verschwinden.

Zwei Grenzen sind gewollt: Je Jahr gibt es genau eine Abrechnung, und dieselbe Datei lässt sich
je Abrechnungsjahr nur einmal hochladen (Schutz vor versehentlichen Doppel-Uploads).

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
| `top2` | ADMIN | Alles: Kosten, Einzahlungen, Dokumente, Prüfung, Freigabe, Löschen, Stammdaten, Benutzer |
| `top1`, `top3` | USER | **Freigegebene** Daten der **eigenen** TOP lesen; eigene Einträge einreichen und ändern – nichts löschen |

Eine Abrechnung ist zunächst ein **Entwurf** und nur für die Verwaltung sichtbar. Mit
„Freigeben" sehen die TOPs ihren Kostenanteil, ihre Einzahlungen und die Dokumente, die sie
betreffen. Freigegebene Jahre sind gegen Änderungen an Kosten und Umlageschlüsseln gesperrt
(„Freigabe zurücknehmen" hebt das auf).

Ein Dokument betrifft eine TOP, wenn es ihr direkt zugeordnet ist, an einer Kostenposition
hängt, an der sie beteiligt ist, oder an einer ihrer Einzahlungen. Dokumente ohne jede
Zuordnung sieht nur die Verwaltung. Dieselbe Regel gilt für Liste, Vorschau und Download.

Rollen sind Bündel von Rechten und lassen sich unter *Einstellungen → Benutzer & Rollen*
anpassen oder neu anlegen. Zwei Rechte steuern den Datenumfang:

- `scope:all_units` – Daten aller TOPs statt nur der eigenen
- `scope:drafts` – auch nicht freigegebene Abrechnungsjahre

### Einreichen und Prüfen

USER erfassen unter **Meine Eingaben** Kostenpositionen, Einzahlungen, Dokumente und neue
Abrechnungsjahre. Jeder dieser Einträge erhält den Prüfstand **Ausstehende Prüfung** und zählt
erst nach der Freigabe durch die Verwaltung:

| Prüfstand | Bedeutung |
| --- | --- |
| Ausstehende Prüfung | Eingereicht oder nach der Freigabe geändert – zählt nicht |
| Freigegeben | Von der Verwaltung bestätigt – zählt in Abrechnung, Salden und Auswertungen |
| Abgelehnt | Zählt nicht; der Kommentar der Verwaltung steht beim Eintrag |

- **Offiziell zählt nur Freigegebenes.** Abrechnung, Salden, Monats- und Jahresübersicht,
  Kostenverlauf und Dashboard-Kennzahlen rechnen ausschließlich mit freigegebenen Einträgen.
  Wer eingereicht hat, sieht den eigenen Eintrag samt Prüfstand; andere TOPs sehen ihn erst
  nach der Freigabe (und wie bisher nur, wenn das Jahr freigegeben ist und er sie betrifft).
- **Änderungen werden erneut geprüft.** Ändert ein USER einen bereits freigegebenen eigenen
  Eintrag, fällt er auf „Ausstehende Prüfung" zurück und zählt bis zur erneuten Freigabe nicht.
- **Prüfung** (nur ADMIN): freigeben oder ablehnen, jeweils mit optionalem Kommentar. Mit einer
  Kostenposition oder Einzahlung werden ihre noch ungeprüften Belege mit freigegeben. Einträge
  der Verwaltung entstehen direkt freigegeben; bearbeitet die Verwaltung einen eingereichten
  Eintrag, ändert das den Prüfstand nicht.
- **Kosten** reichen USER ohne Umlageschlüssel und TOP-Zuordnung ein. Vorbelegt wird der
  Standardschlüssel der Kostenart über alle TOPs; die Verwaltung passt beides bei der Prüfung
  an. Eingereicht wird in Jahre im Entwurf – eine Kostenposition lässt sich nicht in eine
  bereits veröffentlichte Abrechnung freigeben.
- **Einzahlungen und Dokumente** gelten immer für die eigene TOP; verknüpfen lassen sich
  Dokumente nur mit eigenen Einträgen.
- **Löschen** darf ausschließlich die Verwaltung – das gilt für Abrechnungsjahre ebenso wie
  für Kosten, Einzahlungen und Dokumente.

Die Rechte dazu: `period:submit`, `cost:submit`, `payment:submit`, `document:submit`
(einreichen) und `review:manage` (prüfen). Prüfstand, Prüfdatum, Prüfer und Kommentar stehen
in den Spalten `review_status`, `reviewed_at`, `reviewed_by` und `review_comment`.

### Kostenverlauf

Das Diagramm im Dashboard zeigt die Kosten (€, Y-Achse) über den Zeitraum (X-Achse) –
wahlweise je Monat eines Abrechnungsjahres oder je Jahr im Vergleich aller Jahre. Es wird bei
jedem Aufruf aus den gespeicherten, freigegebenen Kosten berechnet. Die Verwaltung sieht die
Gesamtkosten gestapelt nach TOP (noch nicht verteilte Beträge eigens ausgewiesen), USER ihren
eigenen Anteil in freigegebenen Jahren. Unter „Werte als Tabelle" stehen dieselben Zahlen.

## Architektur

```
src/
  app/           Seiten, Layouts, Route Handler und Server Actions (app/actions);
                 favicon.ico (16/32/48 px), icon.png (192 px) und apple-icon.png (180 px)
                 sind das App-Icon – Next.js bindet sie über die Datei-Konvention ein
  components/    UI-Bausteine (ui, forms, layout) und Fachkomponenten
  auth/          Passwort-Hashing, Sitzungen, Rechtekatalog, RBAC-Prüfungen
  services/      Fachlogik mit Rechteprüfung – einziger Weg zur Datenbank
    ocr/         OCRService (Azure Document Intelligence)
  db/            Drizzle-Schema, Migrationen, Seed
  lib/           Reine Hilfsfunktionen: Verteilung, Monatsübersicht, Beträge, Validierung
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

**Berechnung:** Einzahlungen − Kostenanteil = Guthaben (positiv) bzw. Nachzahlung (negativ).
Es zählen nur Einzahlungen mit Status „Eingegangen"; „Offen" merkt eine erwartete Zahlung vor,
„Storniert" zählt nirgends. Die Monatsübersicht ordnet Kosten nach Rechnungsdatum und
Einzahlungen nach Zahlungsdatum zu; was in keinen Monat des Jahres fällt, steht in einer
Sammelzeile, damit die Jahressummen mit der Abrechnung übereinstimmen.

### Datenmodell

| Tabelle | Inhalt |
| --- | --- |
| `users`, `roles`, `role_permissions`, `sessions` | Benutzer, Rollen, Rechte, Sitzungen |
| `units` | TOPs mit Wohnfläche und Personen |
| `billing_periods` | Abrechnungsjahre mit Status Entwurf/Freigegeben und Prüfstand |
| `cost_categories`, `allocation_keys`, `allocation_values` | Kostenarten, Umlageschlüssel und deren Werte je Jahr und TOP |
| `costs`, `cost_units` | Kostenpositionen mit Rechnungsdaten (Rechnungssteller, Nummer, Datum, Leistungszeitraum, Netto, MwSt., Brutto) und ihre TOP-Zuordnung |
| `payments` | Einzahlungen je TOP mit Zahlungsstatus |
| `documents`, `document_files`, `document_links` | Dokumente (Metadaten), ihr Dateiinhalt und ihre Verknüpfungen mit Kostenpositionen und Einzahlungen |

`billing_periods`, `costs`, `payments` und `documents` tragen jeweils Prüfstand, Prüfdatum,
Prüfer und Kommentar.

### Erweitern

| Vorhaben | Wo |
| --- | --- |
| Neues Recht | Eintrag in `src/auth/permissions.ts`, Prüfung im Service |
| Neue Rolle | In der Oberfläche anlegen oder `ROLE_DEFINITIONS` ergänzen |
| Neuer Umlageschlüssel | *Einstellungen → Stammdaten* (Werte je Abrechnungsjahr) |
| Neue „Hinzufügen"-Aktion | Funktion in `ADD_ACTIONS` (`src/components/add/add-button.tsx`): Recht prüfen, Formular in `AddFormDialog` zurückgeben |
| Anderer OCR-Anbieter | Klasse mit `OCRService` + `services/ocr/index.ts` |
| Schemaänderung | `src/db/schema.ts` ändern → `npm run db:generate` → `npm run db:migrate` |

## Dokumente und OCR

Dokumente liegen vollständig in der Neon-Datenbank – es gibt keinen externen Dateispeicher.
`documents` hält die Metadaten, `document_files` den Dateiinhalt (bytea). Die Trennung sorgt
dafür, dass Listen und Auswertungen nie Dateien mitladen; gelesen wird der Inhalt nur für
Vorschau, Download und OCR. Upload und Löschen sind je eine Transaktion: Metadaten, Datei und
Verknüpfungen entstehen bzw. verschwinden gemeinsam.

Jeder Abruf läuft über `/api/dokumente/[id]/datei` und wird dort gegen Sitzung, Rechte und
Sichtbereich geprüft. Erlaubt sind PDF, JPEG, PNG, WebP, HEIC und TIFF bis 4 MB (Grenze der
Vercel Functions); der Typ wird am Dateiinhalt erkannt. Größere Fotos verkleinert der Browser
vor dem Upload.

Dokumente lassen sich an drei Stellen hochladen: über „Hinzufügen → Dokument hochladen", direkt
beim Anlegen einer Kostenposition (als Rechnung) und bei einer Einzahlung (als Zahlungsnachweis).
Ein Dokument kann mit mehreren Kostenpositionen verknüpft sein, z. B. eine Vorschreibung, die
auf mehrere Positionen aufgeteilt wurde.

Die Dateien zählen zum Speicherplatz der Datenbank. Der kostenlose Neon-Plan erlaubt rund
1 GB je Branch – bei 4 MB je Datei also mindestens etwa 250 Dokumente, bei typischen
PDF-Rechnungen deutlich mehr.

### OCR mit Azure Document Intelligence

Sobald `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` und `AZURE_DOCUMENT_INTELLIGENCE_KEY` gesetzt
sind, wird jedes Dokument beim Hochladen automatisch ausgelesen (Modell `prebuilt-invoice`,
REST-API `2024-11-30`). Die Zugangsdaten kommen ausschließlich aus Umgebungsvariablen.

1. Datei, Typ und Abrechnungsjahr wählen und „Hochladen und auslesen" klicken. Das Häkchen
   „Automatisch per OCR auslesen" ist vorbelegt und lässt sich je Upload abwählen.
2. Das Original wird unverändert gespeichert, danach läuft die OCR.
3. Der Dialog zeigt die erkannten Werte direkt in den Formularfeldern: Rechnungssteller,
   Rechnungsnummer, Rechnungsdatum, Leistungszeitraum, Betrag netto, MwSt., Betrag brutto
   und Beschreibung (aus den Rechnungspositionen). Nicht erkannte Felder bleiben leer.
4. Werte prüfen, korrigieren oder ergänzen und speichern – danach steht der Dialog wieder beim
   Upload, bereit für das nächste Dokument.

Bei mehreren Dateien auf einmal gelten Typ, Abrechnungsjahr und Verknüpfungen für alle. Jede
Datei wird einzeln gespeichert und ausgelesen; der Prüfschritt entfällt, die erkannten Werte
stehen in der Liste und lassen sich dort bearbeiten.

Was man selbst eingetragen hat, überschreibt die OCR nie – sie füllt nur leere Felder. Das
vollständige OCR-Ergebnis (erkannte Werte, Rohfelder mit Erkennungssicherheit, Anbieter und
Modell) steht in `documents.ocr_result`; die übernommenen Werte in den jeweiligen Spalten.

| OCR-Status | Bedeutung |
| --- | --- |
| Offen | Noch nicht ausgelesen (OCR abgewählt, nicht eingerichtet oder abgebrochen) |
| Verarbeitet | Auswertung abgeschlossen – auch wenn nichts erkannt wurde |
| Fehler | Auswertung gescheitert; der Grund steht am Dokument (`ocr_error`) |

Ein OCR-Fehler lässt den Upload nicht scheitern: Das Dokument ist gespeichert, die Felder
lassen sich von Hand ausfüllen, und über die Schaltfläche „per OCR auslesen" kann man es
später erneut versuchen. Gemeldet werden u. a. nicht lesbare oder passwortgeschützte Dateien,
Formate, die Azure nicht annimmt (WebP), ungültige Zugangsdaten, ein erschöpftes Kontingent
und Zeitüberschreitungen. Der kostenlose Azure-Tarif (F0) liest nur die ersten zwei Seiten
und Dateien bis 4 MB.

### Beleg im Kostenformular

Der Beleg-Upload steht im Kostenformular ganz oben und ist wie der Dialog „Dokument hochladen"
aufgebaut: Liste des Hochgeladenen, „Beleg fotografieren" (Handy/Tablet), Dateifeld für mehrere
Dateien und das Häkchen „Automatisch per OCR auslesen" (vorbelegt). Anders als dort gibt es
keine eigene Schaltfläche zum Hochladen – die Auswahl der Datei startet den Upload.

Im Kostenformular der Verwaltung läuft die OCR **vor** dem Speichern:

1. Beleg fotografieren (Handy/Tablet) oder Datei wählen – auch mehrere.
2. Die Datei wird sofort als Dokument gespeichert und – solange das Häkchen gesetzt ist –
   ausgelesen (derselbe Weg wie beim Dokument-Upload: `POST /api/dokumente`, `OCRService`).
   Solange das läuft, ist „Speichern" gesperrt.
3. Erkannte Werte stehen in den noch leeren Feldern: Rechnungssteller, Rechnungsnummer,
   Rechnungsdatum, Leistungszeitraum, Beschreibung, Netto, MwSt. und Betrag (brutto). Nicht
   Erkanntes bleibt leer.
4. Prüfen, korrigieren, speichern. Dabei werden die Belege mit der Kostenposition verknüpft.

Bei genau einem Beleg übernimmt das Dokument die im Formular geprüften Rechnungsdaten – Position
und Beleg widersprechen sich dann nicht; was die OCR erkannt hat, bleibt in `ocr_result`. Ein
OCR-Fehler blockiert nichts: der Beleg ist gespeichert, die Felder lassen sich von Hand ausfüllen.
Wird das Formular ohne Speichern geschlossen oder ein Beleg entfernt, wird das Dokument wieder
gelöscht.

Der Nachweis im Einzahlungsformular geht weiterhin mit dem Formular mit und wird nach dem
Speichern ausgelesen; erkannte Werte ergänzen dort nur das Dokument.

Von USER eingereichte Dokumente und Belege werden nicht automatisch ausgelesen (OCR setzt das
Recht `document:ocr` voraus); die Verwaltung kann sie per Schaltfläche auslesen. Ihr Beleg im
Kostenformular geht deshalb wie bisher erst beim Einreichen mit – das Dateifeld steht aber auch
dort ganz oben.

## Deployment auf Vercel

1. Repository in Vercel importieren (Framework wird erkannt, Region `fra1` steht in
   `vercel.json` – passend zur Neon-Region Frankfurt).
2. Unter *Storage* die Neon-Datenbank mit dem Projekt verbinden. Die Integration setzt
   `DATABASE_URL` und `DATABASE_URL_UNPOOLED` automatisch.
3. Für OCR `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` und `AZURE_DOCUMENT_INTELLIGENCE_KEY` unter
   *Settings → Environment Variables* setzen (Production). Ohne sie bleibt OCR ausgeblendet.
4. Deployen. Vercel ruft `npm run vercel-build` auf: bei einem **Production**-Deployment
   laufen zuerst die ausstehenden Migrationen, dann der Build. Schlägt eine Migration fehl,
   bricht das Deployment ab und die bisherige Version bleibt online. Preview-Deployments
   ändern das Schema nicht (sie teilen sich die Datenbank mit der Produktion).

Alle Variablen sind in [.env.example](.env.example) beschrieben.

## Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` / `build` / `start` | Entwicklung, Produktions-Build, Produktionsserver |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm test` | Unit-Tests: Verteilung, Monatsübersicht, Kostenverlauf, Beträge, RBAC, Passwörter, OCR-Anbindung, Service-Rechte |
| `npm run test:e2e` | Build + Playwright (Desktop und Mobil) gegen die DB aus `.env.local` |
| `npm run db:generate` | Migration aus Schemaänderungen erzeugen |
| `npm run db:migrate` | Migrationen ausführen |
| `npm run vercel-build` | Wird von Vercel aufgerufen: Migrationen (nur Production) + Build |
| `npm run db:seed` / `db:seed:demo` | Grunddaten / Beispieldaten |
| `npm run db:studio` | Drizzle Studio |

Migration und Seed verwenden `DATABASE_URL_UNPOOLED`. Eine in der Shell gesetzte Variable
hat Vorrang vor `.env.local` – so lässt sich das Ziel pro Aufruf wählen.

Die End-to-End-Tests starten einen lokalen Nachbau der Azure-API (`e2e/mock-azure.mjs`) –
sie brauchen keine Azure-Zugangsdaten und schicken keine Dokumente an Azure, auch wenn in
`.env.local` echte Zugangsdaten stehen. Sie laufen im Chromium von Playwright
(`npx playwright install chromium`); `PW_CHANNEL=chrome` nimmt ein installiertes Google Chrome.

Die End-to-End-Tests schreiben in die Datenbank und setzen das laufende Abrechnungsjahr auf
„Entwurf" zurück. Sie gehören auf einen Entwicklungs-Branch, nie auf die Produktionsdatenbank.
