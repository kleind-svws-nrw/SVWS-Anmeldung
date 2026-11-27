import { api, setzeApiUrl } from './api.js?v=20261127-6';
import { renderDruck } from './druck.js?v=20261127-6';

const form = document.getElementById('anmeldeformular');

// Nachbearbeitung durch das Sekretariat: index.html?bearbeiten=<Nr.> (aus dem Verwaltungsbereich)
const BEARBEITEN_ID = Number(new URLSearchParams(location.search).get('bearbeiten')) || null;
if (BEARBEITEN_ID) setzeApiUrl('admin/api.php');
const meldung = document.getElementById('meldung');

// ---------------------------------------------------------------- Aufbau

// Zwei Spalten Erziehungsberechtigte aus der Vorlage erzeugen
const vorlage = document.getElementById('eb-vorlage');
for (const i of [0, 1]) {
  const html = vorlage.innerHTML.replaceAll('{i}', i).replaceAll('{n}', i + 1);
  vorlage.insertAdjacentHTML('beforebegin', html);
}

// ---------------------------------------------------------------- Pflichtfelder
// Grundsatz: alles ist Pflicht. Ausgenommen sind
//   - Felder/Abschnitte mit data-optional (z. B. Notfallinformationen, Telefon/E-Mail der Erziehungsberechtigten),
//   - Erziehungsberechtigte/r 2: erst Pflicht, sobald dort etwas eingetragen ist,
//   - Ankreuz-Gruppen: dort prüft je eine eigene Regel „mindestens eine Auswahl“ (siehe unten),
//   - deaktivierte/ausgeblendete Felder (werden vom Browser ohnehin nicht geprüft).
const EB2 = () => form.querySelectorAll('.eb')[1];
for (const el of form.elements) {
  if (!el.name || ['hidden', 'submit', 'button', 'checkbox'].includes(el.type)) continue;
  if (el.closest('[data-optional]') || el.hasAttribute('data-optional')) continue;
  el.required = true;
  if (EB2().contains(el)) el.dataset.pflichtWennAusgefuellt = '';
}
function aktualisiereEB2() {
  const felder = [...EB2().querySelectorAll('input')];
  const ausgefuellt = felder.some((f) => (f.type === 'radio' ? f.checked : f.value.trim() !== ''));
  for (const f of felder) if (f.dataset.pflichtWennAusgefuellt !== undefined) f.required = ausgefuellt;
}
form.addEventListener('input', (e) => { if (EB2().contains(e.target)) aktualisiereEB2(); });
form.addEventListener('change', (e) => { if (EB2().contains(e.target)) aktualisiereEB2(); });
aktualisiereEB2();

// Anmeldedatum vorbelegen
if (!form.elements['anmeldung.anmeldedatum'].value) {
  form.elements['anmeldung.anmeldedatum'].value = new Date().toISOString().slice(0, 10);
}

// Verbindung prüfen
api('ping')
  .then(() => setStatus('api-status', '', ''))
  .catch((e) => setStatus('api-status', `Server nicht erreichbar: ${e.message}`, 'fehler'));

// ---------------------------------------------------------------- Verhalten

form.addEventListener('change', (e) => {
  const el = e.target;
  if (el.name === 'anmeldung.jahrgangsstufe') aktualisiereFormulartyp();
  if (el.name === 'ganztag_keine' || el.name === 'ganztag') aktualisiereGanztag(el);
  if (el.name === 'teilnahme_keine' || el.name === 'anmeldung.teilnahme_mint' || el.name === 'anmeldung.teilnahme_bilingual') aktualisiereTeilnahme(el);
  if (el.name === 'anmeldung.religion') aktualisiereAbhaengige();
  if (el.name === 'anmeldung.migrationshintergrund') aktualisiereMigration();
  if (el.name === 'anmeldung.grundschule_kontakt' || el.name === 'anmeldung.grundschule_hsp') aktualisiereGrundschule(el);
});

// Jahresfelder (data-jahr, z. B. Einschulungsjahr): vierstellige Jahreszahl, nicht vor 1990 und nicht in der Zukunft
const JAHR_MIN = 1990;
function pruefeJahr(feld) {
  const wert = feld.value.trim();
  const jahr = Number(wert);
  const max = new Date().getFullYear();
  let fehler = '';
  if (wert !== '' && !/^\d{4}$/.test(wert)) fehler = 'Bitte das Jahr vierstellig angeben, z. B. 2014.';
  else if (wert !== '' && (jahr < JAHR_MIN || jahr > max)) fehler = `Bitte ein Jahr zwischen ${JAHR_MIN} und ${max} angeben.`;
  feld.setCustomValidity(fehler);
  return !fehler;
}
for (const feld of form.querySelectorAll('[data-jahr]')) {
  feld.addEventListener('input', () => pruefeJahr(feld));
  feld.addEventListener('blur', () => { if (!pruefeJahr(feld)) feld.reportValidity(); });
}

// Felder, die im Bogen zweimal vorkommen (Geburtsland), synchron halten
form.addEventListener('input', (e) => {
  const el = e.target;
  if (el.type !== 'text' && el.tagName !== 'INPUT') return;
  for (const zwilling of form.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`)) {
    if (zwilling !== el && zwilling.type === el.type && el.type !== 'radio' && el.type !== 'checkbox') {
      zwilling.value = el.value;
    }
  }
});

function aktualisiereFormulartyp() {
  const stufe = Number(form.elements['anmeldung.jahrgangsstufe'].value);
  const typ = stufe === 5 ? 'EP' : 'MS';
  form.elements.formular.value = typ;
  // Abschnitte ein-/ausblenden:
  //   data-nur="EP|MS"     → nach Bogen (Stufe 5 bzw. 6–10)
  //   data-stufen="von-bis" → nach Jahrgangsstufe, z. B. "5-6", "9-10"
  const bedingt = form.querySelectorAll('[data-nur], [data-stufen]');
  for (const abschnitt of bedingt) {
    if (abschnitt.dataset.nur) abschnitt.hidden = abschnitt.dataset.nur !== typ;
    else {
      const [von, bis = von] = abschnitt.dataset.stufen.split('-').map(Number);
      abschnitt.hidden = stufe < von || stufe > bis;
    }
  }
  // Felder in ausgeblendeten Abschnitten deaktivieren: sie werden weder validiert noch gespeichert noch gedruckt.
  for (const abschnitt of bedingt) {
    for (const feld of abschnitt.querySelectorAll('input, select, textarea')) {
      feld.disabled = !!feld.closest('[data-nur][hidden], [data-stufen][hidden]');
    }
  }
  aktualisiereTeilnahme();
  aktualisiereGanztag();
}

// Teilnahme an MINT und/oder Bilingual (Stufe 7–10). Erlaubt sind genau:
//   MINT | Bilingual | MINT + Bilingual | keine Teilnahme
// „keine Teilnahme“ entfernt die anderen Haken und graut sie aus; ein Haken bei MINT/Bilingual entfernt „keine Teilnahme“.
// Solange die Frage sichtbar ist, muss eine der Möglichkeiten gewählt sein.
function aktualisiereTeilnahme(ausloeser) {
  const keine = form.elements.teilnahme_keine;
  const angebote = [form.elements['anmeldung.teilnahme_mint'], form.elements['anmeldung.teilnahme_bilingual']];
  if (ausloeser && ausloeser !== keine && ausloeser.checked) keine.checked = false;
  const aus = keine.checked && !keine.disabled;
  for (const feld of angebote) {
    if (aus) feld.checked = false;
    feld.disabled = aus || keine.disabled;
    feld.closest('label').classList.toggle('ausgegraut', aus);
  }
  const fehlt = !keine.disabled && !keine.checked && !angebote.some((f) => f.checked);
  keine.setCustomValidity(fehlt ? 'Bitte MINT und/oder Bilingual oder „keine Teilnahme“ ankreuzen.' : '');
}

function aktualisiereGanztag(ausloeser) {
  const keine = form.elements.ganztag_keine;
  const tage = [...form.querySelectorAll('input[name="ganztag"]')];
  if (ausloeser === keine && keine.checked) tage.forEach((t) => (t.checked = false));
  if (ausloeser?.name === 'ganztag' && ausloeser.checked) {
    keine.checked = false;
    // Dienstags ist nur ein Angebot möglich (MINT, Bilingual oder Hausaufgabenbetreuung)
    const tag = ausloeser.value.split(':')[1];
    if (tag === 'Di') tage.filter((t) => t !== ausloeser && t.value.endsWith(':Di')).forEach((t) => (t.checked = false));
  }
  // „Keine Teilnahme“ graut die Angebotstabelle aus
  const aus = keine.checked && !keine.disabled;
  for (const t of tage) {
    if (aus) t.checked = false;
    t.disabled = aus || keine.disabled;
  }
  document.getElementById('ganztag-tabelle').classList.toggle('ausgegraut', aus);
  const fehlt = !keine.disabled && !keine.checked && !tage.some((t) => t.checked);
  keine.setCustomValidity(fehlt ? 'Bitte mindestens ein Ganztagsangebot oder „Keine Teilnahme“ ankreuzen.' : '');
}

// Kontakt zur Grundschule (nur Kl. 5): „einverstanden“ und „nicht einverstanden“ schließen sich aus,
// die HSP-Weitergabe setzt das Einverständnis voraus.
function aktualisiereGrundschule(ausloeser) {
  const ja = form.querySelector('input[name="anmeldung.grundschule_kontakt"][value="1"]');
  const nein = form.querySelector('input[name="anmeldung.grundschule_kontakt"][value="0"]');
  const hsp = form.elements['anmeldung.grundschule_hsp'];
  if (ausloeser && !ausloeser.checked) {
    if (ausloeser === ja) hsp.checked = false;
  } else if (ausloeser === nein) ja.checked = hsp.checked = false;
  else if (ausloeser) {
    nein.checked = false;
    if (ausloeser === hsp) ja.checked = true;
  }
  // Pflicht: entweder Einverständnis oder ausdrücklich „nicht einverstanden“ (Erklärung der Eltern –
  // bei der Nachbearbeitung durch das Sekretariat nicht erzwungen)
  ja.setCustomValidity(!BEARBEITEN_ID && !ja.checked && !nein.checked ? 'Bitte ankreuzen, ob das Math-Nat-Gymnasium Kontakt zur Grundschule aufnehmen darf.' : '');
}

// Migrationshintergrund „nein“: Detailangaben ausgrauen. Deaktivierte Felder werden nicht gespeichert;
// das Geburtsland des Kindes kommt dann weiterhin aus den Schülerdaten (gleiches Feld).
function aktualisiereMigration() {
  const nein = form.querySelector('input[name="anmeldung.migrationshintergrund"]:checked')?.value === '0';
  const bereich = document.getElementById('migration-details');
  bereich.classList.toggle('ausgegraut', nein);
  for (const feld of bereich.querySelectorAll('input')) feld.disabled = nein;
}

function aktualisiereAbhaengige() {
  for (const el of form.querySelectorAll('[data-aktiv-wenn]')) {
    const [name, wert] = el.dataset.aktivWenn.split('=');
    const aktiv = form.querySelector(`input[name="${name}"]:checked`)?.value === wert;
    el.disabled = !aktiv;
    if (!aktiv) el.value = '';
  }
}

aktualisiereFormulartyp();
if (new URLSearchParams(location.search).has('vorschau')) document.body.classList.add('vorschau');
aktualisiereAbhaengige();
aktualisiereMigration();
aktualisiereGrundschule();

// ---------------------------------------------------------------- Drucken

document.getElementById('drucken').addEventListener('click', () => window.print());
// Druckfassung immer frisch aus den aktuellen Eingaben erzeugen (auch bei Strg+P)
window.addEventListener('beforeprint', () => renderDruck(formularDaten(form)));
renderDruck(formularDaten(form));

// ---------------------------------------------------------------- Nachbearbeitung durch das Sekretariat

if (BEARBEITEN_ID) starteBearbeitung(BEARBEITEN_ID);

async function starteBearbeitung(id) {
  document.body.classList.add('bearbeitung');
  // „Zurück“ vor „Drucken / PDF“: führt zur Anmeldung in der Verwaltung zurück
  const zurueck = Object.assign(document.createElement('button'), { type: 'button', className: 'zweitrangig', textContent: 'Zurück' });
  zurueck.addEventListener('click', () => { location.href = `admin/?id=${id}`; });
  document.getElementById('drucken').before(zurueck);
  form.querySelector('button[type="submit"]').textContent = 'Änderungen speichern';
  // Erklärungen und Kenntnisnahmen geben die Eltern ab – das Sekretariat muss sie nicht ankreuzen
  for (const box of form.querySelectorAll('.erklaerung input[type="checkbox"]')) box.required = false;
  try {
    const { daten } = await api('anmeldung', { params: { id } });
    befuelle(daten);
  } catch (e) {
    setStatus('meldung', `Anmeldung Nr. ${id} konnte nicht geladen werden: ${e.message}`, 'fehler');
    form.querySelector('button[type="submit"]').disabled = true;
  }
}

/** Gespeicherte Anmeldung (Datenbankzeile) in die Eingabemaske übernehmen */
function befuelle(a) {
  const setze = (name, wert) => {
    if (wert === null || wert === undefined) return;
    const w = String(wert);
    for (const el of form.querySelectorAll(`[name="${CSS.escape(name)}"]`)) {
      if (el.type === 'radio' || el.type === 'checkbox') el.checked = el.value === w;
      else el.value = w;
    }
  };
  const { erziehungsberechtigte = [], notfallkontakte = [], ganztag = [], ...anmeldung } = a;
  setze('anmeldung.jahrgangsstufe', anmeldung.jahrgangsstufe);
  for (const [k, v] of Object.entries(anmeldung)) if (k !== 'jahrgangsstufe') setze(`anmeldung.${k}`, v);
  for (const e of erziehungsberechtigte) {
    const i = Number(e.position) - 1;
    for (const [k, v] of Object.entries(e)) if (!['id', 'anmeldung_id', 'position'].includes(k)) setze(`erziehungsberechtigte.${i}.${k}`, v);
  }
  notfallkontakte.forEach((n, i) => {
    for (const [k, v] of Object.entries(n)) if (!['id', 'anmeldung_id'].includes(k)) setze(`notfallkontakte.${i}.${k}`, v);
  });
  const gewaehlt = new Set(ganztag.map((g) => `${g.angebot}:${g.tag}`));
  for (const el of form.querySelectorAll('input[name="ganztag"]')) el.checked = gewaehlt.has(el.value);
  form.elements.ganztag_keine.checked = String(a.ganztag_teilnahme) === '0';
  form.elements.teilnahme_keine.checked = String(a.teilnahme_mint) === '0' && String(a.teilnahme_bilingual) === '0';

  aktualisiereFormulartyp();
  aktualisiereAbhaengige();
  setze('anmeldung.religion_sonstige', a.religion_sonstige);
  aktualisiereMigration();
  aktualisiereGrundschule();
  aktualisiereEB2();
  for (const feld of form.querySelectorAll('[data-jahr]')) pruefeJahr(feld);
  renderDruck(formularDaten(form));
}

// ---------------------------------------------------------------- Absenden

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  form.classList.add('geprueft');
  if (!form.reportValidity()) {
    setStatus('meldung', 'Bitte die rot markierten Angaben ergänzen.', 'fehler');
    return;
  }
  // Absende-Knopf sperren: verhindert doppelte Anmeldungen (auch bei Doppelklick während des Speicherns)
  const absenden = form.querySelector('button[type="submit"]');
  absenden.disabled = true;
  if (BEARBEITEN_ID) {
    try {
      await api('anmeldung', { method: 'PUT', params: { id: BEARBEITEN_ID }, body: formularDaten(form) });
      setStatus('meldung', `Änderungen an Anmeldung Nr. ${BEARBEITEN_ID} gespeichert.`, 'gespeichert');
    } catch (err) {
      const details = Object.entries(err.details).map(([f, m]) => `${f}: ${m}`).join(', ');
      setStatus('meldung', `${err.message}${details ? ` (${details})` : ''}`, 'fehler');
    } finally {
      absenden.disabled = false; // bei der Nachbearbeitung mehrfach speicherbar
    }
    return;
  }
  try {
    await api('anmeldung', { method: 'POST', body: formularDaten(form) });
    setStatus('meldung', 'Anmeldung gespeichert. Vielen Dank! Sie können den Bogen jetzt noch ausdrucken.', 'gespeichert');
  } catch (err) {
    absenden.disabled = false; // nur bei Fehler wieder freigeben
    const details = Object.entries(err.details).map(([f, m]) => `${f}: ${m}`).join(', ');
    setStatus('meldung', `${err.message}${details ? ` (${details})` : ''}`, 'fehler');
  }
});

/**
 * Baut aus den Feldnamen das JSON für api.php:
 *   "anmeldung.name"               → { anmeldung: { name } }
 *   "erziehungsberechtigte.0.mail" → { erziehungsberechtigte: [{ mail }] }
 *   "ganztag" = "MINT:Mo"          → { ganztag: [{ angebot: 'MINT', tag: 'Mo' }] }
 * Felder in ausgeblendeten Abschnitten und leere Felder werden ignoriert.
 */
export function formularDaten(form) {
  const daten = { formular: form.elements.formular.value, anmeldung: {}, erziehungsberechtigte: [], notfallkontakte: [], ganztag: [] };

  for (const el of form.elements) {
    if (!el.name || el.disabled || el.closest('[hidden]') || el.closest('template')) continue;
    if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
    const wert = (el.value ?? '').trim();
    if (wert === '') continue;

    if (el.name === 'formular' || el.name === 'ganztag_keine' || el.name === 'teilnahme_keine') continue;
    if (el.name === 'ganztag') {
      const [angebot, tag] = wert.split(':');
      daten.ganztag.push({ angebot, tag });
      continue;
    }

    const teile = el.name.split('.');
    let ziel = daten;
    for (let i = 0; i < teile.length - 1; i++) {
      const key = /^\d+$/.test(teile[i]) ? Number(teile[i]) : teile[i];
      ziel[key] ??= /^\d+$/.test(teile[i + 1]) ? [] : {};
      ziel = ziel[key];
    }
    ziel[teile.at(-1)] ??= wert; // doppelte Felder (Geburtsland): erster Wert zählt
  }

  if (form.elements.ganztag_keine.checked && !form.elements.ganztag_keine.disabled) daten.anmeldung.ganztag_teilnahme = '0';
  else if (daten.ganztag.length) daten.anmeldung.ganztag_teilnahme = '1';

  // „keine Teilnahme“ an MINT/Bilingual wird als 0/0 gespeichert (nichts angekreuzt = keine Angabe)
  const teilnahmeKeine = form.elements.teilnahme_keine;
  if (teilnahmeKeine.checked && !teilnahmeKeine.disabled) {
    daten.anmeldung.teilnahme_mint = '0';
    daten.anmeldung.teilnahme_bilingual = '0';
  }

  // Lücken entfernen (z. B. nur EB 2 ausgefüllt), Position bleibt über Index erhalten
  for (const liste of ['erziehungsberechtigte', 'notfallkontakte']) {
    daten[liste] = Array.from({ length: 2 }, (_, i) => daten[liste][i] ?? {});
  }
  return daten;
}

function setStatus(id, text, klasse) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `status ${klasse}`;
}
