/* Small shared helpers — date/number formatting follows the active language. */
import { dayNames, monthNames, getLang } from './i18n.js';

export { categoryLabel, localized, t, getLang, setLang, localizeError, dayNames, monthNames, applyStaticI18n } from './i18n.js';

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function pad(n) { return String(n).padStart(2, '0'); }
export function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function todayIso() { const d = new Date(); d.setHours(12, 0, 0, 0); return isoOf(d); }
export function dateOf(iso, time) {
  const p = String(iso).split('-').map(Number);
  const t = time ? String(time).split(':').map(Number) : [0, 0];
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1, t[0] || 0, t[1] || 0);
}
export function addDays(iso, n) { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); }

/* 12h / 24h clock preference — remembered per device; defaults follow the language. */
export function getClock() {
  let v = null;
  try { v = localStorage.getItem('olp-clock'); } catch (_) { /* storage blocked */ }
  if (v === '12h' || v === '24h') return v;
  return getLang() === 'sr' ? '24h' : '12h';
}
export function setClock(v) {
  try { localStorage.setItem('olp-clock', v === '24h' ? '24h' : '12h'); } catch (_) { /* storage blocked */ }
}

export function formatTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (getClock() === '24h') return pad(h) + ':' + pad(m || 0);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return hour + (m ? ':' + pad(m) : '') + suffix;
}

export function shortDate(iso) {
  const d = dateOf(iso);
  const dn = dayNames()[d.getDay()].slice(0, 3);
  const mn = monthNames()[d.getMonth()].slice(0, 3);
  return getLang() === 'sr' ? dn + ' ' + d.getDate() + '. ' + mn : dn + ' ' + d.getDate() + ' ' + mn;
}
export function longDate(iso) {
  const d = dateOf(iso);
  const dn = dayNames()[d.getDay()];
  const mn = monthNames()[d.getMonth()];
  return getLang() === 'sr' ? dn + ', ' + d.getDate() + '. ' + mn : dn + ' ' + d.getDate() + ' ' + mn;
}
export function relativeDay(iso) {
  const t = todayIso();
  const sr = getLang() === 'sr';
  if (iso === t) return sr ? 'Danas' : 'Today';
  if (iso === addDays(t, 1)) return sr ? 'Sutra' : 'Tomorrow';
  if (iso === addDays(t, -1)) return sr ? 'Juče' : 'Yesterday';
  return shortDate(iso);
}
export function isUpcoming(e) {
  const now = new Date();
  return dateOf(e.date, e.time || '23:59').getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/* Google Maps deep links, derived from the editable pub address. */
export function mapsUrl(address) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address || 'Gavrila Principa 46, Belgrade, Serbia');
}
export function directionsUrl(address) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address || 'Gavrila Principa 46, Belgrade, Serbia');
}

export function icon(name, cls) {
  const p = {
    quiz: '<path d="M8 3h8a2 2 0 0 1 2 2v14l-6-3-6 3V5a2 2 0 0 1 2-2z"/><path d="M9 8h6M9 12h4"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 9 9"/>',
    glass: '<path d="M4 3h16l-8 9v7M8 21h8M12 12l7-9"/>',
    star: '<path d="M12 2l2.9 6 6.6 1-4.8 4.7 1.2 6.6-5.9-3.1-5.9 3.1 1.2-6.6L2.5 9l6.6-1z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    spark: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    send: '<path d="M4 12l16-8-6 16-3-6z"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 14v3M14 20h7M17 17v4"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'
  }[name] || '';
  return '<svg class="' + (cls || 'icon') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

export function makeIcs(event, settings) {
  const start = dateOf(event.date, event.time);
  const end = event.endTime ? dateOf(event.date, event.endTime) : new Date(start.getTime() + 2 * 3600 * 1000);
  const fmt = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Old London Pub//Happenings//EN',
    'BEGIN:VEVENT', 'UID:' + event.id + '@oldlondonpub', 'DTSTAMP:' + fmt(new Date()) + 'Z',
    'DTSTART:' + fmt(start), 'DTEND:' + fmt(end),
    'SUMMARY:' + esc(event.title), 'DESCRIPTION:' + esc(event.description),
    'LOCATION:' + esc(settings.address || 'Old London Pub'), 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

export function downloadIcs(event, settings) {
  const blob = new Blob([makeIcs(event, settings)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
