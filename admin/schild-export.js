// Export ausgewählter Anmeldungen für den Import in SchILD-NRW 2
// (Datenaustausch → Schnittstelle SchILD-NRW → Import).
//
// Format laut Schnittstellenbeschreibung (https://schild2.svws-nrw.de/schild2/import-export-statistik/schnittstellenbeschreibung.html):
//   - Textdateien *.dat, Feldtrenner „|“, keine Anführungszeichen, eine Kopfzeile (wird beim Import ignoriert)
//   - feste Spaltenreihenfolge, leere Felder behalten ihren Trenner
//   - Datum TT.MM.JJJJ, UTF-8 mit BOM
//   - Verknüpfung der Dateien über Nachname + Vorname + Geburtsdatum
//
// Felder mit Statistik-Kürzeln (Staatsangehörigkeit, Konfession, Geburtsländer, Übergangsempfehlung …) bleiben leer,
// weil das Formular Klartext erfasst. Sie sind in der Schnittstelle als „(Ja)“ markiert und werden in SchILD nachgetragen;
// der Klartext steht zur Kontrolle in den Bemerkungen (SchuelerZusatzdaten.dat).

const RELIGION = { ev: 'evangelisch', kath: 'katholisch', islam: 'islamisch', ohne: 'ohne Bekenntnis' };
const RU = { ev: 'evangelisch', kath: 'katholisch', pp: 'Praktische Philosophie' };
const UEBERGANG = { GY: 'Gymnasium', RS_GY_eing: 'Realschule/Gymnasium eingeschränkt', RS: 'Realschule', HS_RS_eing: 'Hauptschule/Realschule eingeschränkt', HS: 'Hauptschule' };
const ROLLE = { mutter: 'Mutter', vater: 'Vater', sonstige: 'Erziehungsberechtigte/r' };

/** Text für ein .dat-Feld: keine Trenner/Zeilenumbrüche, auf Maximallänge gekürzt */
const f = (wert, max = 255) => String(wert ?? '').replace(/[|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const jn = (wert) => (wert === 1 || wert === '1' ? 'J' : wert === 0 || wert === '0' ? 'N' : '');
const datum = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};
const zeile = (felder) => felder.join('|');

/** Gemeinsamer Schlüssel aller Dateien */
const kennung = (a) => [f(a.name, 50), f(a.vorname, 30), datum(a.geburtsdatum)];

function strasseSchueler(a) {
  return f([a.strasse, a.hausnummer].filter(Boolean).join(' '), 50);
}

/** Prüft, ob eine Anmeldung exportierbar ist; liefert Liste der Probleme */
export function pruefe(a) {
  const fehlt = [];
  if (!a.name) fehlt.push('Name');
  if (!a.vorname) fehlt.push('Vorname');
  if (!datum(a.geburtsdatum)) fehlt.push('Geburtsdatum');
  if (!['m', 'w', 'd', 'x'].includes(a.geschlecht)) fehlt.push('Geschlecht');
  return fehlt;
}

// ---------------------------------------------------------------- SchuelerBasisdaten.dat (58 Felder)

const KOPF_BASIS = ['Nachname', 'Vorname', 'Geburtsdatum', 'Geschlecht', 'Status', 'PLZ', 'Ort', 'Straße', 'Aussiedler',
  '1. Staatsang.', 'Konfession', 'StatistikKrz Konfession', 'Aufnahmedatum', 'Abmeldedatum Religionsunterricht',
  'Anmeldedatum Religionsunterricht', 'Schulpflicht erf.', 'Reform-Pädagogik', 'Nr. Stammschule', 'Jahr', 'Abschnitt',
  'Jahrgang', 'Klasse', 'Schulgliederung', 'OrgForm', 'Klassenart', 'Fachklasse', '', 'Verpflichtung Sprachförderkurs',
  'Teilnahme Sprachförderkurs', 'Einschulungsjahr', 'Übergangsempf. JG5', 'Jahr Wechsel S1', '1. Schulform S1',
  'Jahr Wechsel S2', 'Förderschwerpunkt', '2. Förderschwerpunkt', 'Schwerstbehinderung', 'Autist', 'LS Schulnr.',
  'LS Schulform', 'Herkunft', 'LS Entlassdatum', 'LS Jahrgang', 'LS Versetzung', 'LS Reformpädagogik', 'LS Gliederung',
  'LS Fachklasse', 'LS Abschluss', 'Abschluss', 'Schulnr. neue Schule', 'Zuzugsjahr', 'Geburtsland Schüler',
  'Geburtsland Mutter', 'Geburtsland Vater', 'Verkehrssprache', 'Dauer Kindergartenbesuch',
  'Ende der Eingliederungsphase', 'Ende Anschlussförderung'];

function basisdaten(a, opt) {
  const konfession = a.religion === 'sonstige' ? a.religion_sonstige : RELIGION[a.religion];
  const jahr = /^(\d{4})/.exec(a.schuljahr ?? '')?.[1] ?? '';
  const stufe = String(a.jahrgangsstufe ?? '');
  const jahrgang = !stufe || opt.jahrgang === 'leer' ? '' : opt.jahrgang === 'zweistellig' ? stufe.padStart(2, '0') : stufe;
  const z = [
    ...kennung(a),
    a.geschlecht,           // 4 Geschlecht
    '0',                    // 5 Status: Neuaufnahme
    f(a.plz, 10),           // 6
    f(a.wohnort, 50),       // 7
    strasseSchueler(a),     // 8 Straße mit Hausnummer
    '',                     // 9 Aussiedler
    '',                     // 10 1. Staatsang. (Statistik-Kürzel)
    f(konfession, 30),      // 11 Konfession (Klartext)
    '',                     // 12 StatistikKrz Konfession
    '',                     // 13 Aufnahmedatum
    '', '',                 // 14, 15 Ab-/Anmeldedatum Religionsunterricht
    'N',                    // 16 Schulpflicht erfüllt
    '', '',                 // 17 Reformpädagogik, 18 Nr. Stammschule
    jahr,                   // 19 Jahr (Schuljahresbeginn)
    f(a.halbjahr, 1),       // 20 Abschnitt
    jahrgang,               // 21 Jahrgang (muss in SchILD existieren)
    '',                     // 22 Klasse
    '', '', '', '', '',     // 23–27 Gliederung, OrgForm, Klassenart, Fachklasse, (frei)
    'N', 'N',               // 28, 29 Sprachförderkurs
    f(a.einschulungsjahr, 4), // 30 Einschulungsjahr
    '',                     // 31 Übergangsempfehlung (Statistik-Kürzel)
    '', '', '', '', '',     // 32–36
    'N', 'N',               // 37 Schwerstbehinderung, 38 Autist
    '', '', '', '', '', '', '', '', '', '', '', '', // 39–50 letzte Schule / Abschlüsse (Statistik-Kürzel)
    f(a.zuzugsjahr, 4),     // 51 Zuzugsjahr
    '', '', '', '',         // 52–55 Geburtsländer, Verkehrssprache (Statistik-Kürzel)
    '', '', '',             // 56–58
  ];
  return zeile(z);
}

// ---------------------------------------------------------------- SchuelerErzieher.dat (19 Felder)

const KOPF_ERZIEHER = ['Nachname', 'Vorname', 'Geburtsdatum', 'Erzieherart', 'Anrede 1. Person', 'Titel 1. Person',
  'Nachname 1. Person', 'Vorname 1. Person', 'Anrede 2. Person', 'Titel 2. Person', 'Nachname 2. Person',
  'Vorname 2. Person', 'Straße u. Hausnr.', 'PLZ', 'Ort', 'Ortsteil', 'E-Mail 1. Person', 'Anschreiben', 'E-Mail 2. Person'];

function erzieher(a) {
  return (a.erziehungsberechtigte ?? []).filter((e) => e.name).map((e) => {
    // abweichende Anschrift „PLZ Ort“ aufteilen, sonst die Anschrift des Kindes
    let strasse = strasseSchueler(a), plz = f(a.plz, 10), ort = f(a.wohnort, 50), ortsteil = f(a.ortsteil, 30);
    if (e.strasse || e.plz_wohnort) {
      const m = /^\s*(\d{4,5})\s+(.+)$/.exec(e.plz_wohnort ?? '');
      strasse = f(e.strasse, 50);
      plz = m ? m[1] : '';
      ort = f(m ? m[2] : e.plz_wohnort, 50);
      ortsteil = '';
    }
    const anrede = e.rolle === 'mutter' ? 'Frau' : e.rolle === 'vater' ? 'Herr' : '';
    return zeile([
      ...kennung(a),
      ROLLE[e.rolle] ?? '', anrede, '', f(e.name, 50), f(e.vorname, 30),
      '', '', '', '',
      strasse, plz, ort, ortsteil,
      f(e.email, 50),
      String(e.sorgeberechtigt) === '0' ? 'N' : 'J',
      '',
    ]);
  });
}

// ---------------------------------------------------------------- SchuelerTelefonnummern.dat (5 Felder)

const KOPF_TELEFON = ['Nachname', 'Vorname', 'Geburtsdatum', 'Telefon-Nummer', 'TelefonArt'];

function telefonnummern(a) {
  const z = [];
  for (const e of a.erziehungsberechtigte ?? []) {
    const wer = ROLLE[e.rolle] ?? 'Erziehungsber.';
    for (const [feld, art] of [['telefon', 'Telefon'], ['mobil', 'Mobil'], ['telefon_arbeit', 'Arbeit']]) {
      if (e[feld]) z.push(zeile([...kennung(a), f(e[feld], 20), f(`${art} ${wer}`, 30)]));
    }
  }
  for (const n of a.notfallkontakte ?? []) {
    if (n.telefon) z.push(zeile([...kennung(a), f(n.telefon, 20), f(`Notfall ${n.status || n.name}`, 30)]));
  }
  return z;
}

// ---------------------------------------------------------------- SchuelerZusatzdaten.dat (29 Felder)

const KOPF_ZUSATZ = ['Nachname', 'Vorname', 'Geburtsdatum', 'Namenszusatz', 'Geburtsname', 'Geburtsort', 'Ortsteil',
  'Telefon-Nr.', 'E-Mail', '2. Staatsang.', 'Externe ID-Nr', 'Sportbefreiung', 'Fahrschülerart', 'Haltestelle',
  'Einschulungsart', 'Entlassdatum', 'Entlassjahrgang', 'Datum Schulwechsel', 'Bemerkungen', 'Anrechnungsmonate BK',
  'BeginnBildungsgang', 'Anmeldedatum', 'Bafög', 'EP-Jahre', 'Fax/Mobilnr', 'Ausweisnummer', 'schulische E-Mail',
  'Masern-Impfnachweis', 'bisherige ID'];

/** Klartext-Angaben ohne eigenes Schnittstellenfeld – zur Kontrolle in SchILD */
function bemerkung(a) {
  const teile = [`Online-Anmeldung Nr. ${a.id}`];
  if (a.weitere_vornamen) teile.push(`weitere Vornamen: ${a.weitere_vornamen}`);
  if (a.staatsangehoerigkeit) teile.push(`Staatsang.: ${a.staatsangehoerigkeit}`);
  if (a.geburtsland) teile.push(`Geburtsland: ${a.geburtsland}`);
  if (RU[a.religionsunterricht]) teile.push(`RU: ${RU[a.religionsunterricht]}`);
  if (UEBERGANG[a.uebergangsempfehlung]) teile.push(`Übergangsempf.: ${UEBERGANG[a.uebergangsempfehlung]}`);
  if (a.letzte_schule) teile.push(`letzte Schule: ${a.letzte_schule}${a.letzte_schulform ? ` (${a.letzte_schulform})` : ''}`);
  if (a.entlassjahrgang) teile.push(`Entlassjg.: ${a.entlassjahrgang}`);
  if (String(a.migrationshintergrund) === '1') {
    const mig = [a.geburtsland_mutter && `Mutter ${a.geburtsland_mutter}`, a.geburtsland_vater && `Vater ${a.geburtsland_vater}`,
      a.muttersprache && `Mutterspr. ${a.muttersprache}`, a.familiensprache && `Familienspr. ${a.familiensprache}`].filter(Boolean);
    if (mig.length) teile.push(`Migration: ${mig.join(', ')}`);
  }
  return f(teile.join('; '), 255);
}

function zusatzdaten(a) {
  return zeile([
    ...kennung(a),
    '', '',                         // 4 Namenszusatz, 5 Geburtsname
    f(a.geburtsort, 30),            // 6
    f(a.ortsteil, 30),              // 7
    '', '', '',                     // 8 Telefon, 9 E-Mail, 10 2. Staatsang.
    f(`ANM-${a.id}`, 30),           // 11 Externe ID-Nr
    '', '', '', '', '', '', '',     // 12–18
    bemerkung(a),                   // 19 Bemerkungen
    '', '',                         // 20, 21 (nur BK)
    datum(a.anmeldedatum),          // 22 Anmeldedatum
    '', '', '', '', '',             // 23–27
    jn(a.masernschutz_nachweis),    // 28 Masern-Impfnachweis
    '',                             // 29 bisherige ID
  ]);
}

// ---------------------------------------------------------------- SchuelerGSDaten.dat (20 Felder, nur Klasse 5)

const KOPF_GS = ['Nachname', 'Vorname', 'Geburtsdatum', 'Sprachgebrauch', 'Lesen', 'Rechtschreiben', 'Sachunterricht',
  'Mathematik', 'Englisch', 'KunstTextil', 'Musik', 'Sport', 'Religion', 'Durchschnittsnote_Sprache',
  'Durchschnittsnote_Einfach', 'Durchschnittsnote_Gewichtet', 'Anrede_Klassenlehrer', 'Klassenlehrer', 'Klasse', 'Geschwisterkind'];

function gsdaten(a) {
  const m = /^\s*(Frau|Herr)\s+(.+)$/i.exec(a.klassenlehrkraft ?? '');
  const anrede = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : '';
  const lehrkraft = m ? m[2] : a.klassenlehrkraft;
  return zeile([
    ...kennung(a),
    '', '', '', '', '', '', '', '', '', '', // 4–13 Noten
    '', '', '',                             // 14–16 Durchschnitte
    anrede, f(lehrkraft, 50), '',
    jn(a.geschwisterkind_am_mng),
  ]);
}

// ---------------------------------------------------------------- Gesamt

/**
 * @param anmeldungen vollständige Datensätze (GET anmeldung)
 * @param opt { jahrgang: 'zweistellig' | 'einstellig' | 'leer' }
 * @returns { 'SchuelerBasisdaten.dat': '…', … }
 */
export function schildDateien(anmeldungen, opt = { jahrgang: 'zweistellig' }) {
  const dateien = {
    'SchuelerBasisdaten.dat': [zeile(KOPF_BASIS), ...anmeldungen.map((a) => basisdaten(a, opt))],
    'SchuelerZusatzdaten.dat': [zeile(KOPF_ZUSATZ), ...anmeldungen.map(zusatzdaten)],
    'SchuelerErzieher.dat': [zeile(KOPF_ERZIEHER), ...anmeldungen.flatMap(erzieher)],
    'SchuelerTelefonnummern.dat': [zeile(KOPF_TELEFON), ...anmeldungen.flatMap(telefonnummern)],
  };
  const ep = anmeldungen.filter((a) => a.formular === 'EP');
  if (ep.length) dateien['SchuelerGSDaten.dat'] = [zeile(KOPF_GS), ...ep.map(gsdaten)];
  // UTF-8 mit BOM, Windows-Zeilenenden
  return Object.fromEntries(Object.entries(dateien).map(([name, zeilen]) => [name, '﻿' + zeilen.join('\r\n') + '\r\n']));
}

// ---------------------------------------------------------------- ZIP (ohne Kompression, ohne Bibliothek)

const CRC_TABELLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABELLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param dateien { name: text } → Blob (application/zip) */
export function zip(dateien) {
  const enc = new TextEncoder();
  const jetzt = new Date();
  const zeit = (jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | (jetzt.getSeconds() >> 1);
  const tag = ((jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate();
  const teile = [], verzeichnis = [];
  let offset = 0;
  for (const [name, text] of Object.entries(dateien)) {
    const n = enc.encode(name), d = enc.encode(text), crc = crc32(d);
    const kopf = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, zeit, 2], [12, tag, 2], [14, crc, 4], [18, d.length, 4], [22, d.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, l]) => (l === 4 ? kopf.setUint32(o, v, true) : kopf.setUint16(o, v, true)));
    const zentral = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, zeit, 2], [14, tag, 2], [16, crc, 4], [20, d.length, 4], [24, d.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, l]) => (l === 4 ? zentral.setUint32(o, v, true) : zentral.setUint16(o, v, true)));
    teile.push(kopf, n, d);
    verzeichnis.push(zentral, n);
    offset += 30 + n.length + d.length;
  }
  const groesse = verzeichnis.reduce((s, x) => s + x.byteLength, 0);
  const ende = new DataView(new ArrayBuffer(22));
  const anzahl = Object.keys(dateien).length;
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, anzahl, 2], [10, anzahl, 2], [12, groesse, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([o, v, l]) => (l === 4 ? ende.setUint32(o, v, true) : ende.setUint16(o, v, true)));
  return new Blob([...teile, ...verzeichnis, ende], { type: 'application/zip' });
}
