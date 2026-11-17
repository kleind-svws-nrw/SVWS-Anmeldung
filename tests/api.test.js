// Smoke-Test gegen den laufenden Dev-Server: npm run dev  (zweites Terminal)  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE ?? 'http://localhost:8080/api.php';
const call = (action, opts = {}) =>
  fetch(`${BASE}?action=${action}`, { headers: { 'Content-Type': 'application/json' }, ...opts })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

test('ping', async () => {
  const { status, body } = await call('ping');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test('Anmeldung ohne Pflichtfelder wird abgelehnt', async () => {
  const { status, body } = await call('anmeldung', { method: 'POST', body: JSON.stringify({ formular: 'EP', anmeldung: {} }) });
  assert.equal(status, 422);
  assert.ok(body.details.name);
});

test('gültige Anmeldung wird gespeichert', async () => {
  const { status, body } = await call('anmeldung', {
    method: 'POST',
    body: JSON.stringify({
      formular: 'MS',
      anmeldung: { name: 'Test', vorname: 'Tina', geburtsdatum: '2014-05-01', status: 'aufgenommen' },
      erziehungsberechtigte: [{ name: 'Test', vorname: 'Tom', email: 'tom@example.org' }],
      ganztag: [{ angebot: 'MINT', tag: 'Di' }],
    }),
  });
  assert.equal(status, 201);
  assert.ok(body.id > 0);
});

test('Verwaltung ohne Schlüssel gesperrt', async () => {
  const { status } = await call('anmeldungen');
  assert.equal(status, 401);
});
