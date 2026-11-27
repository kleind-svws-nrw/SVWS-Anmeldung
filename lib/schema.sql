-- Schema der Anmeldedatenbank (SQLite)
-- Version wird über PRAGMA user_version geführt (siehe lib/db.php).

PRAGMA foreign_keys = ON;

-- Eine Zeile pro Anmeldung (Schülerdaten 1:1 enthalten)
CREATE TABLE IF NOT EXISTS anmeldung (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    formular                TEXT NOT NULL CHECK (formular IN ('EP','MS')),  -- EP = Eingangsphase Kl. 5, MS = Quereinstieg Mittelstufe
    status                  TEXT NOT NULL DEFAULT 'eingegangen'
                            CHECK (status IN ('eingegangen','in_bearbeitung','aufgenommen','abgelehnt','weitergeleitet')),

    -- Kopf
    schuljahr               TEXT,          -- z. B. '2027/28'
    halbjahr                INTEGER CHECK (halbjahr IN (1,2)),
    jahrgangsstufe          TEXT,
    anmeldedatum            TEXT,          -- ISO 8601 (YYYY-MM-DD)

    -- Daten der Schülerin / des Schülers
    name                    TEXT NOT NULL,
    vorname                 TEXT NOT NULL,
    weitere_vornamen        TEXT,
    strasse                 TEXT,
    hausnummer              TEXT,
    plz                     TEXT,
    wohnort                 TEXT,
    ortsteil                TEXT,
    geburtsdatum            TEXT NOT NULL,
    geschlecht              TEXT CHECK (geschlecht IN ('m','w','d','x')),
    geburtsort              TEXT,
    geburtsland             TEXT,
    staatsangehoerigkeit    TEXT,          -- mehrere kommasepariert
    religion                TEXT CHECK (religion IN ('ev','kath','islam','ohne','sonstige')),
    religion_sonstige       TEXT,
    religionsunterricht     TEXT CHECK (religionsunterricht IN ('ev','kath','pp')),
    ganztag_teilnahme       INTEGER CHECK (ganztag_teilnahme IN (0,1)),
    -- nur Stufe 7–10: 1 = nimmt teil; beide 0 = „keine Teilnahme“; NULL = keine Angabe
    teilnahme_mint          INTEGER CHECK (teilnahme_mint IN (0,1)),
    teilnahme_bilingual     INTEGER CHECK (teilnahme_bilingual IN (0,1)),
    fahrkosten_antrag       INTEGER CHECK (fahrkosten_antrag IN (0,1)),
    geschwisterkind_am_mng  INTEGER CHECK (geschwisterkind_am_mng IN (0,1)),
    kenntnis_pflichtveranstaltungen INTEGER CHECK (kenntnis_pflichtveranstaltungen IN (0,1)),

    -- Nur Sekretariat
    masernschutz_nachweis   INTEGER CHECK (masernschutz_nachweis IN (0,1)),
    bemerkung_sekretariat   TEXT,

    -- Migrationshintergrund
    migrationshintergrund   INTEGER CHECK (migrationshintergrund IN (0,1)),
    zuzugsjahr              INTEGER,
    geburtsland_mutter      TEXT,
    geburtsland_vater       TEXT,
    muttersprache           TEXT,
    familiensprache         TEXT,

    -- Schullaufbahn
    einschulungsjahr        INTEGER,
    letzte_schulform        TEXT,
    entlassjahrgang         TEXT,
    letzte_schule           TEXT,
    klassenlehrkraft        TEXT,
    uebergangsempfehlung    TEXT CHECK (uebergangsempfehlung IN ('GY','RS_GY_eing','RS','HS_RS_eing','HS')),

    -- nur Formular MS
    fremdsprache_ab_7       TEXT,
    wahlpflichtfach_ab_9    TEXT,

    -- nur Formular EP (Weiterleitung bei Kapazitätsgründen)
    wunschschule_1          TEXT,
    wunschschule_2          TEXT,

    -- Weitere Angaben / Erklärungen
    einwilligung_fotos                   INTEGER CHECK (einwilligung_fotos IN (0,1)),
    einwilligung_digitale_kommunikation  INTEGER CHECK (einwilligung_digitale_kommunikation IN (0,1)),  -- bis Schema 1, nicht mehr im Formular
    kenntnis_digitale_kommunikation      INTEGER CHECK (kenntnis_digitale_kommunikation IN (0,1)),      -- Schulmessenger, Päd. Netz, E-Mail
    kenntnis_elterninfo_messenger        INTEGER CHECK (kenntnis_elterninfo_messenger IN (0,1)),        -- Elterninfos über Schulmessenger
    sonstige_informationen  TEXT,          -- sensibel (Gesundheit u. ä.)
    wunsch_mitschueler      TEXT,
    vodv_erhalten           INTEGER CHECK (vodv_erhalten IN (0,1)),            -- VO-DV I zur Kenntnis genommen
    kenntnis_email_webuntis INTEGER CHECK (kenntnis_email_webuntis IN (0,1)),  -- bis Schema 1, nicht mehr im Formular

    -- nur Formular EP: Kontakt zur Grundschule
    grundschule_kontakt     INTEGER CHECK (grundschule_kontakt IN (0,1)),     -- 1 = einverstanden, 0 = ausdrücklich nicht
    grundschule_hsp         INTEGER CHECK (grundschule_hsp IN (0,1)),         -- Weitergabe Hamburger Schreib-Probe

    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bis zu zwei Erziehungsberechtigte je Anmeldung
CREATE TABLE IF NOT EXISTS erziehungsberechtigter (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    anmeldung_id    INTEGER NOT NULL REFERENCES anmeldung(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL CHECK (position IN (1,2)),
    rolle           TEXT CHECK (rolle IN ('mutter','vater','sonstige')),
    name            TEXT,
    vorname         TEXT,
    sorgeberechtigt INTEGER CHECK (sorgeberechtigt IN (0,1)),
    geburtsland     TEXT,
    strasse         TEXT,          -- nur bei abweichender Anschrift
    plz_wohnort     TEXT,
    telefon         TEXT,
    mobil           TEXT,
    telefon_arbeit  TEXT,
    email           TEXT,
    UNIQUE (anmeldung_id, position)
);

-- Zusätzliche Notfallkontakte (max. 2 laut Formular)
CREATE TABLE IF NOT EXISTS notfallkontakt (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    anmeldung_id    INTEGER NOT NULL REFERENCES anmeldung(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    telefon         TEXT,
    status          TEXT           -- z. B. Großmutter
);

-- Ganztagswünsche: Angebot × Wochentag
CREATE TABLE IF NOT EXISTS ganztag_wunsch (
    anmeldung_id    INTEGER NOT NULL REFERENCES anmeldung(id) ON DELETE CASCADE,
    angebot         TEXT NOT NULL CHECK (angebot IN ('MINT','Bilingual','Hausaufgabenbetreuung')),
    tag             TEXT NOT NULL CHECK (tag IN ('Mo','Di','Do')),
    PRIMARY KEY (anmeldung_id, angebot, tag)
);

CREATE INDEX IF NOT EXISTS idx_anmeldung_formular_status ON anmeldung(formular, status);
CREATE INDEX IF NOT EXISTS idx_anmeldung_name ON anmeldung(name, vorname);

CREATE TRIGGER IF NOT EXISTS trg_anmeldung_updated
AFTER UPDATE ON anmeldung FOR EACH ROW
BEGIN
    UPDATE anmeldung SET updated_at = datetime('now') WHERE id = OLD.id;
END;
