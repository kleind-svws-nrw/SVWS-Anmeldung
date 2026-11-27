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

- **Fallunterscheidung:** Die Jahrgangsstufe steuert alles. Bei **5** gilt der EP-Bogen (mit Einverständniserklärung „Kontakt zur Grundschule“, „Wichtiger Hinweis“ und Wunschschulen), bei **6–10** der MS-Bogen (mit Schulform und Entlassjahrgang der letzten Schule; der Name der letzten Schule wird bei allen Stufen abgefragt). Feiner nach Stufe (`data-stufen`): Ganztagswunsch nur bei 5–6, Teilnahme an MINT und/oder Bilingual bzw. „keine Teilnahme“ (`teilnahme_mint`, `teilnahme_bilingual`) und Fremdsprachenwahl ab Klasse 7 ab Stufe 7, Wahlpflichtfach ab Klasse 9 ab Stufe 9. Abschnitte mit `data-nur="EP"` (nur Stufe 5) bzw. `data-nur="MS"` (nur Stufen 6–10) werden in `js/app.js` ein-/ausgeblendet; ihre Felder werden dabei deaktiviert und deshalb weder validiert, gespeichert noch gedruckt.
- **Pflichtfelder:** Grundsätzlich ist jedes sichtbare Feld Pflicht (gesetzt in `js/app.js`). Ausnahmen tragen `data-optional` (Feld oder ganzer Abschnitt): weitere Vornamen, Ortsteil, abweichende Anschrift sowie Telefon/Mobil/Telefon Arbeit/E-Mail der Erziehungsberechtigten, Zusätzliche Notfallinformationen, Sonstige Informationen, Wünsche/Bemerkungen, 1. und 2. Wunschschule, HSP-Weitergabe. Erziehungsberechtigte/r 2 wird erst Pflicht, sobald dort etwas eingetragen ist. Ankreuz-Gruppen (Ganztag, MINT/Bilingual, Kontakt Grundschule) verlangen mindestens eine Auswahl. Die Prüfung läuft im Browser; `api.php` prüft serverseitig weiterhin nur Name, Vorname, Geburtsdatum und die Sonderregeln.
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

Unterdaten hängen per `ON DELETE CASCADE` an der Anmeldung. Die Schemaversion steht in `PRAGMA user_version`; neue Migrationen kommen in `migrate()` in `lib/db.php`. Schema 5 ergänzt `kenntnis_elterninfo_messenger`, Schema 4 ergänzt `teilnahme_mint` und `teilnahme_bilingual` (ersetzt die Einfachauswahl `teilnahme_profil` aus Schema 3, die in solchen Datenbanken ungenutzt stehen bleibt), Schema 2 ergänzt `kenntnis_digitale_kommunikation`, `grundschule_kontakt` und `grundschule_hsp`; die Spalten `einwilligung_digitale_kommunikation` und `kenntnis_email_webuntis` bleiben für Altdaten erhalten, werden vom Formular aber nicht mehr befüllt.

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
| PUT | `anmeldung&id=` | Verwaltung | alle Formularangaben ersetzen (Nachbearbeitung) |
| DELETE | `anmeldung&id=` | Verwaltung | löschen |

Verwaltung: über `admin/api.php` (hinter dem Passwortschutz von `admin/`, siehe unten) oder per Header `X-Admin-Key` mit dem Schlüssel aus `lib/config.local.php`. Felder wie `status` oder `masernschutz_nachweis` werden bei öffentlichen Anmeldungen ignoriert.

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

## Verwaltungsbereich (`/admin`)

Unter `…/SVWS-Anmeldung/admin/` liegt die Verwaltung für das Sekretariat: Liste mit Suche und Filtern (Schuljahr, Bogen, Status), Detailansicht als Anmeldebogen, Pflege von Status, Masernschutznachweis und Bemerkung, Bogen drucken/PDF, Löschen und CSV-Export der gefilterten Liste.

**Nachbearbeitung:** In der Detailansicht öffnet der Stift „bearbeiten“ neben „Anmeldebogen“ die Anmeldung in der normalen Eingabemaske (`index.html?bearbeiten=<Nr.>`; unten zusätzlich der Knopf „Zurück“ zur Verwaltung). Die Daten werden dann über `admin/api.php` (Passwortschutz) geladen und mit „Änderungen speichern“ per `PUT anmeldung` ersetzt. Status, Masernschutz und Bemerkung des Sekretariats bleiben dabei unverändert; die Erklärungen/Kenntnisnahmen der Eltern müssen vom Sekretariat nicht angekreuzt werden, alle übrigen Pflichtfelder gelten wie im Formular.

**SchILD-NRW-Export:** Datensätze in der Liste per Checkbox auswählen (Kopfzeile = alle angezeigten) und „Ausgewählte als .dat-Dateien (ZIP)“ klicken. Die ZIP enthält `SchuelerBasisdaten.dat`, `SchuelerZusatzdaten.dat`, `SchuelerErzieher.dat`, `SchuelerTelefonnummern.dat` und – bei Klasse 5 – `SchuelerGSDaten.dat` im Format der [Schnittstellenbeschreibung](https://schild2.svws-nrw.de/schild2/import-export-statistik/schnittstellenbeschreibung.html) (Pipe-getrennt, Kopfzeile, UTF-8 mit BOM, Datum TT.MM.JJJJ, Status 0 = Neuaufnahme). Entpacken und in SchILD-NRW unter *Datenaustausch → Schnittstelle SchILD-NRW → Import* einlesen. Hinweise:
- Pflicht für den Export ist das Geschlecht (geben die Eltern im Formular an). Ältere Anmeldungen ohne diese Angabe werden beim Export gemeldet.
- Felder mit Statistik-Kürzeln (Staatsangehörigkeit, Konfessions-Kürzel, Geburtsländer, Verkehrssprache, Übergangsempfehlung, Herkunftsschule) bleiben leer und werden in SchILD nachgepflegt; der Klartext steht in den Bemerkungen von `SchuelerZusatzdaten.dat`. Die Konfession wird als Klartext übergeben.
- „Jahrgang als“ muss zum Jahrgangskatalog in SchILD passen (`05` oder `5`); im Zweifel „leer lassen“ und Jahrgang/Klasse in SchILD zuweisen.
- Externe ID-Nr in SchILD: `ANM-<Nr.>` (Rückverfolgung zur Online-Anmeldung).

Der Zugang wird **vom Webserver** per Passwort geschützt. `admin/api.php` gibt die Daten nur frei, wenn der Webserver einen angemeldeten Benutzer (`REMOTE_USER`) meldet – greift der Schutz nicht, zeigt die Verwaltung „nicht durch ein Passwort geschützt“ und liefert keine Daten.

**Apache** (`admin/.htaccess` liegt bei):

```bash
sudo htpasswd -c /etc/apache2/svws-anmeldung.htpasswd sekretariat   # weitere Benutzer ohne -c
```

und in der Apache-Konfiguration `.htaccess` für das Projekt erlauben (unter Debian ist `AllowOverride None` voreingestellt):

```apache
<Directory /var/www/html/SVWS-Anmeldung>
    AllowOverride AuthConfig Limit
</Directory>
```

dann `sudo systemctl reload apache2`.

**nginx** (wertet `.htaccess` nicht aus) – im `server`-Block vor dem allgemeinen PHP-Block:

```nginx
location ^~ /SVWS-Anmeldung/admin/ {
    auth_basic           "SVWS-Anmeldung - Verwaltung";
    auth_basic_user_file /etc/nginx/svws-anmeldung.htpasswd;
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;            # wie im übrigen PHP-Block
        fastcgi_pass unix:/run/php/php-fpm.sock;      # an eigene PHP-Version anpassen
    }
}
```

Die Passwortdatei mit `sudo htpasswd -c /etc/nginx/svws-anmeldung.htpasswd sekretariat` anlegen (Paket `apache2-utils`). `fastcgi_params` übergibt den Benutzer als `REMOTE_USER`.

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

Das Formular enthält sensible Daten (Gesundheitshinweise in `sonstige_informationen`, Religion, Migrationshintergrund). Darum: HTTPS, Verwaltungszugang nur mit Passwortschutz bzw. Schlüssel, Datenbank nicht im Webroot abrufbar, regelmäßige Löschung nach Übernahme in die Schulverwaltung.

## Offene Punkte

- Statistik-Kürzel im SchILD-Export (Staatsangehörigkeit, Geburtsländer, Übergangsempfehlung) über Auswahllisten im Formular
- Admin-Schlüssel später durch richtiges Login ersetzen
