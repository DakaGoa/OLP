/* Event reminders: real OS-level scheduling inside the Android app,
   browser notifications + in-app reminders on the web. */
import { dateOf, formatTime, longDate, t, localized } from './utils.js';

const LOG_KEY = 'olp.notified.v1';
const LEAD_MS = 2 * 60 * 60 * 1000; // remind two hours before doors

function nativePlugin() {
  try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications; }
  catch (_) { return null; }
}
export function hasNativeNotifications() { return !!nativePlugin(); }

function log() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}'); } catch (_) { return {}; }
}
function mark(key) { const l = log(); l[key] = Date.now(); localStorage.setItem(LOG_KEY, JSON.stringify(l)); }
function seen(key) { return !!log()[key]; }

export async function requestPermission() {
  const plugin = nativePlugin();
  if (plugin && typeof plugin.requestPermissions === 'function') {
    try { const r = await plugin.requestPermissions(); return !!(r && r.display !== 'denied'); } catch (_) { return false; }
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch (_) { return false; }
}

export function permissionState() {
  if (hasNativeNotifications()) return 'native';
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

function numericId(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) % 2000000000;
  return Math.abs(n) + 1;
}

export async function scheduleFor(events) {
  const plugin = nativePlugin();
  const now = Date.now();
  const toSchedule = [];
  const webTimers = [];

  events.forEach((e) => {
    const start = dateOf(e.date, e.time).getTime();
    const at = start - LEAD_MS;
    const key = e.id + ':' + e.date + ':' + e.time;
    if (seen(key) || start <= now) return;
    if (at <= now) {
      mark(key);
      fire(e, t('notify.testTitle'));
      return;
    }
    toSchedule.push({
      id: e.id, title: localized(e, 'title'),
      body: t('notify.body', { time: formatTime(e.time), date: longDate(e.date) }),
      at: new Date(at)
    });
  });

  if (plugin && toSchedule.length) {
    try {
      await plugin.schedule({
        notifications: toSchedule.map((n) => ({
          id: numericId(n.id), title: n.title, body: n.body,
          schedule: { at: n.at, allowWhileIdle: true },
          smallIcon: 'ic_stat_icon', largeIcon: 'ic_launcher_foreground'
        }))
      });
      toSchedule.forEach((n) => mark(n.id));
    } catch (err) { console.warn('[olp] native schedule failed', err); }
  } else {
    toSchedule.forEach((n) => {
      const ms = n.at.getTime() - now;
      if (ms > 0 && ms < 24 * 60 * 60 * 1000) {
        setTimeout(() => { mark(n.id); fire({ id: n.id, title: n.title, time: '20:00' }, n.title); }, ms);
      }
    });
  }
}

async function fire(event, subtitle) {
  const title = subtitle || 'Old London Pub';
  const body = formatTime(event.time) + ' · Old London Pub';
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        const reg = await navigator.serviceWorker.ready;
        if (reg.showNotification) { reg.showNotification(title, { body, icon: 'assets/icons/icon-192.png', tag: event.id }); return; }
      }
      new Notification(title, { body, icon: 'assets/icons/icon-192.png', tag: event.id });
    } catch (_) { /* ignore */ }
  }
}

export async function testNotification() {
  const ok = await requestPermission();
  const plugin = nativePlugin();
  if (plugin) {
    try {
      await plugin.schedule({
        notifications: [{
          id: 999999, title: t('notify.testTitle'), body: t('notify.testBody'),
          schedule: { at: new Date(Date.now() + 1500) }
        }]
      });
    } catch (_) { /* ignore */ }
  } else if (ok) {
    fire({ id: 'test', title: t('notify.test'), time: '20:00' }, t('notify.testTitle'));
  }
  return ok;
}

export function cancelFor(events) {
  const plugin = nativePlugin();
  if (!plugin || !plugin.cancel) return;
  try { plugin.cancel({ notifications: events.map((e) => ({ id: numericId(e.id) })) }); } catch (_) { /* ignore */ }
}
