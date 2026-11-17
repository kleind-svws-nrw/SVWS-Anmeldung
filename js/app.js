import { api } from './api.js';
import { renderDruck } from './druck.js';

const form = document.getElementById('anmeldeformular');
const meldung = document.getElementById('meldung');

// ---------------------------------------------------------------- Aufbau

// Zwei Spalten Erziehungsberechtigte aus der Vorlage erzeugen
const vorlage = document.getElementById('eb-vorlage');
for (const i of [0, 1]) {
  const html = vorlage.innerHTML.replaceAll('{i}', i).replaceAll('{n}', i + 1);
  vorlage.insertAdjacentHTML('beforebegin', html);
}

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
  if (el.name === 'anmeldung.religion') aktualisiereAbhaengige();
});

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
  const typ = form.elements['anmeldung.jahrgangsstufe'].value === '5' ? 'EP' : 'MS';
  form.elements.formular.value = typ;
  // Abschnitte des jeweils anderen Bogens ausblenden und ihre Felder deaktivieren:
  // deaktivierte Felder werden weder validiert noch gespeichert noch gedruckt.
  for (const abschnitt of form.querySelectorAll('[data-nur]')) {
    const aus = abschnitt.dataset.nur !== typ;
    abschnitt.hidden = aus;
    for (const feld of abschnitt.querySelectorAll('input, select, textarea')) feld.disabled = aus;
  }
}

function aktualisiereGanztag(ausloeser) {
  const keine = form.elements.ganztag_keine;
  const tage = [...form.querySelectorAll('input[name="ganztag"]')];
  if (ausloeser === keine && keine.checked) tage.forEach((t) => (t.checked = false));
  if (ausloeser?.name === 'ganztag' && ausloeser.checked) keine.checked = false;
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

// ---------------------------------------------------------------- Drucken

document.getElementById('drucken').addEventListener('click', () => window.print());
// Druckfassung immer frisch aus den aktuellen Eingaben erzeugen (auch bei Strg+P)
window.addEventListener('beforeprint', () => renderDruck(formularDaten(form)));
renderDruck(formularDaten(form));

// ---------------------------------------------------------------- Absenden

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  try {
    const { id } = await api('anmeldung', { method: 'POST', body: formularDaten(form) });
    setStatus('meldung', `Anmeldung gespeichert (Nr. ${id}). Vielen Dank! Sie können den Bogen jetzt noch ausdrucken.`, 'ok');
  } catch (err) {
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

    if (el.name === 'formular' || el.name === 'ganztag_keine') continue;
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

  if (form.elements.ganztag_keine.checked) daten.anmeldung.ganztag_teilnahme = '0';
  else if (daten.ganztag.length) daten.anmeldung.ganztag_teilnahme = '1';

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
