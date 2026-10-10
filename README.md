# Betriebskostenabrechnung

Private Betriebskostenabrechnung für drei Wohneinheiten (TOP 1–3): Kosten erfassen, nach
Umlageschlüsseln verteilen, Einzahlungen verbuchen, Dokumente ablegen und die Abrechnung je
TOP freigeben. Die TOPs reichen eigene Einträge ein, die Verwaltung prüft sie.

| Bereich | Inhalt |
| --- | --- |
| **Dashboard** | Abrechnungsperiode, Kosten, Gutschriften und Nettokosten, Kostenverlauf (Diagramm je Monat oder Jahr), Nettokosten/Einzahlungen/Differenz je TOP, offene Positionen, letzte Dokumente und Aktivitäten |
| **Abrechnung** | Jahresübersicht; je Jahr: Gesamtsummen (Kosten, Gutschriften, Nettokosten), Kostenverteilung, Abrechnung je TOP mit Kostenpositionen und Belegen, Kosten, Monatsübersicht, Umlageschlüssel, Dokumente; Jahresabrechnung als PDF |
| **Einzahlungen** | Je TOP mit Datum, Betrag, Jahr, Beschreibung, Zahlungsstatus und Nachweis; Guthaben/Nachzahlung je TOP; **Abrechnungskonto** mit Anfangssaldo, Bewegungen und aktuellem Saldo je TOP |
| **Dokumente** | Rechnungen, Gutschriften, Zahlungsnachweise, Verträge, Sonstiges – mit Suche, Filtern, Sortierung, Vorschau und Download; Belege werden per OCR ausgelesen, als Rechnung oder Gutschrift erkannt und einer Kostenart zugeordnet |
| **Wiederkehrende Kosten** | Vorlagen mit Betrag, Intervall, Umlageschlüssel und TOP-Zuordnung; daraus Kostenpositionen je Monat, Quartal oder Jahr erzeugen |
| **Meine Eingaben** (USER) | Kosten, Einzahlungen, Dokumente und Abrechnungsjahre einreichen; Prüfstand und Kommentar der Verwaltung sehen |
| **Prüfung** (ADMIN) | Eingereichte Einträge ansehen, freigeben, ablehnen, bearbeiten oder löschen |
| **Einstellungen** | Konto, Stammdaten (TOPs, Kostenarten, Umlageschlüssel), Benutzer und Rollen, Audit-Log (ADMIN) |

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

## Jahresabrechnung als PDF

Im Bereich **Abrechnung** – in der Jahresübersicht und im Kopf jedes Jahres – steht
**Jahresabrechnung erstellen**: Abrechnungsjahr wählen, „PDF erstellen", ansehen, in einem neuen
Tab öffnen oder herunterladen. Auf dem Handy wird das PDF nicht eingebettet, sondern geöffnet
bzw. heruntergeladen.

- **Inhalt:** Ergebnis (Gesamtkosten, Einzahlungen, Guthaben/Nachzahlung je TOP),
  Kostenaufstellung nach Kostenart mit den Anteilen je TOP, Einzahlungen und Belegübersicht –
  A4, mit Seitenzahlen, zum Drucken.
- **Nur Freigegebenes:** Es zählen freigegebene Kostenpositionen, eingegangene und freigegebene
  Einzahlungen und freigegebene Belege – auch wenn die Verwaltung das PDF erstellt. Ein Jahr im
  Entwurf lässt sich als PDF erzeugen, ist dann aber deutlich als **Entwurf** gekennzeichnet.
- **Sichtbereich:** Die Verwaltung wählt zwischen der Gesamtabrechnung aller TOPs und der
  Abrechnung einer einzelnen TOP. USER bekommen immer nur die eigene TOP in freigegebenen
  Jahren – der Parameter einer fremden TOP ändert daran nichts.
- **Immer aktuell:** Das PDF wird bei jedem Abruf aus den gespeicherten Daten erzeugt
  (`GET /api/abrechnung/<jahr>/pdf`, optional `?top=2` und `?download`); es wird keine Datei
  abgelegt. Die Beträge stammen aus derselben Berechnung wie die Oberfläche.

Erzeugt wird mit `pdf-lib` (reines JavaScript, läuft in einer Vercel Function): der
Seitenaufbau liegt in `src/lib/pdf/layout.ts`, die Abrechnung in `src/lib/pdf/annual-statement.ts`.

## Wiederkehrende Kosten

Unter **Wiederkehrende Kosten** pflegt die Verwaltung Vorlagen für alles, was regelmäßig
anfällt: Kostenart, Beschreibung, Betrag, Intervall (monatlich, quartalsweise, jährlich),
Rechnungssteller, Umlageschlüssel und TOP-Zuordnung.

- **Betragstyp:** *Fixbetrag* wird beim Erzeugen vorgeschlagen; bei *Variabel* trägt man den
  Betrag jedes Mal laut Rechnung ein (ein Richtwert ist optional).
- **Erzeugen:** Je Vorlage Abrechnungsjahr wählen und die Zeiträume anhaken – je Monat, Quartal
  bzw. Jahr entsteht eine Kostenposition, z. B. „Hausbetreuung Jänner 2026". Der Zeitraum wird
  zum Leistungszeitraum, sein erster Tag zum Rechnungsdatum. Bereits erzeugte Zeiträume sind
  gesperrt; die Liste zeigt je Vorlage „3 von 12".
- **Unabhängig:** Erzeugte Positionen sind gewöhnliche Kostenpositionen und lassen sich einzeln
  ändern oder löschen. Änderungen an der Vorlage wirken nur auf künftig erzeugte Positionen;
  wird die Vorlage gelöscht, bleiben die Positionen bestehen.
- **Rechte:** Anlegen und Ändern (`recurring:write`) sowie Löschen (`recurring:delete`) darf nur
  ADMIN. USER sehen aktive Vorlagen, an denen ihre TOP beteiligt ist (`recurring:read`), und
  reichen daraus Kosten zur Prüfung ein – mit Schlüssel und TOPs der Vorlage.

## Abrechnungskonto

Unter *Einzahlungen → Abrechnungskonto* läuft je TOP ein Konto über die tatsächlichen
Geldbewegungen – fortlaufend über alle Abrechnungsjahre:

    Anfangssaldo zum Stichtag + Einzahlungen − Auszahlungen = aktueller Saldo

- **Stichtag und Anfangssaldo:** Die Verwaltung legt einmal den Stichtag der Kontoführung und
  je TOP einen Anfangssaldo fest (Guthaben positiv, Rückstand mit Minus, optional mit Notiz).
  Bewegungen ab dem Stichtag (einschließlich) werden weitergeführt; alles davor steckt im
  Anfangssaldo.
- **Bewegungen** sind die Einzahlungen: positive Beträge sind Einzahlungen, negative
  Auszahlungen bzw. Rückzahlungen. Es zählt, was offiziell zählt – Status „Eingegangen" und
  freigegeben. Jede Bewegung ist eine eigene Zeile in `payments`.
- **Der Anfangsbestand wird nie überschrieben:** Er steht getrennt von den Bewegungen
  (`account_settings`, `account_opening_balances`), der Saldo wird bei jedem Aufruf daraus
  berechnet und nirgends gespeichert. Ändern lässt er sich nur über „Anfangsbestand ändern"
  (Recht `account:manage`, nur ADMIN); jede Änderung steht mit vorherigem und neuem Wert im
  Audit-Log.
- **Ansicht:** Kontostand als Kacheln, Konten je TOP mit dem **Gesamtbestand** als Summe der
  Salden und je TOP ein Kontoauszug mit dem Saldo nach jeder Bewegung. Das Dashboard zeigt
  dieselbe Übersicht samt den jüngsten Bewegungen.
- **Sichtbereich:** USER sehen nur das Konto der eigenen TOP (`account:read`) – dort aber alle
  Bewegungen seit dem Stichtag, auch in Jahren, deren Abrechnung noch nicht freigegeben ist:
  ein Kontostand ohne die laufenden Einzahlungen wäre falsch.
- **Getrennt von der Abrechnung:** Kosten und ihre Verteilung fließen nicht ins Konto ein, und
  das Konto verändert weder die Jahresabrechnung (Einzahlungen − Kostenanteil je Jahr) noch
  das PDF. Eine Kostenposition beschreibt den Abrechnungsgrund, eine Ein- oder Auszahlung die
  Geldbewegung.

## Audit-Log

Unter *Einstellungen → Audit-Log* (nur ADMIN, Recht `audit:read`) steht, wer wann was getan hat:
Zeitpunkt, Benutzer und TOP, Aktion, betroffener Datensatz und – bei Änderungen – vorheriger und
neuer Wert. Filtern lässt sich nach Bereich, Benutzer, Zeitraum und Suchtext.

Protokolliert werden: Anmeldung, fehlgeschlagene Anmeldung, Abmeldung, Passwortwechsel und
-reset; Abrechnungsjahre (angelegt, eingereicht, freigegeben, Freigabe zurückgenommen,
gelöscht) und Umlageschlüssel-Werte; Kosten, Einzahlungen und Dokumente (angelegt bzw.
hochgeladen, eingereicht, geändert, gelöscht, OCR); Stichtag und Anfangssalden des
Abrechnungskontos; Freigaben und Ablehnungen der Prüfung;
Vorlagen für wiederkehrende Kosten; Benutzer, Rollen und Stammdaten.

- **Unveränderlich:** Die Anwendung kennt keine Funktion zum Ändern oder Löschen von
  Einträgen, und ein Datenbank-Trigger weist `UPDATE`, `DELETE` und `TRUNCATE` auf `audit_log`
  ab – auch für Zugriffe an der Anwendung vorbei.
- **Gemeinsam mit der Änderung:** Wo ein Service in einer Transaktion schreibt, entsteht der
  Protokolleintrag in derselben Transaktion.
- **Für sich lesbar:** Benutzername, TOP und die Bezeichnung des Datensatzes werden als
  Momentaufnahme gespeichert – das Protokoll bleibt verständlich, wenn Benutzer oder
  Datensätze später gelöscht werden.
- **Kein Fluten:** Fehlversuche mit unbekanntem Benutzernamen oder während einer Kontosperre
  werden nicht protokolliert, weil sie sich beliebig oft wiederholen lassen.

Der Katalog der Aktionen steht in `src/lib/audit.ts`. Eine weitere Aktion – etwa Backup,
Wiederherstellung oder Datenbank-Reset, sobald es diese Funktionen gibt – ist eine Zeile dort
plus ein Aufruf von `recordAudit` im jeweiligen Service.

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
Kosten gestapelt nach TOP (noch nicht verteilte Beträge eigens ausgewiesen), USER ihren
eigenen Anteil in freigegebenen Jahren. Unter „Werte als Tabelle" stehen dieselben Zahlen.
Gutschriften bekommen keine Säule: sie stehen als Betrag im Kartenkopf, im Tooltip und in einer
eigenen Tabellenspalte, die letzte Spalte sind dann die Nettokosten.

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
  lib/           Reine Hilfsfunktionen: Verteilung, Monatsübersicht, Beträge, Validierung,
                 Audit-Katalog, PDF-Aufbau (lib/pdf), Auswertung ausgelesener Belege (lib/ocr:
                 Rechnung oder Gutschrift, Kostenart)
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

**Berechnung:** Kosten − Gutschriften = Nettokosten; Einzahlungen − Nettokostenanteil = Guthaben
(positiv) bzw. Nachzahlung (negativ). Details unter [Gutschriften](#gutschriften).
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
| `costs`, `cost_units` | Kostenpositionen mit Rechnungsdaten (Rechnungssteller, Nummer, Datum, Leistungszeitraum, Netto, MwSt., Brutto) und ihre TOP-Zuordnung; ein negativer Betrag ist eine Gutschrift; `recurring_cost_id` vermerkt die Vorlage, aus der eine Position erzeugt wurde |
| `recurring_costs`, `recurring_cost_units` | Vorlagen für wiederkehrende Kosten und ihre TOP-Zuordnung |
| `payments` | Einzahlungen je TOP mit Zahlungsstatus – zugleich die Bewegungen des Abrechnungskontos (negativ = Auszahlung) |
| `account_settings`, `account_opening_balances` | Stichtag der Kontoführung (eine Zeile) und Anfangssaldo je TOP |
| `documents`, `document_files`, `document_links` | Dokumente (Metadaten, Dokumenttyp inkl. `credit_note`, Kostenart `category_id`, OCR-Ergebnis samt Auswertung in `ocr_result`), ihr Dateiinhalt und ihre Verknüpfungen mit Kostenpositionen und Einzahlungen |
| `audit_log` | Audit-Log: Zeitpunkt, Benutzer/TOP, Aktion, Datensatz, vorherige/neue Werte – nur anhängbar |

`billing_periods`, `costs`, `payments` und `documents` tragen jeweils Prüfstand, Prüfdatum,
Prüfer und Kommentar.

### Erweitern

| Vorhaben | Wo |
| --- | --- |
| Neues Recht | Eintrag in `src/auth/permissions.ts`, Prüfung im Service |
| Neue Rolle | In der Oberfläche anlegen oder `ROLE_DEFINITIONS` ergänzen |
| Neuer Umlageschlüssel | *Einstellungen → Stammdaten* (Werte je Abrechnungsjahr) |
| Neue Aktion im Audit-Log | Zeile in `AUDIT_ACTIONS` (`src/lib/audit.ts`), `recordAudit(...)` im Service |
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
beim Anlegen einer Kostenposition (als Rechnung bzw. Gutschrift) und bei einer Einzahlung (als
Zahlungsnachweis).
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

Belege (Rechnung, Gutschrift) werden nach dem Auslesen zusätzlich ausgewertet – siehe
[Gutschriften](#gutschriften) und [Automatische Kostenart](#automatische-kostenart).

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
   Erkanntes bleibt leer. Eine erkannte Gutschrift steht mit Minus im Betrag; die Kostenart ist
   vorgewählt, wenn die Auswertung sicher ist – sonst steht sie auf „Bitte wählen …".
4. Prüfen, korrigieren, speichern. Dabei werden die Belege mit der Kostenposition verknüpft.

Bei genau einem Beleg übernimmt das Dokument die im Formular geprüften Rechnungsdaten samt
Kostenart, und sein Dokumenttyp folgt dem Betrag (negativ = Gutschrift) – Position und Beleg
widersprechen sich dann nicht; was die OCR erkannt hat, bleibt in `ocr_result`. Ein
OCR-Fehler blockiert nichts: der Beleg ist gespeichert, die Felder lassen sich von Hand ausfüllen.
Wird das Formular ohne Speichern geschlossen oder ein Beleg entfernt, wird das Dokument wieder
gelöscht.

Der Nachweis im Einzahlungsformular geht weiterhin mit dem Formular mit und wird nach dem
Speichern ausgelesen; erkannte Werte ergänzen dort nur das Dokument.

Von USER eingereichte Dokumente und Belege werden nicht automatisch ausgelesen (OCR setzt das
Recht `document:ocr` voraus); die Verwaltung kann sie per Schaltfläche auslesen. Ihr Beleg im
Kostenformular geht deshalb wie bisher erst beim Einreichen mit – das Dateifeld steht aber auch
dort ganz oben.

## Gutschriften

Eine Gutschrift ist eine **eigene Position mit negativem Betrag** (`costs.amount_cents < 0`) –
wie eine Kostenposition mit Kostenart, Umlageschlüssel, TOP-Zuordnung, Beleg und Prüfstand. Sie
wird nie mit einer Rechnung verrechnet oder in sie hineingebucht:

- **Ursprüngliche Kostenpositionen bleiben unverändert.** Jede Position wird für sich auf die
  TOPs verteilt; eine Gutschrift ändert weder Betrag noch Anteile einer anderen Position.
- **Kontobewegungen bleiben unverändert.** Gutschriften sind keine Ein- oder Auszahlungen und
  kommen im Abrechnungskonto nicht vor. Wird eine Gutschrift tatsächlich ausbezahlt, ist das
  eine Auszahlung unter *Einzahlungen* (negativer Betrag).
- **Nettokosten = Kosten − Gutschriften**, über alle TOPs und je TOP (Kostenanteil minus
  Gutschriftanteil, cent-genau nach dem Verfahren der größten Reste). Guthaben bzw. Nachzahlung
  ergibt sich aus Einzahlungen minus Nettokosten.
- Es zählen wie überall nur **freigegebene** Positionen: eine von einem USER eingereichte
  Gutschrift wirkt erst nach der Prüfung, in freigegebenen Jahren ist sie wie jede Position
  gesperrt.

Gutschriften stehen überall getrennt von den Kosten – mit Anzahl und Betrag:

| Ansicht | Darstellung |
| --- | --- |
| Dashboard | Kacheln *Kosten*, *Gutschriften* (Anzahl, Betrag) und *Nettokosten*; je Kostenart eine eigene Zeile unter dem Balken; im Kostenverlauf als Betrag und Tabellenspalte; Aktivität „Gutschrift erfasst" |
| Abrechnung | Kacheln wie im Dashboard; in der Kostenverteilung markierte Positionen und die Summenzeilen *Kosten*, *Gutschriften*, *Nettokosten*; ebenso je TOP |
| Kosten | Markierung „Gutschrift" an der Position; Summenzeilen *Kosten*, *Gutschriften (n)*, *Nettokosten* |
| Monats- und Jahresübersicht | Eigene Spalte *Gutschriften* |
| Jahresabrechnung (PDF) | Ergebnis mit *Kosten*, *Gutschriften (n)* und *Nettokosten*; eigener Abschnitt *Gutschriften* nach der Kostenaufstellung |
| Prüfung, Meine Eingaben | Markierung „Gutschrift" an eingereichten Positionen |

**Erkennung per OCR.** Das Rechnungsmodell von Azure unterscheidet Rechnung und Gutschrift
nicht – die Anwendung wertet dazu das Ergebnis aus (`src/lib/ocr/document-kind.ts`). Sicher
ist eine Gutschrift, wenn der Gesamtbetrag negativ ist oder der Beleg im Kopf als *Gutschrift*,
*Rechnungskorrektur*, *Stornorechnung* oder *Credit Note* betitelt ist. Dann wird der
Dokumenttyp von „Rechnung" auf „Gutschrift" gestellt, und die Beträge werden negativ geführt –
auch wenn der Aussteller sie positiv druckt („Gutschrift über € 60,00"). Kommt der Begriff nur
irgendwo im Text vor (z. B. „abzüglich Gutschrift" als Position einer Rechnung), bleibt es bei
der Rechnung, mit einem Hinweis zum Prüfen. Einen von Hand zurückgestellten Dokumenttyp ändert
ein erneutes Auslesen nicht mehr.

Von Hand entsteht eine Gutschrift wie bisher: Betrag mit Minus eintragen (z. B. `-50,00`).

## Automatische Kostenart

Nach dem Auslesen schlägt die Anwendung für jeden Beleg eine Kostenart vor
(`src/lib/ocr/category-suggestion.ts`, geladen in `src/services/classification.service.ts`):

1. **Bisherige Zuordnungen.** Wurde der Rechnungssteller bisher (fast) immer derselben Kostenart
   zugeordnet, gilt diese. Gelernt wird aus dem, was offiziell zählt: freigegebene
   Kostenpositionen, aktive Vorlagen für wiederkehrende Kosten und freigegebene Belege ohne
   Kostenposition – Eingereichtes und Abgelehntes zählt nicht. Schreibweisen werden
   angeglichen („Muster GmbH & Co KG" = „MUSTER"). Jede gespeicherte Position ist damit zugleich
   die Vorlage für den nächsten Beleg desselben Rechnungsstellers.
2. **Mehrere bisherige Kostenarten** (z. B. „Gemeinde": Kanal, Müll, Grundsteuer): der Inhalt
   des Belegs entscheidet zwischen ihnen.
3. **Stichwörter** in Rechnungssteller, Beschreibung und Text: der Name der Kostenart und
   verwandte Begriffe („Kehrung" → *Rauchfangkehrer*, „Polizze" → *Gebäudeversicherung*).
   Eigene Kostenarten lassen sich über ihre **Beschreibung** in den Stammdaten mit weiteren
   Stichwörtern versehen.

Zugeordnet wird nur, wenn die Auswertung sicher ist (ab 70 %, `CATEGORY_AUTO_ASSIGN_CONFIDENCE`):
im Kostenformular ist die Kostenart dann vorgewählt, am Dokument eingetragen – jeweils mit
Begründung. **Bei unsicherer Zuordnung bleibt die Auswahl offen**: im Kostenformular steht
„Bitte wählen …" (gespeichert wird erst mit einer Kostenart), am Dokument „Offen – noch nicht
zugeordnet", mit den Kandidaten als Hinweis. Die Kostenart lässt sich immer von Hand ändern;
was jemand gewählt hat, überschreibt die OCR nicht – auch nicht bei erneutem Auslesen. Wird im
Beleg gar keine Rechnung erkannt, bleibt das Kostenformular wie bei einer Erfassung von Hand.

**Gespeichert** wird alles in Neon: die Kostenart in `costs.category_id` bzw.
`documents.category_id`, der Dokumenttyp in `documents.type`, und was die OCR erkannt und
vorgeschlagen hat – Belegart mit Merkmalen, Kostenart mit Sicherheit und Begründung, weitere
Kandidaten – unverändert in `documents.ocr_result.classification`. Das Audit-Log hält beim
Eintrag „Dokument per OCR ausgelesen" fest, was erkannt und was zugeordnet wurde
(z. B. „Dokumenttyp: Rechnung → Gutschrift", „Kostenart: leer → Rauchfangkehrer").

Die Auswertung läuft nur mit dem Recht `document:ocr` (Verwaltung) und nur für Belege – ein
Vertrag oder Zahlungsnachweis bekommt weder Belegart noch Kostenart. Sie braucht keinen
weiteren Dienst und keine weitere Konfiguration.

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
| `npm test` | Unit-Tests: Verteilung, Gutschriften und Nettokosten, Monatsübersicht, Kostenverlauf, Beträge, RBAC, Passwörter, OCR-Anbindung, Erkennung von Gutschriften, Kostenart-Vorschlag, Service-Rechte, Audit-Katalog, Zeiträume wiederkehrender Kosten, PDF-Jahresabrechnung, Abrechnungskonto |
| `npm run test:e2e` | Build + Playwright (Desktop und Mobil) gegen die DB aus `.env.local` |
| `npm run db:generate` | Migration aus Schemaänderungen erzeugen |
| `npm run db:migrate` | Migrationen ausführen |
| `npm run vercel-build` | Wird von Vercel aufgerufen: Migrationen (nur Production) + Build |
| `npm run db:seed` / `db:seed:demo` | Grunddaten / Beispieldaten |
| `npm run db:studio` | Drizzle Studio |

Migration und Seed verwenden `DATABASE_URL_UNPOOLED`. Eine in der Shell gesetzte Variable
hat Vorrang vor `.env.local` – so lässt sich das Ziel pro Aufruf wählen.

Die End-to-End-Tests starten einen lokalen Nachbau der Azure-API (`e2e/mock-azure.mjs`, mit
festen Ergebnissen für Rechnung, Gutschrift und einen Beleg ohne erkennbare Kostenart) –
sie brauchen keine Azure-Zugangsdaten und schicken keine Dokumente an Azure, auch wenn in
`.env.local` echte Zugangsdaten stehen. Sie laufen im Chromium von Playwright
(`npx playwright install chromium`); `PW_CHANNEL=chrome` nimmt ein installiertes Google Chrome.

Die End-to-End-Tests schreiben in die Datenbank, setzen das laufende Abrechnungsjahr auf
„Entwurf" zurück und löschen Stichtag und Anfangssalden des Abrechnungskontos. Sie gehören auf
einen Entwicklungs-Branch, nie auf die Produktionsdatenbank.
