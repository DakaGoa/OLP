/* Data adapter: uses the shared HTTP API when available, otherwise runs the
   exact same domain core in the browser with localStorage persistence. */
import { apiBase, isNative, gatewayQuery } from './config.js';

const DB_KEY = 'olp.db.v1';
const TOKEN_KEY = 'olp.token';

let mode = 'local';
let localCore = null;

const storage = {
  read() {
    try { return JSON.parse(localStorage.getItem(DB_KEY) || 'null'); }
    catch (_) { return null; }
  },
  write(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (_) { /* quota / private mode - keep working in memory */ }
    return Promise.resolve();
  }
};

function core() {
  if (!localCore) localCore = OLPCore.createCore(storage, OLP_SEED);
  return localCore;
}

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
export function getMode() { return mode; }
export function isShared() { return mode === 'shared'; }

export async function initApi() {
  const base = apiBase();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(base + '/api/health' + gatewayQuery(), { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok) { mode = 'shared'; return mode; }
    }
  } catch (_) { /* offline or static hosting -> local mode */ }
  mode = 'local';
  return mode;
}

export async function api(method, path, body) {
  const token = getToken();
  if (mode === 'shared') {
    const res = await fetch(apiBase() + '/api' + path + gatewayQuery(), {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token, 'X-OLP-Token': token } : {}),
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    let json = {};
    try { json = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok || json.error) {
      const err = new Error(json.error || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      throw err;
    }
    return json;
  }
  const result = await core().route(method, path, body || {}, token);
  return result.data;
}

/* Convenience wrappers -------------------------------------------------- */
export const Auth = {
  bootstrap: () => api('GET', '/bootstrap'),
  signin: (username, password) => api('POST', '/auth/signin', { username, password }),
  signup: (form) => api('POST', '/auth/signup', form),
  signout: () => api('POST', '/auth/signout', {}),
  setNotify: (notify) => api('PATCH', '/auth/me', { notify })
};

export const Data = {
  saved: () => api('GET', '/saved'),
  toggleSaved: (id) => api('POST', '/saved/' + encodeURIComponent(id)),
  createEvent: (data) => api('POST', '/events', data),
  updateEvent: (id, data) => api('PATCH', '/events/' + encodeURIComponent(id), data),
  deleteEvent: (id) => api('DELETE', '/events/' + encodeURIComponent(id)),
  updateSettings: (data) => api('PUT', '/settings', data),
  listSeries: () => api('GET', '/series'),
  createSeries: (data) => api('POST', '/series', data),
  deleteSeries: (id) => api('DELETE', '/series/' + encodeURIComponent(id))
};

export { isNative };
