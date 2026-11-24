/**
 * Druckfassung des Anmeldebogens.
 *
 * Bildet die Word-Vorlagen (quelldokumente/Anmeldebogen_EP|MS_*.docx) seitengenau nach:
 * A4, feste Seitenumbrüche wie im Original, alle Positionen in mm.
 * Eingaben werden in die Felder eingesetzt; leere Felder bleiben leer (Blanko-Bogen).
 *
 * Maße: Tabellenkante links = 15.5 mm vom Blattrand, Tabellenbreite 178.8 mm.
 * Die Tab-Positionen (T.*) sind relativ zur linken Tabellenkante.
 */

const T = {
  a: 1.5,     // erste Spalte (Beschriftungen)
  b: 39.1,    // Halbjahr, Telefon (Notfall), Religion-Optionen
  c: 43.4,    // Übergangsempfehlung-Optionen
  d: 64.0,    // zweite Spalte Schülerdaten
  e: 76.5,    // zweite Spalte Erziehungsberechtigte / Migration
  f: 88.9,    // „ja“-Spalte
  g: 101.4,   // Status (Notfall), „nein“ Migration
  h: 113.8,   // „nein“-Spalte
  i: 126.5,   // Anmeldedatum, Keine Teilnahme
  j: 139.7,   // „ja“ Weitere Angaben
  k: 163.6,   // „nein“ Weitere Angaben
  ende: 177.6,
};

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const datum = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? iso.split('-').reverse().join('.') : esc(iso));
const kb = (an) => `<span class="kb${an ? ' x' : ''}"></span>`;
const fn = (n) => `<sup>${n})</sup>`;

/** Beschriftung + eingesetzter Wert */
const lv = (label, wert) => `<b>${label}</b>${wert ? `<span class="v">${esc(wert)}</span>` : ''}`;

/** Zelle an fester Tab-Position; Breite reicht bis zur nächsten Zelle bzw. Tabellenende */
function zeile(hoehe, zellen, klasse = '') {
  const sortiert = [...zellen].sort((x, y) => x[0] - y[0]);
  const html = sortiert.map(([links, inhalt], n) => {
    const rechts = n + 1 < sortiert.length ? sortiert[n + 1][0] : T.ende;
    return `<div class="t" style="left:${links}mm;width:${rechts - links - 0.8}mm">${inhalt}</div>`;
  }).join('');
  return `<div class="z ${klasse}" style="height:${hoehe}mm">${html}</div>`;
}

/** Ganztagsangebote und die Tage, an denen sie angeboten werden (wie im Formular) */
const GANZTAG_TAGE = { MINT: ['Di'], Bilingual: ['Di'], Hausaufgabenbetreuung: ['Mo', 'Di', 'Do'] };

const kopf = (titel, hoehe = 7.2, dy = 0) => `<div class="z abschnitt" style="height:${hoehe}mm"><div class="t" style="left:${T.a}mm${dy ? `;margin-top:${dy}mm` : ''}">${titel}</div></div>`;
const jaNein = (wert, ja = T.f, nein = T.h) => [[ja, `${kb(wert === '1')} <b>ja</b>`], [nein, `${kb(wert === '0')} <b>nein</b>`]];

// ------------------------------------------------------------------ Seitenteile

function seite(nr, inhalt) {
  return `<section class="seite">
    <header>
      <p class="schule">Städt. Mathematisch-Naturwissenschaftliches Gymnasium</p>
      <p class="titel">A N M E L D U N G</p>
      <img src="img/logo.png" alt="">
    </header>
    ${inhalt}
    <footer>Seite ${nr} von 3</footer>
  </section>`;
}

function tabelleSchueler(d, ms) {
  const a = d.anmeldung;
  const stufe = Number(a.jahrgangsstufe) || 5;
  const gt = (angebot, tag) => d.ganztag.some((g) => g.angebot === angebot && g.tag === tag);
  const rel = (w) => kb(a.religion === w);
  const ru = (w) => kb(a.religionsunterricht === w);

  return [
    zeile(8.6, [[T.a, lv('Schuljahr:', a.schuljahr)], [T.b, lv('Halbjahr:', a.halbjahr)], [T.d, lv('Jahrgangsstufe:', a.jahrgangsstufe)], [T.i, lv('Anmeldedatum:', datum(a.anmeldedatum))]], 'dick-unten'),
    kopf('DATEN DER SCHÜLERIN / DES SCHÜLERS', 7.5),
    zeile(8.2, [[T.a, lv('Name:', a.name)]]),
    zeile(7.8, [[T.a, lv('Vorname:', a.vorname)], [T.d, lv('weitere Vornamen:', a.weitere_vornamen)]]),
    zeile(8.0, [[T.a, lv('Straße:', a.strasse)], [T.d, lv('Haus-Nr.:', a.hausnummer)]]),
    zeile(7.8, [[T.a, lv('PLZ, Wohnort:', [a.plz, a.wohnort].filter(Boolean).join(' '))], [T.d, lv('Ortsteil:', a.ortsteil)]]),
    zeile(8.2, [[T.a, lv('Geburtsdatum:', datum(a.geburtsdatum))], [T.d, lv('Geburtsort:', a.geburtsort)]]),
    zeile(6.4, [[T.a, lv('Staatsangehörigkeit(en):', a.staatsangehoerigkeit)], [T.d, lv('Geburtsland:', a.geburtsland)]]),
    zeile(7.2, [[T.a, `<b>Religionszugehörigkeit:</b>`], [38.7, `${rel('ev')} <b>evangelisch</b>`], [59.3, `${rel('kath')} <b>katholisch</b>`],
      [79.3, `${rel('islam')} <b>islamisch</b>`], [97.3, `${rel('ohne')} <b>ohne Bekenntnis</b>`],
      [125.7, `${rel('sonstige')}<span class="linie" style="width:43.4mm">${esc(a.religion_sonstige)}</span>`]]),
    zeile(8.1, [[T.a, `<b>Teilnahme&nbsp; am Religionsunterricht:</b>`], [T.d, `${ru('ev')} <b>evangelisch</b>`], [T.f, `${ru('kath')} <b>katholisch</b>`], [T.h, `${ru('pp')} <b>Praktische Philosophie</b>`]]),
    // Ganztag nur Stufe 5–6, Fremdsprache ab Stufe 7, Wahlpflichtfach ab Stufe 9 (wie im Formular)
    stufe > 6 ? '' : `<div class="z ganztag" style="height:19.9mm">
      <div class="t" style="left:${T.a}mm;top:.85mm"><b>Teilnahmewunsch am Ganztag:</b></div>
      <div class="t" style="left:${T.i - 0.38}mm;top:.85mm">${kb(a.ganztag_teilnahme === '0')} <b>Keine Teilnahme</b></div>
      <div class="t" style="left:51.3mm;top:4.45mm"><b>Montag</b></div>
      <div class="t" style="left:76.5mm;top:4.45mm"><b>Dienstag</b></div>
      <div class="t" style="left:101.4mm;top:4.45mm"><b>Donnerstag</b></div>
      ${['MINT', 'Bilingual', 'Hausaufgabenbetreuung'].map((ang, r) => `
        <div class="t" style="left:${T.a}mm;top:${[7.99, 11.25, 14.77][r]}mm"><b>${ang === 'Hausaufgabenbetreuung' ? ang : ang + ':'}</b></div>
        ${[['Mo', 55.5], ['Di', 81.27], ['Do', 105.42]].filter(([tag]) => GANZTAG_TAGE[ang].includes(tag))
          .map(([tag, x]) => `<div class="t" style="left:${x - 0.6}mm;top:${[7.99, 11.25, 14.77][r]}mm">${kb(gt(ang, tag))}</div>`).join('')}`).join('')}
    </div>`,
    stufe >= 7 ? zeile(7.8, [[T.a, `<b>Teilnahme an:</b>`], [T.d, `${kb(a.teilnahme_mint === '1')} <b>MINT</b>`], [T.f, `${kb(a.teilnahme_bilingual === '1')} <b>Bilingual</b>`], [T.h, `${kb(a.teilnahme_mint === '0' && a.teilnahme_bilingual === '0')} <b>keine Teilnahme</b>`]]) : '',
    stufe >= 7 ? zeile(8.1, [[T.a, lv('Fremdsprachenwahl ab Klasse 7:', a.fremdsprache_ab_7)]]) : '',
    stufe >= 9 ? zeile(7.8, [[T.a, lv('Wahlpflichtfach ab Klasse 9:', a.wahlpflichtfach_ab_9)]]) : '',
    zeile(8.2, [[T.a, `<b>Antrag „Schülerfahrkostenerstattung“ ${fn(1)} :</b>`], ...jaNein(a.fahrkosten_antrag)]),
    zeile(8.2, [[T.a, `<b><i>Vom Sekretariat auszufüllen →&nbsp; Masernschutznachweis:</i></b>`],
      [T.f, `${kb(a.masernschutz_nachweis === '1')} <b><i>ja</i></b>`], [T.h, `${kb(a.masernschutz_nachweis === '0')} <b><i>nein</i></b>`]], `sekretariat${ms ? ' grau' : ''}`),
    zeile(8.2, [[T.a, `<b>Geschwisterkind ist auch Schulkind am MNG:</b>`], ...jaNein(a.geschwisterkind_am_mng)], 'hoch'),
    `<div class="z fliess dick-unten" style="height:10.7mm"><p style="position:relative;top:-.45mm;left:-.2mm">&nbsp;${kb(a.kenntnis_pflichtveranstaltungen === '1')} <b>Ich habe zur Kenntnis genommen, dass die Teilnahme meines Kindes am Schwimmunterricht und an Klassen- und Studienfahrten verpflichtend ist.</b></p></div>`,
  ].join('');
}

function tabelleEltern(d) {
  const [e1, e2] = d.erziehungsberechtigte;
  const rolle = (e, x1, x2, x3) => [[x1, `${kb(e.rolle === 'mutter')} <b>Mutter</b>`], [x2, `${kb(e.rolle === 'vater')} <b>Vater</b>`], [x3, `${kb(e.rolle === 'sonstige')} <b>sonstige</b>`]];
  const paar = (label, feld) => zeile(8.0, [[T.a, lv(label, e1[feld])], [T.e, lv(label, e2[feld])]]);
  const zeilen = [
    kopf('DATEN DER ERZIEHUNGSBERECHTIGTEN', 7.5),
    zeile(8.0, [...rolle(e1, T.a, 17.5, 31.8), ...rolle(e2, T.e, 92.7, 106.5)]),
    paar('Name:', 'name'),
    paar('Vorname:', 'vorname'),
    zeile(8.0, [[T.a, '<b>sorgeberechtigt:</b>'], [30.7, `${kb(e1.sorgeberechtigt === '1')} <b>ja</b>`], [T.b, `${kb(e1.sorgeberechtigt === '0')} <b>nein</b>`],
      [T.e, '<b>sorgeberechtigt:</b>'], [105.7, `${kb(e2.sorgeberechtigt === '1')} <b>ja</b>`], [T.h, `${kb(e2.sorgeberechtigt === '0')} <b>nein</b>`]]),
    paar('Geburtsland:', 'geburtsland'),
    paar(`Straße${fn(2)}:`, 'strasse'),
    paar(`PLZ, Wohnort${fn(2)}:`, 'plz_wohnort'),
    paar('Telefon:', 'telefon'),
    paar('Mobil:', 'mobil'),
    paar('Telefon Arbeit:', 'telefon_arbeit'),
    paar('E-Mail:', 'email'),
  ];
  return zeilen.join('');
}

function tabelleRest(d, ms) {
  const a = d.anmeldung;
  const [n1, n2] = d.notfallkontakte;
  const notfall = (n) => zeile(7.9, [[T.a, lv('Name:', n.name)], [T.b, lv('Telefon:', n.telefon)], [T.g, lv(`Status${fn(3)}:`, n.status)]]);
  const ue = (w) => kb(a.uebergangsempfehlung === w);
  const einw = (text, wert) => `<div class="z fliess" style="height:10mm">
      <p class="normal" style="width:169.2mm">${text}</p>
      <div class="t unten" style="left:${T.j}mm">${kb(wert === '1')} <b>ja</b></div>
      <div class="t unten" style="left:${T.k}mm">${kb(wert === '0')}<b>nein</b></div>
    </div>`;

  return [
    kopf('ZUSÄTZLICHE NOTFALLINFORMATIONEN', 6.6),
    `<div class="z fliess mittel-unten" style="height:10.6mm"><p class="normal">Die folgenden Personen dürfen über die Erziehungsberechtigten hinaus im Notfall (Erkrankung, Unfall etc.) informiert werden und sind dann entscheidungsbefugt:</p></div>`,
    notfall(n1),
    notfall(n2),
    kopf('MIGRATIONSHINTERGRUND', 7.1),
    zeile(8.0, [[T.a, '<b>Besteht ein Migrationshintergrund:</b>'], ...jaNein(a.migrationshintergrund, T.e - 0.4, T.g)]),
    zeile(8.0, [[T.a, lv('Geburtsland des Kindes:', a.geburtsland)], [T.e, lv('Zuzugsjahr:', a.zuzugsjahr)]]),
    zeile(8.0, [[T.a, lv('Geburtsland der Mutter:', a.geburtsland_mutter)], [T.e, lv('Geburtsland des Vaters:', a.geburtsland_vater)]]),
    zeile(8.0, [[T.a, lv('Muttersprache des Kindes:', a.muttersprache)], [T.e, lv('In der Familie gesprochene Sprache:', a.familiensprache)]]),
    kopf('DATEN ZUR SCHULLAUFBAHN', 7.1),
    zeile(7.9, [[T.a, lv('Einschulungsjahr Grundschule:', a.einschulungsjahr)]]),
    // letzte Schule nur bei Quereinstieg (MS); bei Kl. 5 wird der Platz dem Freitext „Sonstige Informationen“ zugeschlagen
    ...(ms ? [
      zeile(7.9, [[T.a, lv('Schulform der letzten Schule:', a.letzte_schulform)], [T.f, lv('Entlassjahrgang:', a.entlassjahrgang)]]),
      zeile(7.9, [[T.a, lv('Name der letzten Schule:', a.letzte_schule)]]),
    ] : []),
    zeile(6.4, [[T.a, lv('Name der Klassenlehrkraft:', a.klassenlehrkraft)]]),
    `<div class="z ueberg" style="height:10.7mm">
      <div class="t" style="left:${T.a}mm;top:1.8mm"><b>Übergangsempfehlung:</b></div>
      <div class="t" style="left:${T.c - 0.18}mm;top:1.8mm">${ue('GY')} <b>Gymnasium</b></div>
      <div class="t" style="left:${T.e - 0.41}mm;top:1.8mm">${ue('RS_GY_eing')} <b>Realschule/Gymnasium eingeschränkt</b></div>
      <div class="t" style="left:${T.c - 0.18}mm;top:5.8mm">${ue('RS')} <b>Realschule</b></div>
      <div class="t" style="left:63.6mm;top:5.8mm">${ue('HS_RS_eing')} <b>Hauptschule/Realschule eingeschränkt</b></div>
      <div class="t" style="left:${T.i - 0.46}mm;top:5.8mm">${ue('HS')} <b>Hauptschule</b></div>
    </div>`,
    kopf('WEITERE ANGABEN', 7.4),
    einw('Ich bin/Wir sind damit einverstanden, dass Fotos aus dem schulischen Leben, auf denen Ihr Kind zu sehen ist, in Veröffentlichungen (z. B. Presseartikel, Schulhomepage) verwendet werden.', a.einwilligung_fotos),
    `<div class="z fliess" style="height:10mm"><p class="normal">${kb(a.kenntnis_digitale_kommunikation === '1')} Ich habe zur Kenntnis genommen, dass Lehrkräfte mit meinem Kind digital kommunizieren und Informationen per Schulmessenger (aktuell WebUntis), über das Pädagogische Netz und per E-Mail austauschen.</p></div>`,
    `<div class="z fliess" style="height:8.6mm"><p class="normal">${kb(a.kenntnis_elterninfo_messenger === '1')} Ich habe zur Kenntnis genommen, dass Elterninformationen weitestgehend über den Schulmessenger (aktuell WebUntis) verschickt werden.</p></div>`,
    kopf(`SONSTIGE INFORMATIONEN ${fn(4)}`, 8.0, -0.47),
    `<div class="z freitext" style="height:${ms ? 57.8 : 41.0}mm"><p>${esc(a.sonstige_informationen)}</p></div>`,
    kopf('GEWÜNSCHTE MITSCHÜLERINNEN ODER MITSCHÜLER, WEITERE BEMERKUNGEN', 7.1),
    ms ? '' : `<div class="z freitext" style="height:36.3mm"><p>${esc(a.wunsch_mitschueler)}</p></div>`,
  ].join('');
}

function erklaerungen(d, top, ortTop, mitGrundschule = false) {
  const a = d.anmeldung;
  return `<div class="erklaerungen" style="top:${top}mm">
    <p>${kb(a.vodv_erhalten === '1')} Hiermit bestätige ich, dass ich die <a href="https://bass.schule.nrw/101.htm">VO-DV I</a> (Verordnung über die zur Verarbeitung zugelassenen Daten von Schülerinnen, Schülern und Eltern) zur Kenntnis genommen habe.</p>
    ${mitGrundschule ? grundschule(d) : ''}
  </div>
  ${unterschrift({ top: ortTop, links: 15.5, ortStrich: 21.4, datumX: 37.1, sigX: 74.9, sigBreite: 56.9 })}`;
}

/** Nur Kl. 5: Einverständnis zur Kontaktaufnahme mit der Grundschule */
function grundschule(d) {
  const a = d.anmeldung;
  return `<div class="grundschule">
    <p class="titel">Einverständniserklärung Kontakt zur Grundschule</p>
    <p>Um Ihr Kind bei Bedarf zeitnah fördern zu können, würden wir gerne Kontakt zur Grundschule aufnehmen. Unser Ziel ist es, möglichst schnell und zielgenau mit einer etwaigen Förderung starten zu können, damit der Übergang reibungslos erfolgt. Hierfür benötigen wir Ihre Einverständniserklärung.</p>
    <p class="kasten">${kb(a.grundschule_kontakt === '1')} Ich bin damit einverstanden, dass das MathNat-Gymnasium Kontakt zur Grundschule aufnimmt, damit die Förderung meines Kindes möglichst schnell erfolgen kann.</p>
    <p class="kasten">${kb(a.grundschule_hsp === '1')} In diesem Zusammenhang darf die Grundschule die Ergebnisse der Hamburger Schreib-Probe (HSP) weitergeben.</p>
    <p class="kasten">${kb(a.grundschule_kontakt === '0')} Ich möchte nicht, dass das MathNat-Gymnasium Kontakt zur Grundschule aufnimmt.</p>
  </div>`;
}

/** Ort/Datum + Unterschrift. Koordinaten relativ zum umgebenden Element (Seite oder Hinweiskasten). */
function unterschrift({ top, links, ortStrich, datumX, sigX, sigBreite, bezTop = 5.03, klasse = '' }) {
  return `<div class="unterschrift ${klasse}" style="top:${top}mm;left:${links}mm">
    <div class="ort">Mönchengladbach, den<span class="strich" style="width:${ortStrich}mm"></span></div>
    <div class="sig" style="left:${sigX}mm"><span class="strich" style="width:${sigBreite}mm"></span></div>
    <div class="bez" style="left:${datumX}mm;top:${bezTop}mm">Datum</div>
    <div class="bez" style="left:${sigX}mm;top:${bezTop}mm">Unterschrift(en) Erziehungsberechtigten</div>
  </div>`;
}

function hinweisEP(d) {
  const a = d.anmeldung;
  const wunsch = (nr, wert, top) => `<div class="wunsch" style="top:${top}mm"><span>${nr}.)</span><span class="strich lang">${esc(wert)}</span><div class="unterzeile">Name der Schule</div></div>`;
  return `<div class="hinweis-ep">
    <h2>Wichtiger Hinweis!</h2>
    <p>Im Gebiet eines Schulträgers, z. B. der Stadt Mönchengladbach, sollen nach dem Willen des Gesetzgebers Schulleitung, Schulträger und Schulaufsichtsbehörde zusammenarbeiten, um in derselben Schulform auf gleichmäßige Klassenstärken hinzuwirken. Können von einer Schule nicht alle angemeldeten Schülerinnen und Schüler aufgenommen werden, erfolgt eine Verweisung an diejenigen Schulen, die noch über freie Aufnahmekapazitäten verfügen.</p>
    <p>Die grundsätzliche Wahlfreiheit der Eltern bezieht sich auf die Auswahl der Schulform; die Voraussetzungen für eine Aufnahme sind durch schulrechtliche Vorgaben konkretisiert. Nähere Erläuterungen finden Sie in der Informationsbroschüre „Allgemeinbildende weiterführende Schulen“. Ein Anspruch auf Aufnahme in eine bestimmte Schule besteht nicht.</p>
    <h3>Erklärung</h3>
    <p class="eng">Ich bin darüber informiert, dass mit dieser Anmeldung noch nicht über die Aufnahme meines Kindes an dieser Schule entschieden ist. Für den Fall, dass mein Kind an dieser Schule aus Kapazitätsgründen nicht aufgenommen werden kann, bin ich damit einverstanden, dass meine Anmeldung an nachfolgende Wunschschulen weitergeleitet werden:</p>
    ${wunsch(1, a.wunschschule_1, 58.4)}
    ${wunsch(2, a.wunschschule_2, 70.8)}
    <p class="nach-wunsch">Mir ist bekannt, dass ich ohne Angabe eines Zweitwunsches im Falle einer Nichtaufnahme meines Kindes gemeinsam mit dem „Nichtaufnahmebescheid“ der Schule auch den Anmeldeschein zurückerhalte und eine nochmalige Anmeldung meines Kindes an einer noch aufnahmefähigen Schule vornehmen muss.</p>
    ${unterschrift({ top: 104.07, links: 1.27, ortStrich: 19.5, datumX: 36.6, sigX: 75.2, sigBreite: 53.1, bezTop: 4.18, klasse: 'im-kasten' })}
  </div>`;
}

function fussnoten(top) {
  return `<div class="fussnoten" style="top:${top}mm">
    <p>${fn(1)} Nach § 5 Abs. 2 SchfkVO NRW entstehen notwendige Schülerfahrkosten, wenn die einfache Entfernung zwischen Wohnung und Schule folgende Grenzen überschreitet: <b>3,5 km bei Sekundarstufe I</b> .<br>Es zählt grundsätzlich der kürzeste Fußweg zur nächstgelegenen Schule der besuchten Schulform.</p>
    <p>${fn(2)} Nur angeben, falls die Anschrift abweichend von den Angaben der Schülerin/des Schülers ist. Basierend auf § 120 SchulG NRW dienen diese Angaben ausschließlich zur schulischen Kommunikation.</p>
    <p>${fn(3)} z. B. Großmutter, Großvater etc.</p>
    <p>${fn(4)}&nbsp; z.B.&nbsp; Hinweise auf Behinderungen, gesundheitliche Einschränkungen, Probleme im häuslichen Umfeld</p>
  </div>`;
}

// ------------------------------------------------------------------ Gesamtdokument

export function druckHtml(daten) {
  const d = {
    anmeldung: {},
    ganztag: [],
    ...daten,
    erziehungsberechtigte: [0, 1].map((i) => daten.erziehungsberechtigte?.[i] ?? {}),
    notfallkontakte: [0, 1].map((i) => daten.notfallkontakte?.[i] ?? {}),
  };
  const ms = d.formular === 'MS';

  if (!ms) {
    return [
      seite(1, `<div class="tabelle">${tabelleSchueler(d, false)}${tabelleEltern(d)}</div>`),
      seite(2, `<div class="tabelle">${tabelleRest(d, false)}</div>`),
      seite(3, `${erklaerungen(d, 34.5, 81.3, true)}${hinweisEP(d)}${fussnoten(224.8)}`),
    ].join('');
  }
  return [
    // Ab Stufe 6 entfällt auf Seite 1 immer mindestens ein Block (Ganztag bzw. Fremdsprache/Wahlpflichtfach),
    // daher passen die Erziehungsberechtigten samt E-Mail vollständig auf Seite 1.
    seite(1, `<div class="tabelle">${tabelleSchueler(d, true)}${tabelleEltern(d)}</div>`),
    seite(2, `<div class="tabelle" style="margin-top:-.2mm">${tabelleRest(d, true)}</div>`),
    seite(3, `<div class="tabelle" style="margin-top:-.2mm"><div class="z freitext" style="height:23.4mm"><p>${esc(d.anmeldung.wunsch_mitschueler)}</p></div></div>
              ${erklaerungen(d, 62.7, 80.5)}${fussnoten(203.13)}`),
  ].join('');
}

export function renderDruck(daten, ziel = document.getElementById('druck')) {
  ziel.innerHTML = druckHtml(daten);
}
