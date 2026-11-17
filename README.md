# Online-Anmeldung (EP / MS)

Digitale Fassung der Anmeldebögen in `quelldokumente/`:

- **EP** – Anmeldung Klasse 5 (Eingangsphase), inkl. Wunschschulen für die Weiterleitung
- **MS** – Quereinstieg Mittelstufe, inkl. Fremdsprache ab 7 / Wahlpflichtfach ab 9

## Architektur

```
Browser                         Webserver (PHP ≥ 8.1, pdo_sqlite)
┌────────────────────┐  fetch   ┌──────────────┐   PDO    ┌───────────────────────┐
│ index.html         │ ───────► │ api.php      │ ───────► │ db/anmeldung.sqlite   │
│ js/app.js          │ ◄─────── │  └ lib/*.php │          │ (Ordner beschreibbar) │
│ js/api.js          │   JSON   └──────────────┘          └───────────────────────┘
└────────────────────┘
Node.js: nur Entwicklungswerkzeug (npm-Skripte, Tests) – läuft nicht auf dem Produktivserver.
```

| Pfad | Aufgabe |
|---|---|
| `index.html` | Startseite und Formular. Feldnamen folgen dem Schema `bereich.feld` bzw. `liste.index.feld`. |
| `js/api.js` | Einzige Stelle, die mit dem Server spricht (`api(action, {method, body})`). |
| `js/app.js` | Formularlogik: Jahrgangsstufe 5 → EP, 6–10 → MS (Abschnitte ein-/ausblenden), Formular → JSON, Absenden, Drucken. |
| `js/druck.js` | Erzeugt aus denselben Formulardaten die Druckfassung (3 A4-Seiten, Layout der Word-Vorlagen). |
| `css/style.css` | Gestaltung der Bildschirmansicht. |
| `css/druck.css` | Druckfassung (`@media print`, `@page A4`, alle Maße in mm). |
| `img/logo.png` | Logo aus der Word-Vorlage, weiße Flächen transparent. |
| `api.php` | Einziger Einstiegspunkt für Datenbankzugriffe (Routing über `?action=`). |
| `lib/config.php` | Konfiguration; lokale Werte in `lib/config.local.php` (nicht eingecheckt). |
| `lib/db.php` | PDO-Verbindung, automatische Schema-Anlage/Migration, `insert()` mit Spalten-Whitelist. |
| `lib/schema.sql` | Datenbankschema. |
| `db/` | SQLite-Datei. **Muss für den Webserver-Benutzer beschreibbar sein.** |
| `tests/` | Smoke-Tests der API mit `node:test`. |

`lib/` und `db/` enthalten je eine `.htaccess` mit `Require all denied`, damit weder Code noch Datenbank direkt abrufbar sind.

## Formular und Druck

- **Fallunterscheidung:** Die Jahrgangsstufe steuert alles. Bei **5** gilt der EP-Bogen (mit Einverständniserklärung „Kontakt zur Grundschule“, „Wichtiger Hinweis“ und Wunschschulen), bei **6–10** der MS-Bogen (mit Schulform, Name und Entlassjahrgang der letzten Schule). Feiner nach Stufe (`data-stufen`): Ganztagswunsch nur bei 5–6, Fremdsprachenwahl ab Klasse 7 ab Stufe 7, Wahlpflichtfach ab Klasse 9 ab Stufe 9. Abschnitte mit `data-nur="EP"` (nur Stufe 5) bzw. `data-nur="MS"` (nur Stufen 6–10) werden in `js/app.js` ein-/ausgeblendet; ihre Felder werden dabei deaktiviert und deshalb weder validiert, gespeichert noch gedruckt.
- **Druck/PDF:** Button „Drucken / PDF“ oder Strg+P. `js/druck.js` baut beim Drucken drei A4-Seiten mit festen Seitenumbrüchen wie in `quelldokumente/`; Eingaben stehen in den Feldern, angekreuzte Optionen als ☒. Ein leeres Formular ergibt einen Blanko-Bogen.
- **Vorschau ohne Drucken:** `index.html?vorschau` zeigt die Druckseiten am Bildschirm.
- **Im Druckdialog:** Ränder „Standard“ oder „Keine“ (die Seite setzt selbst 0), *Hintergrundgrafiken* an (für die grauen Abschnittsköpfe), Maßstab 100 %, Kopf-/Fußzeilen des Browsers aus.
- **Genauigkeit:** Abgeglichen gegen die LibreOffice-PDF-Ausgabe der Vorlagen – Linien und Wortpositionen weichen ≤ 0,6 mm ab. Voraussetzung ist Arial bzw. das metrisch gleiche „Liberation Sans“.
- **Grenzen:** Lange Eingaben werden in ihrem Feld abgeschnitten (Freitextfelder max. 600 Zeichen). „Geburtsland“ steht im Bogen zweimal (Schülerdaten und Migration) und ist ein einziges Feld.

## Datenmodell

| Tabelle | Inhalt |
|---|---|
| `anmeldung` | Kopf, Schülerdaten, Migration, Schullaufbahn, Einwilligungen/Kenntnisnahmen, EP-/MS-Sonderfelder (u. a. `grundschule_kontakt`, `grundschule_hsp`), `status`, Sekretariatsfelder |
| `erziehungsberechtigter` | bis zu 2 je Anmeldung (`position` 1/2) |
| `notfallkontakt` | bis zu 2 zusätzliche Kontakte |
| `ganztag_wunsch` | Angebot × Tag: MINT und Bilingual nur Di, Hausaufgabenbetreuung Mo, Di, Do |

Unterdaten hängen per `ON DELETE CASCADE` an der Anmeldung. Die Schemaversion steht in `PRAGMA user_version`; neue Migrationen kommen in `migrate()` in `lib/db.php`. Schema 2 ergänzt `kenntnis_digitale_kommunikation`, `grundschule_kontakt` und `grundschule_hsp`; die Spalten `einwilligung_digitale_kommunikation` und `kenntnis_email_webuntis` bleiben für Altdaten erhalten, werden vom Formular aber nicht mehr befüllt.

Status-Werte: `eingegangen` → `in_bearbeitung` → `aufgenommen` / `abgelehnt` / `weitergeleitet`.

## API

`api.php?action=…`, JSON rein und raus. Antwort immer mit `{ "ok": true|false, … }`.

| Methode | Aktion | Zugriff | Zweck |
|---|---|---|---|
| GET | `ping` | öffentlich | Erreichbarkeit + DB-Check |
| POST | `anmeldung` | öffentlich | neue Anmeldung |
| GET | `anmeldungen` | Verwaltung | Liste, Filter `formular`, `status`, `schuljahr` |
| GET | `anmeldung&id=` | Verwaltung | Einzelansicht inkl. Unterdaten |
| PATCH | `anmeldung&id=` | Verwaltung | `status`, `masernschutz_nachweis`, `bemerkung_sekretariat` |
| DELETE | `anmeldung&id=` | Verwaltung | löschen |

Verwaltung: Header `X-Admin-Key` mit dem Schlüssel aus `lib/config.local.php`. Felder wie `status` oder `masernschutz_nachweis` werden bei öffentlichen Anmeldungen ignoriert.

Beispiel `POST anmeldung`:

```json
{
  "formular": "EP",
  "anmeldung": { "name": "Muster", "vorname": "Max", "geburtsdatum": "2016-03-14" },
  "erziehungsberechtigte": [{ "rolle": "mutter", "name": "Muster", "email": "m@example.org" }],
  "notfallkontakte": [{ "name": "Oma Muster", "telefon": "02161 …", "status": "Großmutter" }],
  "ganztag": [{ "angebot": "MINT", "tag": "Mo" }]
}
```

## Entwicklung

```bash
npm run db:init   # Datenbank anlegen (passiert sonst beim ersten API-Aufruf)
npm run dev       # PHP-Entwicklungsserver auf http://localhost:8080
npm test          # API-Smoke-Tests (Dev-Server muss laufen)
npm run lint:php  # PHP-Syntaxprüfung
```

## Deployment

1. Alles außer `tests/`, `quelldokumente/` und `package.json` auf den Webserver kopieren.
2. `lib/config.local.php.example` → `lib/config.local.php`, `admin_key` setzen.
3. `db/` beschreibbar machen, z. B. `chown www-data db && chmod 750 db`. SQLite braucht Schreibrechte auf den **Ordner**, nicht nur auf die Datei (WAL-/Journal-Dateien).
4. Unter **nginx** greift `.htaccess` nicht – dann `location ~ ^/(db|lib)/ { deny all; }` eintragen oder `db/` außerhalb des Webroots legen und `db_path` anpassen.
5. Nur über HTTPS betreiben.

## Datenschutz

Das Formular enthält sensible Daten (Gesundheitshinweise in `sonstige_informationen`, Religion, Migrationshintergrund). Darum: HTTPS, Verwaltungszugang nur mit Schlüssel, Datenbank nicht im Webroot abrufbar, regelmäßige Löschung nach Übernahme in die Schulverwaltung.

## Offene Punkte

- Verwaltungsoberfläche (Liste, Statuspflege)
- Export für den Import in SVWS / Schild
- Admin-Schlüssel später durch richtiges Login ersetzen
