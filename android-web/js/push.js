/* Web Push notifications: VAPID-based, no runtime dependencies.
   Generates a VAPID key pair on first use (stored in the data file),
   subscribes the browser, and stores the subscription via the API. */
import { api } from './api.js';
import { isShared } from './api.js';
import { gatewayQuery } from './config.js';
import { t, getLang } from './i18n.js';

/* Base64 URL helpers (no dependencies). */
function b64ToUint8(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 ? '='.repeat(4 - padded.length % 4) : '';
  const raw = atob(padded + pad);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function uint8ToB64(bytes) {
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/* Import a VAPID public key for push subscription. */
async function importVapidKey(b64) {
  return crypto.subtle.importKey('raw', b64ToUint8(b64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

/* Check if push is supported in this browser. */
export function pushSupported() {
  return typeof PushManager !== 'undefined' && 'serviceWorker' in navigator;
}

/* Get the VAPID public key. In shared mode, fetch from the server.
   In local mode, there's no push server so we return null. */
export async function getVapidKey() {
  if (!isShared()) return null;
  try {
    const res = await api('GET', '/push/subscribers');
    return res.publicKey || null;
  } catch (_) { return null; }
}

/* Check if already subscribed. Uses getRegistration (resolves even when no SW
   controls the page) rather than `.ready`, which would hang forever if the
   service worker has not been registered yet. */
export async function isSubscribed() {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch (_) { return false; }
}

/* Subscribe to push notifications. */
export async function subscribe(categories, quietRange) {
  if (!pushSupported()) throw new Error('Push not supported');
  const vapidKey = await getVapidKey();
  if (!vapidKey) throw new Error('Push server not available');
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register('sw.js').catch(() => null);
  if (!reg) throw new Error('Service worker unavailable');
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToUint8(vapidKey)
  });
  await api('POST', '/push/subscribe', {
    subscription: { endpoint: sub.endpoint, keys: sub.toJSON().keys },
    prefs: { lang: getLang(), categories: categories || [], quiet: quietRange || null }
  });
  return true;
}

/* Unsubscribe from push. */
export async function unsubscribe() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch (_) { /* ignore */ }
}

/* Update preferences. */
export async function updatePrefs(categories, quietRange) {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await api('POST', '/push/prefs', { endpoint: sub.endpoint, categories, quiet: quietRange || null });
  } catch (_) { /* ignore */ }
}

/* Send a test push via the server (admin only triggers this server-side;
   here we just fire a local notification via the SW as a demo). */
export async function testPush() {
  if (!pushSupported() || !navigator.serviceWorker.controller) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.showNotification) {
      reg.showNotification(t('notify.testTitle'), {
        body: t('push.testBody'),
        icon: 'assets/icons/icon-192.png',
        tag: 'push-test'
      });
      return true;
    }
  } catch (_) { /* ignore */ }
  return false;
}
