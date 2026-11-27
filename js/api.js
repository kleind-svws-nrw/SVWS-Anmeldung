// Dünner Wrapper um api.php – einzige Stelle, an der das Frontend mit dem Server spricht.
let API_URL = 'api.php';

/** Nachbearbeitung durch das Sekretariat: Aufrufe gehen an die passwortgeschützte admin/api.php */
export function setzeApiUrl(url) {
  API_URL = url;
}

export async function api(action, { method = 'GET', body, params = {}, adminKey } = {}) {
  const url = new URL(API_URL, location.href);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (adminKey) headers['X-Admin-Key'] = adminKey;

  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({ ok: false, fehler: `HTTP ${res.status}` }));
  if (!res.ok || !data.ok) {
    const err = new Error(data.fehler || `HTTP ${res.status}`);
    err.details = data.details || {};
    throw err;
  }
  return data;
}
