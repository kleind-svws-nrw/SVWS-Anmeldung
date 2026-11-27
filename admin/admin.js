// Verwaltungsbereich: Liste, Detailansicht, Sekretariatsfelder, Druck, Löschen.
// Alle Aufrufe gehen an admin/api.php (liegt hinter dem Passwortschutz dieses Ordners).
import { api } from '../js/api.js?v=20261127-7';
import { renderDruck, druckHtml } from '../js/druck.js?v=20261127-7';
import { schildDateien, zip, pruefe } from './schild-export.js?v=20261127-7';

const STATUS = {
  eingegangen: 'eingegangen',
  in_bearbeitung: 'in Bearbeitung',
  aufgenommen: 'aufgenommen',
  abgelehnt: 'abgelehnt',
  weitergeleitet: 'weitergeleitet',
};

const $ = (id) => document.getElementById(id);
const tbody = $('liste').querySelector('tbody');
const sek = $('sekretariat');
let alle = [];
let aktuell = null; // geladene Anmeldung (vollständig)
const ausgewaehlt = new Set(); // IDs für den SchILD-Export

// Status-Auswahlen füllen
for (const sel of [$('f-status'), sek.elements.status]) {
  for (const [wert, text] of Object.entries(STATUS)) sel.add(new Option(text, wert));
}

// ---------------------------------------------------------------- Liste

async function ladeListe() {
  try {
    const { daten } = await api('anmeldungen');
    alle = daten;
    const jahre = [...new Set(alle.map((a) => a.schuljahr).filter(Boolean))].sort().reverse();
    const f = $('f-schuljahr');
    const gewaehlt = f.value;
    f.length = 1;
    for (const j of jahre) f.add(new Option(j, j));
    f.value = jahre.includes(gewaehlt) ? gewaehlt : '';
    zeigeListe();
  } catch (e) {
    meldung(`Liste konnte nicht geladen werden: ${e.message}`, 'fehler');
  }
}

function gefiltert() {
  const q = $('suche').value.trim().toLowerCase();
  return alle.filter((a) =>
    (!$('f-schuljahr').value || a.schuljahr === $('f-schuljahr').value) &&
    (!$('f-formular').value || a.formular === $('f-formular').value) &&
    (!$('f-status').value || a.status === $('f-status').value) &&
    (!q || `${a.id} ${a.name} ${a.vorname}`.toLowerCase().includes(q)));
}

function zeigeListe() {
  const liste = gefiltert();
  $('anzahl').textContent = `${liste.length} von ${alle.length} Anmeldungen`;
  tbody.replaceChildren();
  if (!liste.length) {
    tbody.innerHTML = '<tr class="leer"><td colspan="9">Keine Anmeldungen gefunden.</td></tr>';
    aktualisiereAuswahl();
    return;
  }
  for (const a of liste) {
    const tr = document.createElement('tr');
    tr.dataset.id = a.id;
    tr.classList.toggle('aktiv', aktuell?.id === a.id);
    const tdWahl = document.createElement('td');
    tdWahl.className = 'auswahl';
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: ausgewaehlt.has(a.id) });
    box.setAttribute('aria-label', `Nr. ${a.id} für den Export auswählen`);
    box.dataset.id = a.id;
    tdWahl.append(box);
    tr.append(tdWahl);
    for (const text of [a.id, a.name, a.vorname, datum(a.geburtsdatum), a.jahrgangsstufe ?? (a.formular === 'EP' ? '5' : ''), a.schuljahr ?? '', datum(a.anmeldedatum)]) {
      const td = document.createElement('td');
      td.textContent = text ?? '';
      tr.append(td);
    }
    const td = document.createElement('td');
    const marke = document.createElement('span');
    marke.className = `marke ${a.status}`;
    marke.textContent = STATUS[a.status] ?? a.status;
    td.append(marke);
    tr.append(td);
    tbody.append(tr);
  }
  aktualisiereAuswahl();
}

// ---------------------------------------------------------------- Auswahl für den Export

function aktualisiereAuswahl() {
  // nur noch vorhandene Datensätze behalten
  for (const id of ausgewaehlt) if (!alle.some((a) => a.id === id)) ausgewaehlt.delete(id);
  const sichtbar = gefiltert();
  const markiert = sichtbar.filter((a) => ausgewaehlt.has(a.id)).length;
  $('alle').checked = sichtbar.length > 0 && markiert === sichtbar.length;
  $('alle').indeterminate = markiert > 0 && markiert < sichtbar.length;
  $('auswahl-anzahl').textContent = `${ausgewaehlt.size} ausgewählt`;
  $('schild-export').disabled = ausgewaehlt.size === 0;
}

tbody.addEventListener('change', (e) => {
  if (!e.target.matches('td.auswahl input')) return;
  const id = Number(e.target.dataset.id);
  e.target.checked ? ausgewaehlt.add(id) : ausgewaehlt.delete(id);
  aktualisiereAuswahl();
});
$('alle').addEventListener('change', (e) => {
  for (const a of gefiltert()) e.target.checked ? ausgewaehlt.add(a.id) : ausgewaehlt.delete(a.id);
  zeigeListe();
});

$('schild-export').addEventListener('click', async () => {
  const knopf = $('schild-export');
  knopf.disabled = true;
  try {
    const datensaetze = [];
    for (const id of [...ausgewaehlt].sort((x, y) => x - y)) datensaetze.push((await api('anmeldung', { params: { id } })).daten);
    const probleme = datensaetze.map((a) => [a, pruefe(a)]).filter(([, p]) => p.length);
    if (probleme.length) {
      meldung(`Export abgebrochen – diesen Anmeldungen fehlen Pflichtangaben (ältere Anmeldungen vor Einführung der Geschlechtsangabe; bitte abwählen und in SchILD von Hand anlegen): `
        + probleme.map(([a, p]) => `Nr. ${a.id} ${a.name}, ${a.vorname}: ${p.join(', ')}`).join(' · '), 'fehler');
      return;
    }
    const dateien = schildDateien(datensaetze, { jahrgang: $('jahrgang-format').value });
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(zip(dateien)),
      download: `SchILD-Import_${new Date().toISOString().slice(0, 10)}.zip`,
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    meldung(`${datensaetze.length} Anmeldung(en) exportiert: ${Object.keys(dateien).join(', ')}. ZIP entpacken und in SchILD-NRW über Datenaustausch → Schnittstelle SchILD-NRW → Import einlesen.`, 'ok');
  } catch (err) {
    meldung(`Export fehlgeschlagen: ${err.message}`, 'fehler');
  } finally {
    aktualisiereAuswahl();
  }
});

tbody.addEventListener('click', (e) => {
  if (e.target.closest('td.auswahl')) return; // Klick auf die Auswahl-Checkbox öffnet nicht die Detailansicht
  const tr = e.target.closest('tr[data-id]');
  if (tr) oeffne(Number(tr.dataset.id));
});
for (const id of ['suche', 'f-schuljahr', 'f-formular', 'f-status']) $(id).addEventListener('input', zeigeListe);
$('neu-laden').addEventListener('click', ladeListe);

// ---------------------------------------------------------------- Detail

async function oeffne(id) {
  try {
    const { daten } = await api('anmeldung', { params: { id } });
    aktuell = daten;
  } catch (e) {
    meldung(`Anmeldung ${id} konnte nicht geladen werden: ${e.message}`, 'fehler');
    return;
  }
  const a = aktuell;
  $('detail-titel').textContent = `Nr. ${a.id}: ${a.name}, ${a.vorname} – Stufe ${a.jahrgangsstufe ?? ''} (${a.formular === 'EP' ? 'Klasse 5' : 'Klasse 6–10'})`;
  sek.elements.status.value = a.status;
  for (const r of sek.elements.masernschutz_nachweis) r.checked = a.masernschutz_nachweis !== null && String(a.masernschutz_nachweis) === r.value;
  sek.elements.bemerkung_sekretariat.value = a.bemerkung_sekretariat ?? '';
  $('bogen').innerHTML = druckHtml(zuDruckdaten(a));
  $('bearbeiten').href = `../?bearbeiten=${a.id}`;
  $('detail').hidden = false;
  zeigeListe();
  $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('schliessen').addEventListener('click', () => {
  aktuell = null;
  $('detail').hidden = true;
  zeigeListe();
});

sek.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!aktuell) return;
  const masern = sek.querySelector('input[name="masernschutz_nachweis"]:checked');
  const body = {
    status: sek.elements.status.value,
    masernschutz_nachweis: masern ? Number(masern.value) : null,
    bemerkung_sekretariat: sek.elements.bemerkung_sekretariat.value.trim() || null,
  };
  try {
    await api('anmeldung', { method: 'PATCH', params: { id: aktuell.id }, body });
    const id = aktuell.id;
    await ladeListe();
    await oeffne(id);
    meldung(`Nr. ${id} gespeichert.`, 'ok');
  } catch (err) {
    meldung(`Speichern fehlgeschlagen: ${err.message}`, 'fehler');
  }
});

$('loeschen').addEventListener('click', async () => {
  if (!aktuell) return;
  const a = aktuell;
  if (!confirm(`Anmeldung Nr. ${a.id} (${a.name}, ${a.vorname}) endgültig löschen?\nDas kann nicht rückgängig gemacht werden.`)) return;
  try {
    await api('anmeldung', { method: 'DELETE', params: { id: a.id } });
    aktuell = null;
    $('detail').hidden = true;
    await ladeListe();
    meldung(`Nr. ${a.id} gelöscht.`, 'ok');
  } catch (err) {
    meldung(`Löschen fehlgeschlagen: ${err.message}`, 'fehler');
  }
});

$('drucken').addEventListener('click', () => {
  if (!aktuell) return;
  renderDruck(zuDruckdaten(aktuell));
  window.print();
});

// ---------------------------------------------------------------- CSV-Export der gefilterten Liste

$('csv').addEventListener('click', () => {
  const spalten = ['id', 'name', 'vorname', 'geburtsdatum', 'jahrgangsstufe', 'formular', 'schuljahr', 'anmeldedatum', 'status'];
  const zeilen = [spalten.join(';'), ...gefiltert().map((a) => spalten.map((s) => `"${String(a[s] ?? '').replaceAll('"', '""')}"`).join(';'))];
  const blob = new Blob(['﻿' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `anmeldungen_${new Date().toISOString().slice(0, 10)}.csv` });
  link.click();
  URL.revokeObjectURL(link.href);
});

// ---------------------------------------------------------------- Hilfen

/** Datenbankzeile → Format, das js/druck.js erwartet (wie formularDaten im Anmeldeformular). */
function zuDruckdaten(a) {
  const alsText = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== null && v !== '').map(([k, v]) => [k, String(v)]));
  const { erziehungsberechtigte = [], notfallkontakte = [], ganztag = [], ...anmeldung } = a;
  return {
    formular: a.formular,
    anmeldung: alsText(anmeldung),
    erziehungsberechtigte: [1, 2].map((pos) => alsText(erziehungsberechtigte.find((e) => Number(e.position) === pos))),
    notfallkontakte: [0, 1].map((i) => alsText(notfallkontakte[i])),
    ganztag,
  };
}

function datum(iso) {
  if (!iso) return '';
  const [j, m, t] = String(iso).slice(0, 10).split('-');
  return t ? `${t}.${m}.${j}` : iso;
}

function meldung(text, klasse) {
  const el = $('meldung');
  el.textContent = text;
  el.className = `status ${klasse}`;
}

// Direktaufruf admin/?id=… (z. B. „Zurück zur Verwaltung“ nach der Bearbeitung) öffnet die Anmeldung
ladeListe().then(() => {
  const id = Number(new URLSearchParams(location.search).get('id'));
  if (id) oeffne(id);
});
