/* Old London Pub - application shell (EN / SR) */
import { Auth, Data, initApi, setToken, isShared, api } from './api.js';
import { CATEGORIES, isNative } from './config.js';
import { respond } from './ai.js';
import {
  escapeHtml as esc, icon, todayIso, addDays, dateOf, longDate, shortDate,
  relativeDay, formatTime, categoryLabel, isUpcoming, downloadIcs,
  mapsUrl, directionsUrl, t, getLang, setLang, applyStaticI18n,
  localized, localizeError, dayNames, monthNames, getClock, setClock
} from './utils.js';
import {
  requestPermission, permissionState, scheduleFor, testNotification,
  hasNativeNotifications, cancelFor
} from './notifications.js';
import { pushSupported, subscribe, unsubscribe, isSubscribed, updatePrefs, testPush } from './push.js';

const S = {
  view: 'home', filter: 'all', day: 'all',
  events: [], settings: {}, user: null, saved: [],
  mode: 'local', chatOpen: false, chatBusy: false, chatImage: null,
  messages: [], pendingAction: null, modal: null,
  authTab: 'signin', authError: '', authBusy: false,
  adminEditing: null, adminTab: 'events', toastTimer: null,
  seriesList: [], pushOn: false
};

const $ = (sel) => document.querySelector(sel);
const app = $('#app');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byId = (id) => S.events.find((e) => e.id === id);
const upcoming = () => S.events.filter(isUpcoming).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const savedEvents = () => S.saved.map(byId).filter(Boolean).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const defaultChips = () => [t('chat.chip1'), t('chat.chip2'), t('chat.chip3')];
const addr = () => S.settings.address || 'Gavrila Principa 46, Belgrade, Serbia';

async function openExternal(url) {
  const Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (Browser && typeof Browser.open === 'function') {
    try { await Browser.open({ url }); return; } catch (_) { /* fall through */ }
  }
  window.open(url, '_blank', 'noopener');
}

/* ---------------------------------------------------------------- data */
async function refresh() {
  const data = await Auth.bootstrap();
  S.events = data.events || [];
  S.settings = data.settings || {};
  S.user = data.user || null;
  S.saved = data.saved || [];
  document.title = (S.settings.pubName || 'Old London Pub') + ' — ' + t('nav.whatsOn');
  if (S.user && S.user.notify) {
    try { await scheduleFor(savedEvents()); } catch (_) { /* best effort */ }
  }
  S.pushOn = await isSubscribed().catch(() => false);
  if (S.pendingEventId) {
    const e = byId(S.pendingEventId);
    if (e) { S.modal = { type: 'event', id: S.pendingEventId }; renderModal(); }
    S.pendingEventId = null;
  }
}

async function refreshSeries() {
  if (!S.user || S.user.role !== 'admin') { S.seriesList = []; return; }
  try {
    const res = await api('GET', '/series');
    S.seriesList = res.series || [];
  } catch (_) { S.seriesList = []; }
}

async function enablePush() {
  try {
    const cats = Array.from(document.querySelectorAll('.push-cat:checked')).map((el) => el.value);
    const quiet = document.getElementById('push-quiet')?.value || null;
    await subscribe(cats, quiet);
    S.pushOn = true; renderApp(); showToast(t('push.enabled'));
  } catch (err) { showToast(localizeError(err.message || 'Push failed'), 'error'); }
}

async function disablePush() {
  try { await unsubscribe(); S.pushOn = false; renderApp(); showToast(t('push.disabled')); }
  catch (err) { showToast(localizeError(err.message), 'error'); }
}

async function savePushPrefs() {
  const cats = Array.from(document.querySelectorAll('.push-cat:checked')).map((el) => el.value);
  const quiet = document.getElementById('push-quiet')?.value || null;
  try { await updatePrefs(cats, quiet); showToast(t('toast.settingsSaved')); }
  catch (err) { showToast(localizeError(err.message), 'error'); }
}

async function sendBroadcast() {
  const msg = document.getElementById('push-broadcast-msg')?.value?.trim();
  if (!msg) return;
  try {
    const res = await api('POST', '/push/broadcast', { message: msg });
    showToast(t('push.broadcastSent', { n: res.subscribers || 0 }));
  } catch (err) { showToast(localizeError(err.message), 'error'); }
}

function showToast(text, kind) {
  const host = $('#toast-host');
  host.innerHTML = '<div class="toast ' + (kind || '') + '">' + icon(kind === 'error' ? 'close' : 'check') + '<span>' + esc(localizeError(text)) + '</span></div>';
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => { host.innerHTML = ''; }, 3600);
}

/* ---------------------------------------------------------------- bits */
function categoryChip(cat, active) {
  return '<button class="chip ' + (active ? 'active' : '') + '" data-action="filter" data-cat="' + cat.id + '" type="button">' +
    icon(cat.icon) + '<span>' + esc(cat.label) + '</span></button>';
}
function chipsRow() {
  return categoryChip({ id: 'all', label: t('filter.all'), icon: 'star' }, S.filter === 'all') +
    CATEGORIES.map((c) => categoryChip({ id: c.id, label: categoryLabel(c.id), icon: c.icon }, S.filter === c.id)).join('');
}

function eventCard(e, compact) {
  const saved = S.saved.includes(e.id);
  const title = localized(e, 'title');
  const price = localized(e, 'price');
  return '<article class="event-card ' + (compact ? 'compact' : '') + '" data-id="' + esc(e.id) + '">' +
    '<div class="event-media" style="background-image:url(\'' + esc(e.image) + '\')">' +
      '<span class="badge badge-' + esc(e.category) + '">' + icon(CATEGORIES.find((c) => c.id === e.category)?.icon || 'star') + esc(categoryLabel(e.category)) + '</span>' +
      (e.featured ? '<span class="badge featured">' + esc(t('card.featured')) + '</span>' : '') +
      (compact ? '' : '<div class="event-date"><strong>' + esc(String(+e.date.slice(8))) + '</strong><span>' + esc(monthNames()[+e.date.slice(5, 7) - 1].slice(0, 3)) + '</span></div>') +
    '</div>' +
    '<div class="event-body">' +
      '<div class="event-meta">' + icon('calendar') + '<span>' + esc(relativeDay(e.date)) + '</span><i></i>' + icon('clock') + '<span>' + esc(formatTime(e.time)) + '</span></div>' +
      '<h3>' + esc(title) + '</h3>' +
      (compact ? '' : '<p>' + esc(localized(e, 'description')) + '</p>') +
      '<div class="event-foot">' +
        '<span class="price">' + esc(price) + '</span>' +
        '<div class="event-actions">' +
          '<button class="mini-btn ' + (saved ? 'saved' : '') + '" data-action="save" data-id="' + esc(e.id) + '" type="button" aria-label="' + esc(saved ? t('saved.remove') : t('cta.perk1')) + '">' + icon('bookmark') + '</button>' +
          '<button class="mini-btn" data-action="share" data-id="' + esc(e.id) + '" type="button" aria-label="' + esc(t('share.title')) + '">' + icon('share') + '</button>' +
          (S.user?.role === 'admin' ? '<button class="mini-btn" data-action="admin-edit" data-id="' + esc(e.id) + '" type="button" title="' + esc(t('admin.editEvent')) + '" aria-label="' + esc(t('admin.editEvent')) + '">' + icon('edit') + '</button>' : '') +
          '<button class="mini-btn" data-action="event" data-id="' + esc(e.id) + '" type="button">' + esc(t('card.details')) + ' ' + icon('arrow') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</article>';
}

function chatEventCard(e) {
  return '<button class="chat-event" type="button" data-action="chat-event" data-id="' + esc(e.id) + '">' +
    '<span class="chat-event-img" style="background-image:url(\'' + esc(e.image) + '\')"></span>' +
    '<span class="chat-event-text"><strong>' + esc(localized(e, 'title')) + '</strong><small>' + esc(relativeDay(e.date)) + ' · ' + esc(formatTime(e.time)) + ' · ' + esc(categoryLabel(e.category)) + '</small></span>' +
    icon('chevron') + '</button>';
}

/* ------------------------------------------------------------ nav/home */
function langSwitchHtml() {
  return '<div class="lang-switch" role="group" aria-label="' + esc(t('lang.label')) + '">' +
    icon('globe') +
    '<button type="button" data-action="lang" data-lang="en" class="' + (getLang() === 'en' ? 'active' : '') + '">EN</button>' +
    '<span>/</span>' +
    '<button type="button" data-action="lang" data-lang="sr" class="' + (getLang() === 'sr' ? 'active' : '') + '">SR</button>' +
  '</div>';
}

function clockSwitchHtml() {
  const c = getClock();
  return '<div class="lang-switch clock-switch" role="group" aria-label="' + esc(t('clock.label')) + '">' +
    icon('clock') +
    '<button type="button" data-action="clock" data-clock="12h" class="' + (c === '12h' ? 'active' : '') + '">12h</button>' +
    '<span>/</span>' +
    '<button type="button" data-action="clock" data-clock="24h" class="' + (c === '24h' ? 'active' : '') + '">24h</button>' +
  '</div>';
}

/* Time picker that follows the 12h/24h preference; a hidden input carries HH:MM for the form. */
function timeFieldHtml(name, value, required) {
  const parts = String(value || '').split(':');
  const has = !!value && parts.length >= 2;
  const h = has ? Number(parts[0]) : NaN;
  const m = has ? Number(parts[1]) : NaN;
  const is24 = getClock() === '24h';
  const sel = (role, opts, cur, label) => '<select data-role="time-part" data-part="' + role + '" aria-label="' + esc(label) + '">' +
    (required ? '' : '<option value="">--</option>') +
    opts.map((o) => '<option value="' + o.v + '"' + (String(o.v) === String(cur) ? ' selected' : '') + '>' + o.l + '</option>').join('') +
  '</select>';
  const mins = [];
  for (let i = 0; i < 60; i += 5) mins.push(i);
  if (has && mins.indexOf(m) === -1) { mins.push(m); mins.sort((a, b) => a - b); }
  const minOpts = mins.map((i) => ({ v: pad2(i), l: pad2(i) }));
  const reqDefault = required && !has;
  let html;
  if (is24) {
    const hours = [];
    for (let i = 0; i < 24; i++) hours.push({ v: pad2(i), l: pad2(i) });
    html = sel('h24', hours, has ? pad2(h) : (reqDefault ? '20' : ''), 'Hour') + '<b>:</b>' + sel('m', minOpts, has ? pad2(m) : (reqDefault ? '00' : ''), 'Minutes');
  } else {
    const hours = [];
    for (let i = 1; i <= 12; i++) hours.push({ v: String(i), l: String(i) });
    const h12 = has ? (h % 12 === 0 ? 12 : h % 12) : (reqDefault ? 8 : '');
    const ap = has ? (h >= 12 ? 'pm' : 'am') : (reqDefault ? 'pm' : '');
    html = sel('h12', hours, h12, 'Hour') + '<b>:</b>' + sel('m', minOpts, has ? pad2(m) : (reqDefault ? '00' : ''), 'Minutes') +
      sel('ap', [{ v: 'am', l: 'AM' }, { v: 'pm', l: 'PM' }], ap, 'AM/PM');
  }
  const hidden = has ? pad2(h) + ':' + pad2(m) : (reqDefault ? '20:00' : '');
  return '<span class="time-field" data-name="' + esc(name) + '"' + (required ? ' data-required="1"' : '') + '>' +
    '<input type="hidden" name="' + esc(name) + '" value="' + hidden + '">' + html + '</span>';
}
function pad2(n) { return String(n).padStart(2, '0'); }
function syncTimeField(wrap) {
  const get = (p) => { const s = wrap.querySelector('[data-part="' + p + '"]'); return s ? s.value : null; };
  const hidden = wrap.querySelector('input[type="hidden"]');
  const m = get('m');
  let h = get('h24');
  if (h === null) {
    const h12 = get('h12'); const ap = get('ap');
    h = (h12 && ap) ? pad2((Number(h12) % 12) + (ap === 'pm' ? 12 : 0)) : '';
  }
  hidden.value = (h && m) ? h + ':' + m : '';
}

function navHtml() {
  const links = [
    { v: 'home', label: t('nav.whatsOn') },
    { v: 'saved', label: t('nav.saved') },
    { v: 'about', label: t('nav.pub') }
  ];
  if (S.user && S.user.role === 'admin') links.push({ v: 'admin', label: t('nav.admin') });
  return '<header class="nav"><div class="nav-inner">' +
    '<a class="brand" href="#/home" data-action="nav" data-view="home">' +
      '<span class="brand-mark">OLP</span><span class="brand-text"><strong>OLD LONDON</strong><small>PUB &amp; HAPPENINGS</small></span>' +
    '</a>' +
    '<nav class="nav-links">' + links.map((l) =>
      '<a href="#/' + l.v + '" data-action="nav" data-view="' + l.v + '" class="' + (S.view === l.v ? 'active' : '') + '">' + esc(l.label) + '</a>'
    ).join('') + '</nav>' +
    '<div class="nav-right">' +
      '<span class="mode-pill ' + (isShared() ? 'shared' : '') + '">' + esc(isShared() ? t('nav.liveCal') : t('nav.deviceCal')) + '</span>' +
      langSwitchHtml() +
      clockSwitchHtml() +
      '<button class="btn btn-ghost btn-sm nav-ask" data-action="chat-open" type="button">' + icon('spark') + ' ' + esc(t('nav.ask')) + '</button>' +
      (S.user
        ? '<button class="account-btn" data-action="open-account" type="button"><span class="account-avatar">' + esc(S.user.name.slice(0, 1).toUpperCase()) + '</span><span>' + esc(S.user.name) + '</span></button>'
        : '<button class="btn btn-outline btn-sm" data-action="open-auth" type="button">' + icon('user') + ' ' + esc(t('nav.signIn')) + '</button>') +
    '</div>' +
  '</div></header>';
}

function heroHtml() {
  const next = upcoming()[0];
  const tag = localized(S.settings, 'tagline') || t('cta.title1');
  const parts = tag.split(' ');
  const first = parts.slice(0, 2).join(' ');
  const rest = parts.slice(2).join(' ');
  return '<section class="hero" style="background-image:url(\'assets/img/hero.jpg\')">' +
    '<div class="hero-overlay"></div><div class="hero-inner">' +
      '<div class="hero-copy">' +
        '<div class="eyebrow"><span class="rule"></span>' + esc(localized(S.settings, 'eyebrow')) + '</div>' +
        '<h1>' + esc(first) + ' <em>' + esc(rest) + '</em></h1>' +
        '<p class="hero-lede">' + esc(localized(S.settings, 'about')) + '</p>' +
        '<div class="hero-cta">' +
          '<button class="btn btn-primary" data-action="scroll-events" type="button">' + esc(t('hero.ctaEvents')) + ' ' + icon('arrow') + '</button>' +
          '<button class="btn btn-ghost-light" data-action="chat-open" type="button">' + icon('spark') + ' ' + esc(t('hero.ctaChat')) + '</button>' +
        '</div>' +
        '<div class="hero-social"><a href="' + esc(S.settings.instagram || '#') + '" target="_blank" rel="noopener">@old_london_pub <span>↗</span></a><span class="hero-social-sep"></span>' +
          '<button class="link-btn" data-action="maps" type="button" title="' + esc(t('find.hint')) + '">' + icon('pin') + esc(addr()) + ' <span>↗</span></button></div>' +
      '</div>' +
      (next ? '<button class="next-card" type="button" data-action="event" data-id="' + esc(next.id) + '">' +
        '<span class="next-label">' + esc(t('hero.nextUp')) + '</span>' +
        '<span class="next-date">' + esc(relativeDay(next.date).toUpperCase()) + ' · ' + esc(formatTime(next.time)) + '</span>' +
        '<strong>' + esc(localized(next, 'title')) + '</strong>' +
        '<span class="next-cat">' + esc(categoryLabel(next.category)) + ' · ' + esc(localized(next, 'price')) + '</span>' +
        '<span class="next-arrow">' + icon('arrow') + '</span>' +
      '</button>' : '') +
    '</div>' +
    '<div class="hero-scroll">' + esc(t('hero.scroll')) + ' <span></span></div>' +
  '</section>';
}

function dayStripHtml() {
  const start = todayIso();
  let html = '<div class="day-strip"><button class="day ' + (S.day === 'all' ? 'active' : '') + '" data-action="day" data-day="all" type="button"><small>' + esc(t('days.all')) + '</small><strong>' + esc(t('days.dates')) + '</strong></button>';
  for (let i = 0; i < 7; i++) {
    const iso = addDays(start, i);
    const d = dateOf(iso);
    const count = S.events.filter((e) => e.date === iso).length;
    html += '<button class="day ' + (S.day === iso ? 'active' : '') + ' ' + (count ? 'has-events' : '') + '" data-action="day" data-day="' + iso + '" type="button">' +
      '<small>' + esc(dayNames()[d.getDay()].slice(0, 3).toUpperCase()) + '</small>' +
      '<strong>' + d.getDate() + '</strong>' +
      '<span>' + (count ? esc(t(count === 1 ? 'days.one' : 'days.many', { n: count })) : '—') + '</span></button>';
  }
  return html + '</div>';
}

function visibleEvents() {
  let list = upcoming();
  if (S.filter !== 'all') list = list.filter((e) => e.category === S.filter);
  if (S.day !== 'all') list = list.filter((e) => e.date === S.day);
  return list;
}

function eventsHtml() {
  const list = visibleEvents();
  const cards = list.length
    ? '<div class="event-grid">' + list.map((e) => eventCard(e)).join('') + '</div>'
    : '<div class="empty-state">' + icon('calendar') + '<h3>' + esc(t('empty.title')) + '</h3><p>' + esc(t('empty.p')) + '</p>' +
      '<button class="btn btn-outline btn-sm" data-action="clear-filters" type="button">' + esc(t('empty.btn')) + '</button></div>';
  return '<section class="section events-section" id="events">' +
    '<div class="section-head"><div><div class="eyebrow"><span class="rule"></span>' + esc(t('events.eyebrow')) + '</div>' +
      '<h2>' + esc(t('events.title1')) + ' <em>' + esc(t('events.title2')) + '</em></h2><p>' + esc(t('events.p')) + '</p></div>' +
      '<div class="section-head-aside">' + icon('bell') + '<span>' + esc(t('events.aside')) + '</span></div></div>' +
    dayStripHtml() + '<div class="chips">' + chipsRow() + '</div>' + cards +
  '</section>';
}

function aboutHtml() {
  const st = (k) => esc(t('about.stamp' + k));
  return '<section class="section about-section"><div class="about-grid">' +
    '<div class="about-image" style="background-image:url(\'assets/img/food.jpg\')"><span class="about-stamp">' + st(1) + '<br>' + st(2) + '<br>' + st(3) + '</span></div>' +
    '<div class="about-copy"><div class="eyebrow"><span class="rule"></span>' + esc(t('about.eyebrow')) + '</div>' +
      '<h2>' + esc(t('about.title1')) + ' <em>' + esc(t('about.title2')) + '</em></h2>' +
      '<p>' + esc(localized(S.settings, 'about')) + '</p>' +
      '<div class="info-list">' +
        '<div class="info-row">' + icon('clock') + '<div><strong>' + esc(t('info.hours')) + '</strong><span>' + esc(localized(S.settings, 'hours')) + '</span></div></div>' +
        '<div class="info-row map-info-row" data-action="maps" role="button" tabindex="0">' + icon('pin') + '<div><strong>' + esc(t('info.findUs')) + '</strong><span>' + esc(addr()) + '</span></div>' + icon('external') + '</div>' +
        '<div class="info-row">' + icon('spark') + '<div><strong>' + esc(t('info.follow')) + '</strong><span>' + esc(S.settings.instagram || '') + '</span></div></div>' +
      '</div></div>' +
  '</div></section>';
}

function findHtml() {
  return '<section class="section find-section" id="find-us"><div class="find-grid">' +
    '<button class="map-card" type="button" data-action="maps" aria-label="' + esc(t('find.maps')) + '">' +
      '<span class="map-grid"></span>' +
      '<span class="map-pin">' + icon('pin') + '</span>' +
      '<span class="map-marker">OLP</span>' +
      '<span class="map-overlay">' + icon('external') + '<strong>' + esc(t('find.maps')) + '</strong></span>' +
    '</button>' +
    '<div class="find-copy"><div class="eyebrow"><span class="rule"></span>' + esc(t('find.eyebrow')) + '</div>' +
      '<h2>' + esc(t('find.title1')) + ' <em>' + esc(t('find.title2')) + '</em></h2>' +
      '<p>' + esc(t('find.p')) + '</p>' +
      '<div class="find-block"><span class="find-label">' + esc(t('find.address')) + '</span>' +
        '<button class="find-address" type="button" data-action="maps">' + icon('pin') + '<strong>Gavrila Principa 46</strong><span>Belgrade, Serbia</span>' + icon('external') + '</button></div>' +
      '<div class="find-block"><span class="find-label">' + esc(t('find.hours')) + '</span>' +
        '<p class="find-hours">' + esc(localized(S.settings, 'hours')) + '</p></div>' +
      '<div class="find-actions">' +
        '<button class="btn btn-primary btn-sm" data-action="maps" type="button">' + icon('pin') + ' ' + esc(t('find.maps')) + '</button>' +
        '<button class="btn btn-outline btn-sm" data-action="directions" type="button">' + icon('arrow') + ' ' + esc(t('find.directions')) + '</button>' +
      '</div>' +
      '<small class="find-hint">' + icon('map') + esc(t('find.hint')) + '</small>' +
    '</div>' +
  '</div></section>';
}

function ctaHtml() {
  return '<section class="cta-section">' +
    '<div class="cta-glow"></div><div class="cta-inner">' +
      '<div class="eyebrow"><span class="rule"></span>' + esc(t('cta.eyebrow')) + '</div>' +
      '<h2>' + esc(t('cta.title1')) + ' <em>' + esc(t('cta.title2')) + '</em></h2>' +
      '<p>' + esc(t('cta.p')) + '</p>' +
      '<div class="cta-actions">' +
        (S.user ? '<button class="btn btn-primary" data-action="nav" data-view="saved" type="button">' + esc(t('cta.saved')) + ' ' + icon('arrow') + '</button>'
                : '<button class="btn btn-primary" data-action="open-auth" type="button">' + esc(t('cta.account')) + ' ' + icon('arrow') + '</button>') +
        '<button class="btn btn-ghost-light" data-action="chat-open" type="button">' + esc(t('cta.ask')) + '</button>' +
      '</div>' +
      '<div class="cta-perks"><span>' + icon('bookmark') + esc(t('cta.perk1')) + '</span><span>' + icon('bell') + esc(t('cta.perk2')) + '</span><span>' + icon('calendar') + esc(t('cta.perk3')) + '</span></div>' +
    '</div></section>';
}

function footerHtml() {
  return '<footer class="footer"><div class="footer-grid">' +
    '<div><div class="brand footer-brand"><span class="brand-mark">OLP</span><span class="brand-text"><strong>OLD LONDON</strong><small>PUB &amp; HAPPENINGS</small></span></div>' +
      '<p>' + esc(localized(S.settings, 'tagline')) + '</p></div>' +
    '<div><h4>' + esc(t('footer.find')) + '</h4>' +
      '<button class="footer-link" data-action="maps" type="button">' + esc(addr()) + ' ↗</button>' +
      '<p>' + esc(localized(S.settings, 'hours')) + '</p></div>' +
    '<div><h4>' + esc(t('footer.contact')) + '</h4><p>' + esc(S.settings.email || '') + '</p><p>' + esc(S.settings.phone || '') + '</p></div>' +
    '<div><h4>' + esc(t('footer.follow')) + '</h4><a href="' + esc(S.settings.instagram || '#') + '" target="_blank" rel="noopener">' + esc(t('footer.instagram')) + '</a>' +
      '<a href="' + esc(isShared() ? 'calendar.ics' : '#') + '" class="footer-link" ' + (isShared() ? '' : 'data-action="chat-open"') + '>' + icon('calendar') + ' ' + esc(t('share.ics')) + ' ↗</a>' +
      '<button class="footer-link" data-action="chat-open" type="button">' + esc(t('footer.ask')) + '</button></div>' +
    '</div><div class="footer-bottom"><span>© ' + new Date().getFullYear() + ' Old London Pub. ' + esc(t('footer.rights')) + '</span><span>' + esc(t('footer.made')) + '</span></div></footer>';
}

/* ------------------------------------------------------------ saved view */
function savedHtml() {
  const list = savedEvents();
  const perm = permissionState();
  const permLabel = perm === 'granted' || perm === 'native' ? t('remind.on') : perm === 'denied' ? t('remind.blocked') : t('remind.off');
  return '<div class="page"><div class="page-head"><div class="eyebrow"><span class="rule"></span>' + esc(t('saved.eyebrow')) + '</div>' +
    '<h1>' + esc(t('saved.title1')) + ' <em>' + esc(t('saved.title2')) + '</em></h1><p>' + esc(t('saved.p')) + '</p></div>' +
    '<div class="saved-layout"><div class="saved-main">' +
      (S.user
        ? (list.length ? '<div class="saved-list">' + list.map((e) =>
            '<div class="saved-row"><div class="saved-date"><strong>' + +e.date.slice(8) + '</strong><span>' + esc(monthNames()[+e.date.slice(5, 7) - 1].slice(0, 3)) + '</span></div>' +
            '<div class="saved-info"><span class="badge badge-' + esc(e.category) + '">' + esc(categoryLabel(e.category)) + '</span><h3>' + esc(localized(e, 'title')) + '</h3><small>' + esc(longDate(e.date)) + ' · ' + esc(formatTime(e.time)) + '</small></div>' +
            '<div class="saved-actions"><button class="mini-btn" data-action="ics" data-id="' + esc(e.id) + '" type="button" title="' + esc(t('saved.calendar')) + '">' + icon('calendar') + '</button>' +
            '<button class="mini-btn" data-action="event" data-id="' + esc(e.id) + '" type="button">' + esc(t('card.details')) + ' ' + icon('arrow') + '</button>' +
            '<button class="mini-btn saved" data-action="save" data-id="' + esc(e.id) + '" type="button" title="' + esc(t('saved.remove')) + '">' + icon('bookmark') + '</button></div></div>'
          ).join('') + '</div>'
          : '<div class="empty-state">' + icon('bookmark') + '<h3>' + esc(t('saved.emptyTitle')) + '</h3><p>' + esc(t('saved.emptyP')) + '</p>' +
            '<button class="btn btn-outline btn-sm" data-action="nav" data-view="home" type="button">' + esc(t('saved.browse')) + '</button></div>')
        : '<div class="empty-state">' + icon('user') + '<h3>' + esc(t('saved.signInTitle')) + '</h3><p>' + esc(t('saved.signInP')) + '</p>' +
          '<button class="btn btn-primary btn-sm" data-action="open-auth" type="button">' + esc(t('saved.signInBtn')) + '</button></div>') +
    '</div>' +
    '<aside class="saved-side"><div class="side-card"><div class="side-icon">' + icon('bell') + '</div><h3>' + esc(t('remind.title')) + '</h3>' +
      '<p>' + esc(t(hasNativeNotifications() ? 'remind.pNative' : 'remind.p')) + '</p>' +
      '<div class="side-status"><span>' + esc(t('remind.permission')) + '</span><strong class="' + (perm === 'denied' ? 'bad' : '') + '">' + esc(permLabel) + '</strong></div>' +
      '<label class="toggle-row"><span>' + esc(t('remind.toggle')) + '</span><input type="checkbox" id="notify-toggle" ' + (S.user && S.user.notify ? 'checked' : '') + ' ' + (S.user ? '' : 'disabled') + '><span class="toggle"></span></label>' +
      '<button class="btn btn-outline btn-sm full" data-action="notify-test" type="button">' + esc(t('remind.test')) + '</button>' +
      '<small class="side-note">' + esc(t('remind.note')) + '</small>' +
    '</div>' +
    pushPanelHtml() +
    '</aside></div></div>';
}

/* ------------------------------------------------------------ admin view */
function adminLockedHtml() {
  return '<div class="page"><div class="locked"><div class="locked-icon">' + icon('user') + '</div>' +
    '<h1>' + esc(t('admin.lockedTitle1')) + ' <em>' + esc(t('admin.lockedTitle2')) + '</em></h1><p>' + esc(t('admin.lockedP')) + '</p>' +
    '<button class="btn btn-primary" data-action="open-auth" type="button">' + esc(t('admin.lockedBtn')) + '</button></div></div>';
}

function eventFormHtml() {
  if (!S.adminEditing) return '';
  const e = S.adminEditing === 'new' ? null : byId(S.adminEditing);
  const f = e || { title: '', titleSr: '', category: 'quiz', date: addDays(todayIso(), 1), time: '20:00', endTime: '', price: 'Free entry', priceSr: 'Ulaz slobodan', description: '', descriptionSr: '', image: 'assets/img/quiz.jpg', featured: false };
  const imgOpts = ['hero', 'quiz', 'live', 'stage', 'crowd', 'drinks', 'food'];
  return '<div class="admin-form-wrap"><form id="event-form" class="admin-form">' +
    '<div class="form-head"><h3>' + esc(t(e ? 'admin.editEvent' : 'admin.newEvent')) + '</h3>' + clockSwitchHtml() + '<button class="icon-btn" data-action="admin-cancel" type="button" aria-label="' + esc(t('admin.cancel')) + '">' + icon('close') + '</button></div>' +
    '<input type="hidden" name="id" value="' + esc(e ? e.id : '') + '">' +
    '<label class="field wide"><span>' + esc(t('form.title')) + '</span><input name="title" required maxlength="120" value="' + esc(f.title) + '" placeholder="The Big Tuesday Quiz"></label>' +
    '<label class="field wide"><span>' + esc(t('form.titleSr')) + '</span><input name="titleSr" maxlength="120" value="' + esc(f.titleSr || '') + '" placeholder="Veliki kviz utorkom"></label>' +
    '<label class="field"><span>' + esc(t('form.category')) + '</span><select name="category">' + CATEGORIES.map((c) => '<option value="' + c.id + '" ' + (f.category === c.id ? 'selected' : '') + '>' + esc(categoryLabel(c.id)) + '</option>').join('') + '</select></label>' +
    photoField(f.image, imgOpts) +
    '<label class="field"><span>' + esc(t('form.date')) + '</span><input type="date" name="date" required value="' + esc(f.date) + '"></label>' +
    '<label class="field"><span>' + esc(t('form.start')) + '</span>' + timeFieldHtml('time', f.time, true) + '</label>' +
    '<label class="field"><span>' + esc(t('form.end')) + '</span>' + timeFieldHtml('endTime', f.endTime || '', false) + '</label>' +
    '<label class="field"><span>' + esc(t('form.price')) + '</span><input name="price" maxlength="60" value="' + esc(f.price || '') + '"></label>' +
    '<label class="field"><span>' + esc(t('form.priceSr')) + '</span><input name="priceSr" maxlength="60" value="' + esc(f.priceSr || '') + '"></label>' +
    '<label class="field wide"><span>' + esc(t('form.description')) + '</span><textarea name="description" rows="3" maxlength="1200">' + esc(f.description || '') + '</textarea></label>' +
    '<label class="field wide"><span>' + esc(t('form.descriptionSr')) + '</span><textarea name="descriptionSr" rows="3" maxlength="1200">' + esc(f.descriptionSr || '') + '</textarea></label>' +
    '<label class="check-row wide"><input type="checkbox" name="featured" ' + (f.featured ? 'checked' : '') + '><span>' + esc(t('form.featured')) + '</span></label>' +
    '<div class="form-actions wide"><button class="btn btn-primary btn-sm" type="submit">' + esc(t(e ? 'admin.saveChanges' : 'admin.addEvent')) + '</button>' +
    '<button class="btn btn-ghost btn-sm" data-action="admin-cancel" type="button">' + esc(t('admin.cancel')) + '</button></div>' +
  '</form></div>';
}

function adminHtml() {
  if (!S.user || S.user.role !== 'admin') return adminLockedHtml();
  const list = S.events.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const s = S.settings;
  const f = (name, label, value, opts) => '<label class="field ' + (opts && opts.wide ? 'wide' : '') + '"><span>' + esc(label) + '</span>' + (opts && opts.area
    ? '<textarea name="' + name + '" rows="3" maxlength="600">' + esc(value || '') + '</textarea>'
    : '<input name="' + name + '" maxlength="600" value="' + esc(value || '') + '">') + '</label>';
  return '<div class="page"><div class="page-head admin-head"><div><div class="eyebrow"><span class="rule"></span>' + esc(t('admin.eyebrow')) + '</div>' +
    '<h1>' + esc(t('admin.title1')) + ' <em>' + esc(t('admin.title2')) + '</em></h1><p>' + esc(t('admin.p')) + '</p></div>' +
    '<button class="btn btn-primary btn-sm" data-action="chat-open" type="button">' + icon('spark') + ' ' + esc(t('admin.ask')) + '</button></div>' +
    '<div class="stat-row"><div class="stat"><strong>' + S.events.length + '</strong><span>' + esc(t('admin.statEvents')) + '</span></div>' +
      '<div class="stat"><strong>' + upcoming().length + '</strong><span>' + esc(t('admin.statUpcoming')) + '</span></div>' +
      '<div class="stat"><strong>' + S.saved.length + '</strong><span>' + esc(t('admin.statSaved')) + '</span></div>' +
      '<div class="stat"><strong>' + esc(isShared() ? t('nav.liveCal') : t('nav.deviceCal')) + '</strong><span>' + esc(t('admin.statMode')) + '</span></div></div>' +
    '<section class="admin-panel"><div class="panel-head"><div><h2>' + esc(t('admin.happenings')) + '</h2><p>' + esc(t('admin.happeningsP')) + '</p></div>' +
      '<button class="btn btn-outline btn-sm" data-action="admin-new" type="button">' + icon('plus') + ' ' + esc(t('admin.addEvent')) + '</button></div>' +
      eventFormHtml() +
      '<div class="admin-table"><div class="admin-tr admin-th"><span>' + esc(t('admin.colDate')) + '</span><span>' + esc(t('admin.colEvent')) + '</span><span>' + esc(t('admin.colCategory')) + '</span><span>' + esc(t('admin.colTime')) + '</span><span></span></div>' +
      list.map((e) => '<div class="admin-tr"><span class="mono">' + esc(shortDate(e.date)) + '</span><span><strong>' + esc(localized(e, 'title')) + '</strong>' + (e.featured ? ' <em class="feat-tag">' + esc(t('card.featured')) + '</em>' : '') + '</span>' +
        '<span><span class="badge badge-' + esc(e.category) + '">' + esc(categoryLabel(e.category)) + '</span></span><span class="mono">' + esc(formatTime(e.time)) + '</span>' +
        '<span class="row-actions"><button class="mini-btn" data-action="admin-edit" data-id="' + esc(e.id) + '" type="button" title="' + esc(t('admin.editEvent')) + '">' + icon('edit') + '</button>' +
        '<button class="mini-btn danger" data-action="admin-delete" data-id="' + esc(e.id) + '" type="button" title="' + esc(t('admin.delete')) + '">' + icon('trash') + '</button></span></div>').join('') +
      '</div></section>' +
    '<section class="admin-panel"><div class="panel-head"><div><h2>' + esc(t('admin.pubDetails')) + '</h2><p>' + esc(t('admin.pubDetailsP')) + '</p></div></div>' +
      '<form id="settings-form" class="admin-form">' +
        f('pubName', t('set.pubName'), s.pubName) +
        f('tagline', t('set.tagline'), s.tagline) + f('taglineSr', t('set.taglineSr'), s.taglineSr) +
        f('eyebrow', t('set.eyebrow'), s.eyebrow) + f('eyebrowSr', t('set.eyebrowSr'), s.eyebrowSr) +
        f('hours', t('set.hours'), s.hours) + f('hoursSr', t('set.hoursSr'), s.hoursSr) +
        f('about', t('set.about'), s.about, { wide: true, area: true }) +
        f('aboutSr', t('set.aboutSr'), s.aboutSr, { wide: true, area: true }) +
        f('address', t('set.address'), s.address) + f('instagram', t('set.instagram'), s.instagram) +
        f('email', t('set.email'), s.email) + f('phone', t('set.phone'), s.phone) +
        '<p class="form-note wide">' + esc(t('admin.contactNote')) + '</p>' +
        '<div class="form-actions wide"><button class="btn btn-primary btn-sm" type="submit">' + esc(t('admin.saveSettings')) + '</button></div>' +
      '</form></section>' +
    seriesPanelHtml() +
    '<section class="admin-panel"><div class="panel-head"><div><h2>' + esc(t('admin.tipTitle')) + '</h2></div></div><div class="admin-tip"><div class="side-icon">' + icon('spark') + '</div><div>' +
      '<p>' + esc(t('admin.tipP', { a1: t('admin.tipA1'), a2: t('admin.tipA2'), a3: t('admin.tipA3') })) + '</p></div></div></section>' +
  '</div>';
}

function aboutPageHtml() {
  return '<div class="page"><div class="page-head"><div class="eyebrow"><span class="rule"></span>' + esc(t('about.eyebrow')) + '</div>' +
    '<h1>' + esc(t('about.title1')) + ' <em>' + esc(t('about.title2')) + '</em></h1><p>' + esc(localized(S.settings, 'about')) + '</p></div>' +
    '<div class="about-cards"><div class="about-card">' + icon('clock') + '<h3>' + esc(t('info.hours')) + '</h3><p>' + esc(localized(S.settings, 'hours')) + '</p></div>' +
      '<div class="about-card">' + icon('pin') + '<h3>' + esc(t('aboutPage.cards')) + '</h3><p><button class="footer-link" data-action="maps" type="button">' + esc(addr()) + ' ↗</button></p></div>' +
      '<div class="about-card">' + icon('spark') + '<h3>' + esc(t('info.follow')) + '</h3><p><a href="' + esc(S.settings.instagram || '#') + '" target="_blank" rel="noopener">@old_london_pub ↗</a></p></div></div>' +
    '<div class="about-wide" style="background-image:url(\'assets/img/quiz.jpg\')"></div>' +
    '<div class="about-page-map"><button class="btn btn-primary btn-sm" data-action="maps" type="button">' + icon('pin') + ' ' + esc(t('find.maps')) + '</button>' +
      '<button class="btn btn-outline btn-sm" data-action="directions" type="button">' + icon('arrow') + ' ' + esc(t('find.directions')) + '</button></div>' +
  '</div>';
}

/* ------------------------------------------------------------ modals */
function authModalHtml() {
  const signin = S.authTab === 'signin';
  return '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal auth-modal" role="dialog" aria-modal="true">' +
    '<button class="icon-btn modal-close" data-action="close-modal" type="button" aria-label="' + esc(t('admin.cancel')) + '">' + icon('close') + '</button>' +
    '<div class="auth-brand"><span class="brand-mark">OLP</span><h2>' + esc(t(signin ? 'auth.welcome' : 'auth.join')) + '</h2><p>' + esc(t(signin ? 'auth.signInP' : 'auth.signUpP')) + '</p></div>' +
    '<div class="auth-tabs"><button class="' + (signin ? 'active' : '') + '" data-action="auth-tab" data-tab="signin" type="button">' + esc(t('auth.tabSignIn')) + '</button>' +
      '<button class="' + (!signin ? 'active' : '') + '" data-action="auth-tab" data-tab="signup" type="button">' + esc(t('auth.tabSignUp')) + '</button></div>' +
    '<form id="auth-form" class="auth-form">' +
      '<label class="field"><span>' + esc(t('auth.username')) + '</span><input name="username" required autocomplete="username" placeholder="' + esc(t(signin ? 'auth.usernamePlaceholder' : 'auth.usernamePlaceholderSignup')) + '"></label>' +
      (!signin ? '<label class="field"><span>' + esc(t('auth.name')) + '</span><input name="name" autocomplete="name" placeholder="' + esc(t('auth.namePlaceholder')) + '"></label>' +
        '<label class="field"><span>' + esc(t('auth.email')) + '</span><input name="email" type="email" autocomplete="email" placeholder="' + esc(t('auth.emailPlaceholder')) + '"></label>' : '') +
      '<label class="field"><span>' + esc(t('auth.password')) + '</span><input name="password" type="password" required minlength="6" autocomplete="' + (signin ? 'current-password' : 'new-password') + '" placeholder="••••••••"></label>' +
      (S.authError ? '<div class="form-error">' + esc(localizeError(S.authError)) + '</div>' : '') +
      '<button class="btn btn-primary full" type="submit" ' + (S.authBusy ? 'disabled' : '') + '>' + esc(S.authBusy ? t('auth.busy') : t(signin ? 'auth.signIn' : 'auth.signUp')) + '</button>' +
    '</form>' +
    '<div class="auth-note">' + esc(t('auth.note')) + '</div>' +
  '</div>';
}

function accountModalHtml() {
  return '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal small-modal" role="dialog" aria-modal="true">' +
    '<button class="icon-btn modal-close" data-action="close-modal" type="button" aria-label="' + esc(t('admin.cancel')) + '">' + icon('close') + '</button>' +
    '<div class="account-top"><span class="account-avatar big">' + esc((S.user?.name || '?').slice(0, 1).toUpperCase()) + '</span>' +
      '<div><h2>' + esc(S.user?.name || '') + '</h2><p>@' + esc(S.user?.username || '') + ' · ' + esc(t(S.user?.role === 'admin' ? 'account.adminRole' : 'account.userRole')) + '</p></div></div>' +
    '<div class="account-links"><button data-action="nav" data-view="saved" type="button">' + icon('bookmark') + ' ' + esc(t('account.saved')) + '</button>' +
      (S.user?.role === 'admin' ? '<button data-action="nav" data-view="admin" type="button">' + icon('edit') + ' ' + esc(t('account.admin')) + '</button>' : '') +
      '<button data-action="signout" type="button">' + icon('arrow') + ' ' + esc(t('account.signOut')) + '</button></div>' +
  '</div>';
}

function eventModalHtml(e) {
  const saved = S.saved.includes(e.id);
  return '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal event-modal" role="dialog" aria-modal="true">' +
    '<button class="icon-btn modal-close" data-action="close-modal" type="button" aria-label="' + esc(t('admin.cancel')) + '">' + icon('close') + '</button>' +
    '<div class="event-modal-media" style="background-image:url(\'' + esc(e.image) + '\')"><span class="badge badge-' + esc(e.category) + '">' + esc(categoryLabel(e.category)) + '</span></div>' +
    '<div class="event-modal-body"><div class="eyebrow"><span class="rule"></span>' + esc(longDate(e.date).toUpperCase()) + ' · ' + esc(formatTime(e.time)) + '</div>' +
      '<h2>' + esc(localized(e, 'title')) + '</h2><p>' + esc(localized(e, 'description')) + '</p>' +
      '<div class="detail-row">' + icon('clock') + '<span>' + esc(longDate(e.date)) + ', ' + esc(formatTime(e.time)) + (e.endTime ? ' – ' + esc(formatTime(e.endTime)) : '') + '</span>' + clockSwitchHtml() + '</div>' +
      '<button class="detail-row link-detail" data-action="maps" type="button">' + icon('pin') + '<span>' + esc(addr()) + ' ↗</span></button>' +
      '<div class="detail-row">' + icon('star') + '<span>' + esc(localized(e, 'price')) + '</span></div>' +
      '<div class="modal-actions"><button class="btn btn-primary btn-sm" data-action="save" data-id="' + esc(e.id) + '" type="button">' + icon('bookmark') + ' ' + esc(t(saved ? 'event.saved' : 'event.save')) + '</button>' +
        '<button class="btn btn-outline btn-sm" data-action="ics" data-id="' + esc(e.id) + '" type="button">' + icon('calendar') + ' ' + esc(t('event.calendar')) + '</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="share" data-id="' + esc(e.id) + '" type="button">' + icon('send') + ' ' + esc(t('share.title')) + '</button>' +
        (S.user?.role === 'admin'
          ? '<button class="btn btn-outline btn-sm" data-action="admin-edit" data-id="' + esc(e.id) + '" type="button">' + icon('edit') + ' ' + esc(t('admin.editEvent')) + '</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="admin-delete" data-id="' + esc(e.id) + '" type="button">' + icon('trash') + ' ' + esc(t('admin.delete')) + '</button>'
          : '') +
      '</div>' +
    '</div></div>';
}

/* ------------------------------------------------------------ share modal */
function shareModalHtml(e) {
  const baseUrl = location.origin + location.pathname;
  const shareUrl = baseUrl + '#/event/' + encodeURIComponent(e.id);
  const caption = localized(e, 'title') + ' — ' + longDate(e.date) + ' ' + t('share.captionText');
  let qrHtml = '';
  try {
    if (typeof qrcode !== 'undefined') {
      const qr = qrcode(0, 'M');
      qr.addData(shareUrl);
      qr.make();
      qrHtml = qr.createImgTag(4, 2);
    }
  } catch (_) { qrHtml = ''; }
  return '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal small-modal" role="dialog" aria-modal="true">' +
    '<button class="icon-btn modal-close" data-action="close-modal" type="button" aria-label="' + esc(t('chat.close')) + '">' + icon('close') + '</button>' +
    '<h2 style="margin-bottom:8px">' + esc(t('share.title')) + '</h2>' +
    '<div class="share-event-info"><strong>' + esc(localized(e, 'title')) + '</strong><small>' + esc(longDate(e.date)) + ' · ' + esc(formatTime(e.time)) + '</small></div>' +
    (qrHtml ? '<div class="share-qr">' + qrHtml + '</div>' : '') +
    '<div class="share-actions">' +
      '<button class="btn btn-primary btn-sm" data-action="share-copy" data-url="' + esc(shareUrl) + '" type="button">' + icon('check') + ' ' + esc(t('share.copy')) + '</button>' +
      (navigator.share ? '<button class="btn btn-outline btn-sm" data-action="share-native" data-url="' + esc(shareUrl) + '" data-title="' + esc(localized(e, 'title')) + '" data-caption="' + esc(caption) + '" type="button">' + icon('send') + ' ' + esc(t('share.native')) + '</button>' : '') +
      '<button class="btn btn-outline btn-sm" data-action="ics" data-id="' + esc(e.id) + '" type="button">' + icon('calendar') + ' ' + esc(t('share.ics')) + '</button>' +
    '</div>' +
    '<input class="share-url-input" readonly value="' + esc(shareUrl) + '">' +
  '</div>';
}

/* ------------------------------------------------------------ QR install section */
function installHtml() {
  const apkUrl = '/app/old-london-pub.apk';
  let qrHtml = '';
  try {
    if (typeof qrcode !== 'undefined') {
      const qr = qrcode(0, 'M');
      qr.addData(location.origin + location.pathname + '?install=app');
      qr.make();
      qrHtml = qr.createImgTag(5, 2);
    }
  } catch (_) { qrHtml = ''; }
  return '<section class="section install-section" id="get-app">' +
    '<div class="install-grid">' +
      (qrHtml ? '<div class="install-qr">' + qrHtml + '</div>' : '') +
      '<div class="install-copy"><div class="eyebrow"><span class="rule"></span>' + esc(t('install.eyebrow')) + '</div>' +
        '<h2>' + esc(t('install.title1')) + ' <em>' + esc(t('install.title2')) + '</em></h2>' +
        '<p>' + esc(t('install.p')) + '</p>' +
        '<div class="install-actions">' +
          (isNative() ? '<span class="install-done">' + icon('check') + ' ' + esc(t('install.installed')) + '</span>'
            : '<a class="btn btn-primary btn-sm" href="' + esc(apkUrl) + '" download>' + icon('arrow') + ' ' + esc(t('install.android')) + '</a>') +
          '<span class="install-ios">' + esc(t('install.ios')) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</section>';
}

/* ------------------------------------------------------------ series admin */
function seriesFormHtml() {
  if (S.adminEditing !== 'series-new' && S.adminEditing !== 'series-edit') return '';
  const isNew = S.adminEditing === 'series-new';
  const f = isNew ? { title: '', titleSr: '', category: 'quiz', date: addDays(todayIso(), 1), time: '20:00', endTime: '', price: 'Free entry', priceSr: 'Ulaz slobodan', description: '', descriptionSr: '', image: 'assets/img/quiz.jpg', featured: false, freq: 'weekly', count: 8, interval: 1 } : {};
  const imgOpts = ['hero', 'quiz', 'live', 'stage', 'crowd', 'drinks', 'food'];
  const freqs = [
    { id: 'weekly', label: t('series.weekly') },
    { id: 'biweekly', label: t('series.biweekly') },
    { id: 'monthly', label: t('series.monthly') }
  ];
  return '<div class="admin-form-wrap"><form id="series-form" class="admin-form">' +
    '<div class="form-head"><h3>' + esc(isNew ? t('series.add') : t('series.edit')) + '</h3>' + clockSwitchHtml() + '<button class="icon-btn" data-action="admin-cancel" type="button" aria-label="' + esc(t('admin.cancel')) + '">' + icon('close') + '</button></div>' +
    '<label class="field wide"><span>' + esc(t('form.title')) + '</span><input name="title" required maxlength="120" value="' + esc(f.title) + '" placeholder="The Big Tuesday Quiz"></label>' +
    '<label class="field wide"><span>' + esc(t('form.titleSr')) + '</span><input name="titleSr" maxlength="120" value="' + esc(f.titleSr || '') + '" placeholder="Veliki kviz utorkom"></label>' +
    '<label class="field"><span>' + esc(t('form.category')) + '</span><select name="category">' + CATEGORIES.map((c) => '<option value="' + c.id + '" ' + (f.category === c.id ? 'selected' : '') + '>' + esc(categoryLabel(c.id)) + '</option>').join('') + '</select></label>' +
    photoField(f.image, imgOpts) +
    '<label class="field"><span>' + esc(t('form.date')) + '</span><input type="date" name="date" required value="' + esc(f.date) + '"></label>' +
    '<label class="field"><span>' + esc(t('form.start')) + '</span>' + timeFieldHtml('time', f.time, true) + '</label>' +
    '<label class="field"><span>' + esc(t('series.freq')) + '</span><select name="freq">' + freqs.map((fr) => '<option value="' + fr.id + '" ' + (f.freq === fr.id ? 'selected' : '') + '>' + esc(fr.label) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>' + esc(t('series.count')) + '</span><input type="number" name="count" min="1" max="26" value="' + esc(f.count) + '"></label>' +
    '<label class="field"><span>' + esc(t('form.price')) + '</span><input name="price" maxlength="60" value="' + esc(f.price || '') + '"></label>' +
    '<label class="field"><span>' + esc(t('form.priceSr')) + '</span><input name="priceSr" maxlength="60" value="' + esc(f.priceSr || '') + '"></label>' +
    '<label class="field wide"><span>' + esc(t('form.description')) + '</span><textarea name="description" rows="2" maxlength="1200">' + esc(f.description || '') + '</textarea></label>' +
    '<label class="field wide"><span>' + esc(t('form.descriptionSr')) + '</span><textarea name="descriptionSr" rows="2" maxlength="1200">' + esc(f.descriptionSr || '') + '</textarea></label>' +
    '<div class="form-actions wide"><button class="btn btn-primary btn-sm" type="submit">' + esc(t('series.add')) + '</button>' +
    '<button class="btn btn-ghost btn-sm" data-action="admin-cancel" type="button">' + esc(t('admin.cancel')) + '</button></div>' +
  '</form></div>';
}

function seriesPanelHtml() {
  const list = S.seriesList || [];
  const items = list.length ? list.map((sr) => {
    return '<div class="series-row"><div class="series-info"><strong>' + esc(sr.title || sr.titleSr || '—') + '</strong>' +
      '<span class="badge badge-' + esc(sr.category) + '">' + esc(categoryLabel(sr.category)) + '</span> ' +
      '<small>' + esc(t('series.' + sr.freq)) + ' · ' + esc(t('series.countLabel', { n: sr.count })) + ' · ' + esc(sr.count) + ' ' + esc(t('series.upcoming')) + '</small></div>' +
      '<div class="row-actions">' +
      '<button class="mini-btn danger" data-action="series-delete" data-id="' + esc(sr.id) + '" type="button" title="' + esc(t('series.delete')) + '">' + icon('trash') + '</button></div></div>';
  }).join('') : '<div class="empty-state" style="padding:30px"><p>' + esc(t('series.empty')) + '</p></div>';
  return '<section class="admin-panel">' +
    '<div class="panel-head"><div><h2>' + esc(t('series.title')) + '</h2><p>' + esc(t('series.p')) + '</p></div>' +
    '<button class="btn btn-outline btn-sm" data-action="series-new" type="button">' + icon('plus') + ' ' + esc(t('series.add')) + '</button></div>' +
    seriesFormHtml() +
    '<div class="series-list">' + items + '</div>' +
  '</section>';
}

/* ------------------------------------------------------------ push panel */
function pushPanelHtml() {
  const supported = pushSupported();
  const on = S.pushOn;
  const label = !supported ? t('push.disabled') : on ? t('push.enabled') : t('push.disabled');
  const cats = CATEGORIES.map((c) => '<label class="check-row"><input type="checkbox" class="push-cat" value="' + c.id + '"' + (on ? '' : '') + '><span>' + esc(categoryLabel(c.id)) + '</span></label>').join('');
  return '<div class="side-card push-card"><div class="side-icon">' + icon('bell') + '</div><h3>' + esc(t('push.title')) + '</h3>' +
    '<p>' + esc(t('push.p')) + '</p>' +
    '<div class="side-status"><span>' + esc(t('push.enabled')) + '</span><strong class="' + (on ? '' : 'bad') + '">' + esc(label) + '</strong></div>' +
    (supported ? '<button class="btn btn-primary btn-sm full" data-action="' + (on ? 'push-disable' : 'push-enable') + '" type="button">' + esc(on ? t('push.disable') : t('push.enable')) + '</button>' : '<small class="side-note">' + esc(t('push.disabled')) + '</small>') +
    (on ? '<div class="push-prefs"><span class="find-label">' + esc(t('push.prefs')) + '</span><div class="push-cats">' + cats + '</div>' +
    '<span class="find-label">' + esc(t('push.quiet')) + '</span><input class="field-input" id="push-quiet" placeholder="' + esc(t('push.quietHint')) + '">' +
    '<button class="btn btn-outline btn-xs full" data-action="push-save-prefs" type="button">' + esc(t('admin.saveChanges')) + '</button>' +
    '<button class="btn btn-ghost btn-xs full" data-action="push-test" type="button">' + esc(t('push.testPush')) + '</button></div>' : '') +
    (S.user && S.user.role === 'admin' && isShared() ?
      '<div class="push-broadcast"><span class="find-label">' + esc(t('push.broadcast')) + '</span>' +
      '<input class="field-input" id="push-broadcast-msg" placeholder="' + esc(t('push.broadcastPlaceholder')) + '">' +
      '<button class="btn btn-outline btn-xs full" data-action="push-broadcast" type="button">' + esc(t('push.broadcast')) + '</button></div>' : '') +
  '</div>';
}

function renderModal() {
  const root = $('#modal-root');
  let html = '';
  if (S.modal?.type === 'auth') html = authModalHtml();
  else if (S.modal?.type === 'account') html = accountModalHtml();
  else if (S.modal?.type === 'event') { const e = byId(S.modal.id); if (e) html = eventModalHtml(e); }
  else if (S.modal?.type === 'share') { const e = byId(S.modal.id); if (e) html = shareModalHtml(e); }
  root.innerHTML = html;
  document.body.classList.toggle('modal-open', !!html);
}

/* ------------------------------------------------------------ chat */
function mdToHtml(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function renderChat() {
  const panel = $('#chat');
  panel.hidden = !S.chatOpen;
  $('#chat-fab').classList.toggle('open', S.chatOpen);
  $('#chat-subtitle').textContent = S.user?.role === 'admin' ? t('chat.subtitleAdmin') : t('chat.subtitle');
  document.body.dataset.admin = S.user?.role === 'admin' ? '1' : '0';
  $('#chat-mode').textContent = t(S.user?.role === 'admin' ? 'chat.modeAdmin' : 'chat.mode');

  const box = $('#chat-messages');
  let html = S.messages.map((m) => {
    const extra = m.events && m.events.length ? '<div class="chat-events">' + m.events.map(chatEventCard).join('') + '</div>' : '';
    const action = m.action && !m.actionDone
      ? '<div class="chat-action"><span class="chat-action-label">' + esc(m.action.label) + '</span>' +
        '<div class="chat-action-buttons"><button class="btn btn-primary btn-xs" data-action="chat-confirm" data-mid="' + m.id + '" type="button">' + icon('check') + ' ' + esc(t('chat.confirm')) + '</button>' +
        '<button class="btn btn-ghost btn-xs" data-action="chat-cancel" data-mid="' + m.id + '" type="button">' + esc(t('chat.cancel')) + '</button></div></div>'
      : (m.action && m.actionDone ? '<div class="chat-action done">' + icon('check') + ' ' + esc(t('chat.done')) + '</div>' : '');
    const img = m.image ? '<img class="msg-img" src="' + esc(m.image) + '" alt="">' : '';
    return '<div class="msg ' + m.role + '"><div class="msg-bubble">' + img + (m.text ? mdToHtml(m.text) : '') + extra + action + '</div></div>';
  }).join('');
  if (S.chatBusy) html += '<div class="msg assistant"><div class="msg-bubble typing"><i></i><i></i><i></i></div></div>';
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;

  const last = S.messages[S.messages.length - 1];
  const chips = last && last.chips ? last.chips : defaultChips();
  $('#chat-chips').innerHTML = chips.map((c) => '<button type="button" data-action="chip" data-text="' + esc(c) + '">' + esc(c) + '</button>').join('');
  $('#chat-send').disabled = S.chatBusy;
  $('#chat-attach').classList.toggle('is-disabled', S.chatBusy);
  $('#chat-file').disabled = S.chatBusy;
  renderChatPreview();
}

function photoField(image, imgOpts) {
  return '<div class="field photo-field"><span>' + esc(t('form.photo')) + '</span>' +
    '<div class="photo-row"><span class="photo-thumb" style="background-image:url(&quot;' + esc(image || '') + '&quot;)"></span>' +
    '<select name="image" data-role="photo-select">' + customImgOpt(image) + imgOpts.map((i) => '<option value="assets/img/' + i + '.jpg" ' + (image === 'assets/img/' + i + '.jpg' ? 'selected' : '') + '>' + i + '.jpg</option>').join('') + '</select>' +
    '<label class="btn btn-outline btn-sm photo-upload">&#8679; <span>' + esc(t('form.upload')) + '</span><input type="file" accept="image/*" data-role="photo-file" hidden></label>' +
    '</div></div>';
}

function customImgOpt(image) {
  return image && !String(image).startsWith('assets/img/') ? '<option value="' + esc(image) + '" selected>' + esc(t('form.customPhoto')) + '</option>' : '';
}

function renderChatPreview() {
  const box = $('#chat-attach-preview');
  if (!box) return;
  box.hidden = !S.chatImage;
  box.innerHTML = S.chatImage
    ? '<img src="' + esc(S.chatImage) + '" alt=""><button type="button" class="chat-attach-remove" data-action="chat-remove-image" aria-label="' + esc(t('chat.removeImage')) + '">&times;</button>'
    : '';
}

/* Downscale a picked image to a JPEG data URL (max 1280px) so it stays small enough to store. */
function resizeImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('bad image'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function addMessage(role, payload) {
  const m = Object.assign({ id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), role }, payload);
  S.messages.push(m);
  return m;
}
function resetChat() {
  S.messages = [];
  addMessage('assistant', {
    text: t('chat.greeting') + (S.user?.role === 'admin' ? t('chat.greetingAdmin') : ''),
    chips: defaultChips()
  });
}

// Switch 12h/24h display (from the toggle or from Ask OLP) and re-render times.
function applyClock(v) {
  if (getClock() === v) return;
  setClock(v);
  // Swap open time pickers in place so other in-progress form input survives.
  document.querySelectorAll('.time-field').forEach((tf) => {
    const hidden = tf.querySelector('input[type="hidden"]');
    tf.outerHTML = timeFieldHtml(tf.dataset.name, hidden ? hidden.value : '', !!tf.dataset.required);
  });
  document.querySelectorAll('.clock-switch button[data-clock]').forEach((b) => {
    b.classList.toggle('active', b.dataset.clock === v);
  });
  // Re-render displayed times (cards, event modal) without touching open forms.
  if (!document.querySelector('#event-form, #series-form')) renderApp();
  renderModal();
}

async function sendChat(raw) {
  const text = String(raw || '').trim();
  const image = S.chatImage;
  if ((!text && !image) || S.chatBusy) return;
  addMessage('user', { text, image });
  S.chatImage = null;
  S.chatBusy = true; renderChat();
  await sleep(380 + Math.random() * 320);
  let res;
  try { res = respond(text, { events: S.events, settings: S.settings, user: S.user, isAdmin: S.user?.role === 'admin', image }); }
  catch (err) { res = { text: t('chat.error'), chips: defaultChips() }; }
  if (res.clock) applyClock(res.clock);
  const msg = addMessage('assistant', { text: res.text, events: res.events, chips: res.chips, action: res.action });
  S.pendingAction = res.action ? { action: res.action, mid: msg.id } : null;
  S.chatBusy = false; renderChat();
}

async function confirmChatAction(mid) {
  const msg = S.messages.find((m) => m.id === mid);
  if (!msg || !msg.action || msg.actionDone) return;
  const a = msg.action;
  S.chatBusy = true; renderChat();
  try {
    let out;
    if (a.type === 'add') out = await Data.createEvent(a.payload);
    else if (a.type === 'update') out = await Data.updateEvent(a.id, a.payload);
    else out = await Data.deleteEvent(a.id);
    await refresh();
    msg.actionDone = true;
    S.pendingAction = null;
    const label = a.type === 'add'
      ? t('chat.successAdd', { title: a.payload.title, date: longDate(a.payload.date), time: formatTime(a.payload.time) })
      : a.type === 'update' ? t('chat.successUpdate', { title: out.event ? localized(out.event, 'title') : '' })
        : t('chat.successDelete');
    addMessage('assistant', { text: label, events: out.event ? [out.event] : undefined, chips: [t('chat.chip1')] });
    showToast(t('toast.calendarUpdated'));
    renderApp();
  } catch (err) {
    addMessage('assistant', { text: t('chat.actionFailed', { error: localizeError(err.message) }), chips: defaultChips() });
  }
  S.chatBusy = false; renderChat();
}

/* ------------------------------------------------------------ render */
function renderApp() {
  let body;
  if (S.view === 'saved') body = savedHtml();
  else if (S.view === 'admin') body = adminHtml();
  else if (S.view === 'about') body = aboutPageHtml();
  else body = heroHtml() + eventsHtml() + aboutHtml() + findHtml() + installHtml() + ctaHtml();
  app.innerHTML = navHtml() + '<main>' + body + '</main>' + footerHtml();
}
function render() { renderApp(); applyStaticI18n(); renderModal(); renderChat(); }

/* ------------------------------------------------------------ actions */
function setView(v) {
  S.view = v;
  S.adminEditing = null;
  if (location.hash !== '#/' + v) location.hash = '#/' + v;
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderApp();
}

async function toggleSave(id) {
  if (!S.user) { S.modal = { type: 'auth' }; S.authTab = 'signin'; S.authError = t('toast.signInToSave'); renderModal(); return; }
  try {
    const res = await Data.toggleSaved(id);
    S.saved = res.saved;
    const e = byId(id);
    if (res.added) {
      await requestPermission();
      if (S.user.notify) await scheduleFor(savedEvents());
      showToast(t('toast.saved', { title: e ? localized(e, 'title') : '' }));
    } else {
      if (e) cancelFor([e]);
      showToast(t('toast.removed'));
    }
    renderApp(); renderModal();
  } catch (err) { showToast(localizeError(err.message), 'error'); }
}

async function onClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;

  if (a === 'nav') { ev.preventDefault(); S.modal = null; renderModal(); setView(el.dataset.view); return; }
  if (a === 'lang') {
    if (getLang() === el.dataset.lang) return;
    setLang(el.dataset.lang);
    resetChat();
    render();
    showToast(t('lang.label') + ': ' + t('lang.name'));
    return;
  }
  if (a === 'clock') { applyClock(el.dataset.clock); return; }
  if (a === 'maps') { openExternal(mapsUrl(addr())); return; }
  if (a === 'directions') { openExternal(directionsUrl(addr())); return; }
  if (a === 'scroll-events') { document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (a === 'filter') { S.filter = el.dataset.cat; renderApp(); return; }
  if (a === 'day') { S.day = el.dataset.day; renderApp(); return; }
  if (a === 'clear-filters') { S.filter = 'all'; S.day = 'all'; renderApp(); return; }
  if (a === 'open-auth') { S.modal = { type: 'auth' }; S.authTab = 'signin'; S.authError = ''; renderModal(); return; }
  if (a === 'open-account') { S.modal = { type: 'account' }; renderModal(); return; }
  if (a === 'close-modal') { S.modal = null; renderModal(); return; }
  if (a === 'auth-tab') { S.authTab = el.dataset.tab; S.authError = ''; renderModal(); return; }
  if (a === 'event' || a === 'chat-event') { S.modal = { type: 'event', id }; renderModal(); return; }
  if (a === 'share') { S.modal = { type: 'share', id }; renderModal(); return; }
  if (a === 'share-copy') {
    try { navigator.clipboard.writeText(el.dataset.url); showToast(t('share.copied')); } catch (_) { /* ignore */ }
    return;
  }
  if (a === 'share-native') {
    try { navigator.share({ title: el.dataset.title, text: el.dataset.caption, url: el.dataset.url }); } catch (_) { /* user cancelled */ }
    return;
  }
  if (a === 'save') { await toggleSave(id); return; }
  if (a === 'ics') { const e = byId(id); if (e) { downloadIcs(e, S.settings); showToast(t('toast.ics')); } return; }
  if (a === 'signout') {
    try { await Auth.signout(); } catch (_) { /* ignore */ }
    setToken(''); await refresh(); S.modal = null; S.view = 'home'; location.hash = '#/home'; resetChat(); render(); showToast(t('toast.signout')); return;
  }
  if (a === 'chat-open') { S.chatOpen = true; renderChat(); setTimeout(() => $('#chat-input').focus(), 60); return; }
  if (a === 'chat-close') { S.chatOpen = false; renderChat(); return; }
  if (a === 'chat-remove-image') { S.chatImage = null; renderChatPreview(); return; }
  if (a === 'chip') { await sendChat(el.dataset.text); return; }
  if (a === 'chat-confirm') { await confirmChatAction(el.dataset.mid); return; }
  if (a === 'chat-cancel') {
    const m = S.messages.find((x) => x.id === el.dataset.mid);
    if (m) { m.action = null; m.actionDone = false; }
    S.pendingAction = null;
    addMessage('assistant', { text: t('chat.cancelled'), chips: defaultChips() });
    renderChat(); return;
  }
  if (a === 'notify-test') { const ok = await testNotification(); showToast(ok ? t('toast.testSent') : t('toast.allowNotifications'), ok ? '' : 'error'); return; }
  if (a === 'admin-new') { S.adminEditing = 'new'; renderApp(); document.querySelector('.admin-form-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (a === 'admin-edit') {
    if (S.modal) { S.modal = null; renderModal(); }
    if (S.view !== 'admin') setView('admin');
    S.adminEditing = id; renderApp(); document.querySelector('.admin-form-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (a === 'admin-cancel') { S.adminEditing = null; renderApp(); return; }
  if (a === 'admin-delete') {
    const e = byId(id);
    if (!e || !window.confirm(t('admin.deleteConfirm', { title: localized(e, 'title'), date: longDate(e.date) }))) return;
    try { await Data.deleteEvent(id); await refresh(); S.adminEditing = null; if (S.modal) { S.modal = null; renderModal(); } renderApp(); showToast(t('toast.eventDeleted')); }
    catch (err) { showToast(localizeError(err.message), 'error'); }
    return;
  }
  if (a === 'series-new') { S.adminEditing = 'series-new'; renderApp(); document.querySelector('.admin-form-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (a === 'series-delete') {
    const sr = S.seriesList.find((x) => x.id === id);
    const n = sr ? sr.count : 0;
    if (!window.confirm(t('series.deleteConfirm', { n }))) return;
    try { await api('DELETE', '/series/' + encodeURIComponent(id), {}); await refreshSeries(); renderApp(); showToast(t('series.deleted', { n })); }
    catch (err) { showToast(localizeError(err.message), 'error'); }
    return;
  }
  if (a === 'push-enable') { await enablePush(); return; }
  if (a === 'push-disable') { await disablePush(); return; }
  if (a === 'push-save-prefs') { await savePushPrefs(); return; }
  if (a === 'push-test') { const ok = await testPush(); showToast(ok ? t('toast.testSent') : t('toast.allowNotifications'), ok ? '' : 'error'); return; }
  if (a === 'push-broadcast') { await sendBroadcast(); return; }
}

async function onSubmit(ev) {
  const form = ev.target;
  if (form.id === 'chat-form') {
    ev.preventDefault();
    const input = $('#chat-input');
    const text = input.value;
    input.value = '';
    await sendChat(text);
    return;
  }
  if (form.id === 'auth-form') {
    ev.preventDefault();
    S.authBusy = true; S.authError = ''; renderModal();
    const d = new FormData(form);
    try {
      const res = S.authTab === 'signin'
        ? await Auth.signin(d.get('username'), d.get('password'))
        : await Auth.signup({ username: d.get('username'), password: d.get('password'), name: d.get('name'), email: d.get('email') });
      setToken(res.token);
      await refresh();
      if (S.user?.role === 'admin') await refreshSeries();
      S.modal = null; S.authBusy = false;
      resetChat(); render();
      showToast(t(S.authTab === 'signin' ? 'toast.welcome' : 'toast.created'));
      if (S.user?.role === 'admin') setView('admin');
      if (S.user?.notify) await requestPermission();
    } catch (err) {
      S.authBusy = false; S.authError = localizeError(err.message || 'Something went wrong.');
      renderModal();
    }
    return;
  }
  if (form.id === 'event-form') {
    ev.preventDefault();
    const d = new FormData(form);
    const payload = {
      title: d.get('title'), titleSr: d.get('titleSr') || d.get('title'),
      category: d.get('category'), date: d.get('date'), time: d.get('time'),
      endTime: d.get('endTime') || '', price: d.get('price') || 'Free entry',
      priceSr: d.get('priceSr') || d.get('price') || 'Ulaz slobodan',
      description: d.get('description') || '', descriptionSr: d.get('descriptionSr') || d.get('description') || '',
      image: d.get('image'), featured: !!d.get('featured')
    };
    const eid = d.get('id');
    try {
      if (eid) await Data.updateEvent(eid, payload); else await Data.createEvent(payload);
      await refresh(); S.adminEditing = null; renderApp(); showToast(t(eid ? 'toast.eventUpdated' : 'toast.eventAdded'));
    } catch (err) { showToast(localizeError(err.message), 'error'); }
    return;
  }
  if (form.id === 'settings-form') {
    ev.preventDefault();
    const d = new FormData(form);
    const payload = {};
    ['pubName', 'tagline', 'taglineSr', 'eyebrow', 'eyebrowSr', 'hours', 'hoursSr', 'about', 'aboutSr', 'address', 'instagram', 'email', 'phone'].forEach((k) => payload[k] = d.get(k));
    try { await Data.updateSettings(payload); await refresh(); renderApp(); showToast(t('toast.settingsSaved')); }
    catch (err) { showToast(localizeError(err.message), 'error'); }
    return;
  }
  if (form.id === 'series-form') {
    ev.preventDefault();
    const d = new FormData(form);
    const payload = {
      title: d.get('title'), titleSr: d.get('titleSr') || d.get('title'),
      category: d.get('category'), date: d.get('date'), time: d.get('time'),
      price: d.get('price') || 'Free entry', priceSr: d.get('priceSr') || d.get('price') || 'Ulaz slobodan',
      description: d.get('description') || '', descriptionSr: d.get('descriptionSr') || d.get('description') || '',
      image: d.get('image'), repeat: { freq: d.get('freq'), count: parseInt(d.get('count'), 10) || 8, interval: 1 }
    };
    try {
      const res = await api('POST', '/series', payload);
      await refresh(); await refreshSeries(); S.adminEditing = null; renderApp();
      showToast(t('series.created', { n: res.events.length }));
    } catch (err) { showToast(localizeError(err.message), 'error'); }
    return;
  }
}

async function onChange(ev) {
  const tf = ev.target.closest && ev.target.closest('.time-field');
  if (tf) { syncTimeField(tf); return; }
  if (ev.target.dataset && ev.target.dataset.role === 'photo-file') {
    const file = ev.target.files && ev.target.files[0];
    const box = ev.target.closest('.photo-field');
    ev.target.value = '';
    if (!file || !box) return;
    try {
      const url = await resizeImage(file);
      const sel = box.querySelector('select[name="image"]');
      [...sel.options].forEach((o) => { if (!o.value.startsWith('assets/img/')) o.remove(); });
      const opt = document.createElement('option');
      opt.value = url; opt.textContent = t('form.customPhoto');
      sel.insertBefore(opt, sel.firstChild); sel.value = url;
      box.querySelector('.photo-thumb').style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
    } catch (err) { showToast(t('chat.imageError'), 'error'); }
    return;
  }
  if (ev.target.dataset && ev.target.dataset.role === 'photo-select') {
    const th = ev.target.closest('.photo-field')?.querySelector('.photo-thumb');
    if (th) th.style.backgroundImage = 'url(' + JSON.stringify(ev.target.value) + ')';
    return;
  }
  if (ev.target.id === 'chat-file') {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try { S.chatImage = await resizeImage(file); renderChatPreview(); setTimeout(() => $('#chat-input').focus(), 30); }
    catch (err) { showToast(t('chat.imageError'), 'error'); }
    return;
  }
  if (ev.target.id === 'notify-toggle') {
    const on = ev.target.checked;
    if (!S.user) { ev.target.checked = false; S.modal = { type: 'auth' }; renderModal(); return; }
    try {
      if (on) await requestPermission();
      await Auth.setNotify(on);
      await refresh();
      if (on) await scheduleFor(savedEvents()); else cancelFor(savedEvents());
      showToast(t(on ? 'toast.remindersOn' : 'toast.remindersOff'));
      renderApp();
    } catch (err) { showToast(localizeError(err.message), 'error'); }
  }
}

function onKeydown(ev) {
  if (ev.key === 'Escape') {
    if (S.modal) { S.modal = null; renderModal(); }
    else if (S.chatOpen) { S.chatOpen = false; renderChat(); }
  }
}

function routeFromHash() {
  const hash = (location.hash || '').replace(/^#\/?/, '');
  const v = hash.split('?')[0];
  const eventMatch = v.match(/^event\/(.+)$/);
  if (eventMatch) {
    S.pendingEventId = decodeURIComponent(eventMatch[1]);
    S.view = 'home';
    // The modal is opened in refresh() once event data is available,
    // so deep links work even when the API is slower than the 200ms timer.
    return;
  }
  S.pendingEventId = null;
  S.view = ['home', 'saved', 'admin', 'about'].includes(v) ? v : 'home';
}

/* ------------------------------------------------------------ boot */
async function boot() {
  S.mode = await initApi();
  routeFromHash();
  if ('serviceWorker' in navigator && !isNative() && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  try { await refresh(); } catch (err) { console.error('[olp] bootstrap failed', err); }
  if (S.user && S.user.role === 'admin') await refreshSeries();
  resetChat();
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', () => { const prev = S.view; routeFromHash(); if (prev !== S.view) renderApp(); });
  $('#chat-fab').addEventListener('click', () => { S.chatOpen = !S.chatOpen; renderChat(); if (S.chatOpen) setTimeout(() => $('#chat-input').focus(), 60); });
  $('#chat-close').addEventListener('click', () => { S.chatOpen = false; renderChat(); });
  render();
}

boot();
