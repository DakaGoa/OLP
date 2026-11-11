/* Ask OLP - bilingual (EN / SR) natural language assistant.
   Understands date expressions in both languages, answers what's-on questions
   from the live calendar, and (for admins) turns plain sentences into
   add / change / cancel actions that must be confirmed. */
import {
  todayIso, isoOf, dateOf, addDays, longDate, formatTime, isUpcoming,
  categoryLabel, t, getLang, dayNames, monthNames, localized
} from './utils.js';

/* ---- bilingual word lookups -------------------------------------------- */
const MONTH_LOOKUP = {};
const MONTH_ALIASES = {
  en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  sr: ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar']
};
const MONTH_EXTRA = {
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, avg: 7, sep: 8, sept: 8, okt: 9, nov: 10, dec: 11,
  'januara': 0, 'februara': 1, 'marta': 2, 'aprila': 3, 'maja': 4, 'juna': 5, 'jula': 6, 'avgusta': 7,
  'septembra': 8, 'oktobra': 9, 'novembra': 10, 'decembra': 11
};
['en', 'sr'].forEach((l) => MONTH_ALIASES[l].forEach((m, i) => { MONTH_LOOKUP[m] = i; }));
Object.keys(MONTH_EXTRA).forEach((m) => { MONTH_LOOKUP[m] = MONTH_EXTRA[m]; });
['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'].forEach((m, i) => { MONTH_LOOKUP[m] = i; });

const DAY_LOOKUP = {};
const DAY_ALIASES = {
  en: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  sr: ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'cetvrtak', 'četvrtak', 'petak', 'subota']
};
const DAY_INDEX = { nedelja: 0, ponedeljak: 1, utorak: 2, sreda: 3, cetvrtak: 4, 'četvrtak': 4, petak: 5, subota: 6 };
DAY_ALIASES.en.forEach((d, i) => { DAY_LOOKUP[d] = i; DAY_LOOKUP[d.slice(0, 3)] = i; });
Object.keys(DAY_INDEX).forEach((d) => { DAY_LOOKUP[d] = DAY_INDEX[d]; });
Object.keys(DAY_INDEX).forEach((d) => { DAY_LOOKUP[d.slice(0, 3)] = DAY_INDEX[d]; });
DAY_LOOKUP.tues = 2; DAY_LOOKUP.thurs = 4; DAY_LOOKUP.weds = 3;
DAY_LOOKUP['čet'] = 4; DAY_LOOKUP['uto'] = 2; DAY_LOOKUP['sub'] = 6; DAY_LOOKUP['pet'] = 5;
DAY_LOOKUP['pon'] = 1; DAY_LOOKUP['sre'] = 3; DAY_LOOKUP['ned'] = 0;
DAY_LOOKUP['subotu'] = 6; DAY_LOOKUP['nedelju'] = 0; DAY_LOOKUP['sredu'] = 3;
DAY_LOOKUP['cetvrtak'] = 4; DAY_LOOKUP['cetvrtkom'] = 4; DAY_LOOKUP['petkom'] = 5;
DAY_LOOKUP['subotom'] = 6; DAY_LOOKUP['utorkom'] = 2; DAY_LOOKUP['ponedeljkom'] = 1;

const CAT_PATTERNS = [
  ['quiz', /\b(quiz|quizzes|trivia|pub quiz|quiz night|kviz|kviza|kvizom|kvizove)\b/i],
  ['live', /\b(live music|live band|band|gig|gigs|acoustic|open mic|singer|concert|music|svirk[aeiou]|muzik[aeu]|bend|koncert|akusticn[aeiou]|kantautor|pevac)\b/i],
  ['comedy', /\b(comedy|stand\s?-?up|comedian|laugh|komedij[aeiou]|komicar|standap|smeh)\b/i],
  ['dj', /\b(dj|disco|dance|club night|rave|decks|di-dzej|disko|ples|zurk[aeiou]|dens)\b/i],
  ['food', /\b(roast|food|tasting|dinner|kitchen|supper|cheese|brunch|pecenje|hran[aeiou]|degustacij[aeiou]|pivo|sir|rucak|kuhinj[aeiou])\b/i],
  ['special', /\b(masterclass|party|special|celebration|christmas|new year|festive|masterklas|specijal|proslav[aeiou]|bozic|nova godina|praznicn[aeiou])\b/i]
];

export function detectCategory(text) {
  const s = normalize(text);
  for (const [id, re] of CAT_PATTERNS) if (re.test(s)) return id;
  return null;
}
function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[ćč]/g, 'c').replace(/ž/g, 'z').replace(/š/g, 's').replace(/đ/g, 'd')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* ---- date + time parsing ------------------------------------------------ */
function makeDate(year, month, day) {
  const d = new Date(year, month, day, 12);
  if (d.getMonth() !== month) return null;
  return isoOf(d);
}
const MONTH_GEN = ['januara','februara','marta','aprila','maja','juna','jula','avgusta','septembra','oktobra','novembra','decembra'];
function dateScope(iso) {
  if (getLang() === 'sr') {
    const d = dateOf(iso);
    return 'u ' + dayNames()[d.getDay()].toLowerCase() + ', ' + d.getDate() + '. ' + MONTH_GEN[d.getMonth()];
  }
  return 'on ' + longDate(iso);
}
function labelToday() { return getLang() === 'sr' ? 'danas' : 'today'; }
function labelTomorrow() { return getLang() === 'sr' ? 'sutra' : 'tomorrow'; }

export function parseDateRange(text, now = new Date()) {
  const t = ' ' + normalize(text).replace(/[’']/g, '') + ' ';
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const today = isoOf(base);
  let m;

  m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const s = makeDate(+m[1], +m[2] - 1, +m[3]);
    if (s) return { start: s, end: s, label: dateScope(s) };
  }
  m = t.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](20\d{2}))?\b/);
  if (m) {
    const y = m[3] ? +m[3] : base.getFullYear();
    let s = makeDate(y, +m[2] - 1, +m[1]);
    if (s && !m[3] && s < today) s = makeDate(y + 1, +m[2] - 1, +m[1]);
    if (s) return { start: s, end: s, label: dateScope(s) };
  }

  const monthWord = Object.keys(MONTH_LOOKUP).sort((a, b) => b.length - a.length).join('|');
  m = t.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(?:of\\s+)?(' + monthWord + ')(?:\\s+(20\\d{2}))?\\b'));
  if (!m) {
    m = t.match(new RegExp('\\b(' + monthWord + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\.?(?:\\s+(20\\d{2}))?\\b'));
    if (m) m = [m[0], m[2], m[1], m[3]];
  }
  if (m) {
    const month = MONTH_LOOKUP[m[2]];
    if (month !== undefined) {
      const y = m[3] ? +m[3] : base.getFullYear();
      let s = makeDate(y, month, +m[1]);
      if (s && !m[3] && s < today) s = makeDate(y + 1, month, +m[1]);
      if (s) return { start: s, end: s, label: dateScope(s) };
    }
  }

  if (/\b(today|tonight|this evening|danas|veceras|večeras)\b/.test(t)) {
    return { start: today, end: today, label: labelToday() };
  }
  if (/\b(tomorrow|sutra)\b/.test(t)) {
    const s = addDays(today, 1);
    return { start: s, end: s, label: labelTomorrow() };
  }
  if (/\b(weekend|vikend|vikenda)\b/.test(t)) {
    const delta = (6 - base.getDay() + 7) % 7;
    const start = isoOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta, 12));
    return { start, end: addDays(start, 1), label: getLang() === 'sr' ? 'za vikend' : 'the weekend' };
  }
  if (/\b(sledece|sledeće|iduce|iduće|sljedece|next)\s+(nedelje|nedelju|sedmice|week)\b/.test(t)) {
    const toMonday = (8 - base.getDay()) % 7 || 7;
    const start = isoOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + toMonday, 12));
    return { start, end: addDays(start, 6), label: getLang() === 'sr' ? 'sledeće nedelje' : 'next week' };
  }
  if (/\b(ove|this)\s+(nedelje|sedmice|week)\b/.test(t) || /\b(ove nedelje|this week)\b/.test(t)) {
    const toSunday = (7 - base.getDay()) % 7;
    return { start: today, end: addDays(today, toSunday), label: getLang() === 'sr' ? 'do kraja ove nedelje' : 'the rest of this week' };
  }
  m = t.match(/\b(?:in|za)\s+(\d{1,2})\s+(?:days?|dana)\b/);
  if (m) {
    const s = addDays(today, +m[1]);
    return { start: s, end: s, label: dateScope(s) };
  }

  const dayRe = new RegExp('\\b(?:next|this|on|coming|u|u to|sledeci|sledeći|iduci|idući)?\\s*(' + Object.keys(DAY_LOOKUP).sort((a, b) => b.length - a.length).join('|') + ')\\b');
  m = t.match(dayRe);
  if (m && DAY_LOOKUP[m[1]] !== undefined) {
    const target = DAY_LOOKUP[m[1]];
    let delta = (target - base.getDay() + 7) % 7;
    if (delta === 0) delta = /\b(next|sledeci|iduci)\b/.test(t) ? 7 : 0;
    const start = isoOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta, 12));
    return { start, end: start, label: dateScope(start) };
  }
  return null;
}

export function extractTime(text) {
  const raw = String(text || '');
  let m = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(h|h\.|a\.?m\.?|p\.?m\.?|casova|časova)\b/i);
  if (!m) m = raw.match(/\b(?:at|from|starting|u|od|na)\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (!m) return null;
  let h = +m[1];
  const mins = m[2] ? +m[2] : 0;
  const suffix = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (suffix === 'pm' && h < 12) h += 12;
  if (suffix === 'am' && h === 12) h = 0;
  if (!suffix && h < 8) h += 12;
  if (h > 23 || mins > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

/* ---- event helpers ----------------------------------------------------- */
function quoted(text) {
  const m = text.match(/["'“„]([^"'”„]{3,90})["'”„]/);
  return m ? m[1].trim() : null;
}
function defaultTitle(cat) {
  if (getLang() === 'sr') {
    return { quiz: 'Kviz veče', live: 'Muzika uživo', comedy: 'Veče komedije', dj: 'DJ veče', food: 'Hrana i piće', special: 'Specijalni događaj' }[cat || 'special'];
  }
  return { quiz: 'Quiz Night', live: 'Live Music', comedy: 'Comedy Night', dj: 'DJ Night', food: 'Food & Drink', special: 'Special Event' }[cat || 'special'];
}
function describeEvent(e) {
  return '**' + localized(e, 'title') + '** — ' + categoryLabel(e.category) + ', ' + longDate(e.date) + ' ' + (getLang() === 'sr' ? 'u ' : 'at ') + formatTime(e.time) + (e.price ? ' · ' + localized(e, 'price') : '');
}
function matches(events, range, category) {
  let list = events.filter(isUpcoming);
  if (range) list = list.filter((e) => e.date >= range.start && e.date <= range.end);
  if (category) list = list.filter((e) => e.category === category);
  return list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
function chipsDefault() { return [t('chat.chip1'), t('chat.chip2'), t('chat.chip3')]; }

function findTarget(events, text, range, category) {
  const q = quoted(text);
  if (q) {
    const nq = normalize(q);
    const hit = events.filter(isUpcoming).filter((e) => normalize(localized(e, 'title')).includes(nq) || normalize(e.title).includes(nq));
    if (hit.length === 1) return { event: hit[0] };
    if (hit.length > 1) return { event: hit[0], relaxed: true };
  }
  const exact = matches(events, range, category);
  if (exact.length === 1) return { event: exact[0] };
  if (exact.length > 1) return { event: exact[0], relaxed: true };
  if (category) {
    const relaxed = matches(events, null, category);
    if (relaxed.length) return { event: relaxed[0], relaxed: true };
  }
  if (range) {
    const relaxed = matches(events, range, null);
    if (relaxed.length === 1) return { event: relaxed[0], relaxed: true };
  }
  return { event: null };
}

/* ---- admin command builders -------------------------------------------- */
function buildAdd(text, range, category, image) {
  const cat = category || 'special';
  const time = extractTime(text) || '20:00';
  const date = range ? range.start : addDays(todayIso(), 1);
  let title = quoted(text);
  if (!title) {
    const called = text.match(/\b(?:called|titled|named|zove|naziv|naziva)\s+([^,.!?]+?)(?=\s+(?:on|at|for|from|with|in|u|za|na)\b|[.!?]|$)/i);
    if (called) title = called[1].trim();
  }
  const titleOut = (title || defaultTitle(cat)).slice(0, 120);
  const descMatch = text.match(/\b(?:description|details|about|opis|detalji)\s*[::]\s*(.+)$/i);
  const priceMatch = text.match(/(?:£\s?(\d+(?:[.,]\d{1,3})?)|(\d+(?:[.,]\d{1,3})?)\s*(?:RSD|din|dinara))/i);
  const images = {
    quiz: 'assets/img/quiz.jpg', live: 'assets/img/live.jpg', comedy: 'assets/img/crowd.jpg',
    dj: 'assets/img/stage.jpg', food: 'assets/img/food.jpg', special: 'assets/img/drinks.jpg'
  };
  const description = descMatch ? descMatch[1].trim() : t('ai.addDefaultDesc');
  const amount = priceMatch ? (priceMatch[1] || priceMatch[2] || '') : '';
  const price = amount ? amount + ' RSD' : (getLang() === 'sr' ? 'Ulaz slobodan' : 'Free entry');
  return {
    text: t('ai.addDraft'), chips: [t('chat.chip1')],
    action: {
      type: 'add',
      label: t('ai.addLabel', { title: titleOut, date: longDate(date), time: formatTime(time) }) + (image ? t('ai.coverNote') : ''),
      payload: {
        title: titleOut, titleSr: titleOut, category: cat, date, time, endTime: '',
        description, descriptionSr: description,
        price, priceSr: price,
        image: image || images[cat], featured: false, recurring: null
      }
    }
  };
}

function buildUpdate(text, range, category, events, image) {
  const target = findTarget(events, text, range, category);
  if (!target.event) return { text: t('ai.updateNotFound'), chips: [t('chat.chip1')] };
  const e = target.event;
  const patch = {};
  const labelBits = [];
  const n = normalize(text);

  const rename = text.match(/\b(?:rename|call it|retitle|preimenuj|nazovi|zovi)\s+(?:it|the event|ga|dogadjaj|događaj)?\s*(?:to|as|u|na)?\s*["'“„]?([^"'”„!,]+)["'”„!]?/i);
  if (rename && rename[1].trim().length > 2) {
    const v = rename[1].trim().slice(0, 120);
    patch.title = v; patch.titleSr = v;
    labelBits.push(t('ai.changeTitle', { value: v }));
  }

  const newTimeMatch = text.match(/\b(?:to|at|until|na|u)\s+(\d{1,2}(?::\d{2})?\s*(?:h|časova|a\.?m\.?|p\.?m\.?)?)\b/i);
  if (newTimeMatch) {
    const nt = extractTime('at ' + newTimeMatch[1]);
    if (nt && nt !== e.time) { patch.time = nt; labelBits.push(t('ai.changeTime', { value: formatTime(nt) })); }
  }

  const moveMatch = n.match(/\b(?:move|reschedule|shift|pomeri|prebaci|premesti)\b[\s\S]*?\b(?:to|na|za)\s+(.+)$/i);
  if (moveMatch) {
    const r2 = parseDateRange('to ' + moveMatch[1]);
    if (r2 && r2.start !== e.date) { patch.date = r2.start; labelBits.push(t('ai.changeDate', { value: longDate(r2.start) })); }
  }

  const descMatch = text.match(/\b(?:description|details|about|opis|detalji)\s*[::]\s*(.+)$/i);
  if (descMatch) { patch.description = descMatch[1].trim(); patch.descriptionSr = descMatch[1].trim(); labelBits.push(t('ai.changeDesc')); }

  if (image) { patch.image = image; labelBits.push(t('ai.changeCover')); }

  if (!Object.keys(patch).length) {
    return { text: t('ai.updateNoChange', { title: localized(e, 'title'), date: longDate(e.date) }), events: [e] };
  }
  return {
    text: (target.relaxed ? t('ai.updateRelaxed') : '') + t('ai.updateIntro', { desc: describeEvent(e) }),
    events: [e], chips: [t('chat.chip1')],
    action: { type: 'update', id: e.id, payload: patch, label: t('ai.updateLabel', { title: localized(e, 'title'), changes: labelBits.join(', ') }) }
  };
}

function buildDelete(text, range, category, events) {
  const target = findTarget(events, text, range, category);
  if (!target.event) return { text: t('ai.deleteNotFound'), chips: [t('chat.chip1')] };
  const e = target.event;
  return {
    text: t('ai.deleteIntro', { desc: describeEvent(e) }),
    events: [e], chips: [t('chat.chip1')],
    action: { type: 'delete', id: e.id, label: t('ai.deleteLabel', { title: localized(e, 'title'), date: longDate(e.date) }) }
  };
}

/* ---- general pub info --------------------------------------------------- */
function generalAnswer(text, ctx) {
  const n = normalize(text);
  const s = ctx.settings || {};
  if (/\b(opening hours|opening times|hours|radno vreme|radno vrijeme|kada radite)\b/.test(n)) {
    return { text: t('ai.hours', { hours: localized(s, 'hours') || s.hours || '' }), chips: chipsDefault() };
  }
  if (/\b(where|address|located|location|find you|directions|gde|gdje|adresa|adresu|nalazite|maps)\b/.test(n)) {
    return { text: t('ai.address', { address: s.address || 'Gavrila Principa 46, Belgrade, Serbia' }), chips: chipsDefault() };
  }
  if (/\b(instagram|social|follow|facebook|instagramu)\b/.test(n)) {
    return { text: t('ai.instagram', { url: s.instagram || '' }), chips: chipsDefault() };
  }
  if (/\b(contact|email|phone|book|reserve|table|kontakt|mejl|telefon|rezerv)\b/.test(n)) {
    return { text: t('ai.contact', { email: s.email || '', phone: s.phone ? ' / ' + s.phone : '' }), chips: chipsDefault() };
  }
  if (/\b(notify|notification|reminder|save|bookmark|account|podsetni|obavestenj|sačuv|sacuv|nalog)\b/.test(n)) {
    return { text: t('ai.notify'), chips: chipsDefault() };
  }
  if (/\b(help|what can you do|how do i|pomoc|pomoć|sta umes|šta umeš|kako da)\b/.test(n)) {
    return { text: t('ai.help') + (ctx.isAdmin ? t('ai.helpAdmin') : ''), chips: chipsDefault() };
  }
  return { text: t('ai.fallback') + (ctx.isAdmin ? t('ai.fallbackAdmin') : ''), chips: chipsDefault() };
}

/* ---- main entry --------------------------------------------------------- */
export function respond(message, ctx) {
  const text = String(message || '').trim();
  if (!text && !ctx.image) return { text: t('ai.empty'), chips: chipsDefault() };
  const n = normalize(text);
  const range = parseDateRange(text);
  const category = detectCategory(text);
  const isAdmin = !!ctx.isAdmin;

  const mutation = /\b(add|create|schedule|put on|new event|set up|organise|organize|dodaj|dodati|napravi|napraviti|zakazi|zakaži|zakakaži|organizuj|novi dogadjaj|novi događaj)\b/.test(n) ? 'add'
    : /\b(change|update|edit|move|reschedule|shift|rename|retitle|set the time|make it|promeni|izmeni|pomeri|prebaci|preimenuj|azuriraj|azuriraj|podesi)\b/.test(n) ? 'update'
      : /\b(cancel|delete|remove|call off|scrap|drop|otkazi|otkaži|obrisi|obriši|ukloni|izbrisi|izbriši|ponisti|poništi)\b/.test(n) ? 'delete' : null;

  if (mutation && !isAdmin) {
    return { text: t('ai.adminOnly'), chips: [t('chat.chip1'), t('chat.chip2')] };
  }
  if (mutation === 'add' && isAdmin) return buildAdd(text, range, category, ctx.image);
  if (mutation === 'update' && isAdmin) return buildUpdate(text, range, category, ctx.events || [], ctx.image);
  if (mutation === 'delete' && isAdmin) return buildDelete(text, range, category, ctx.events || []);
  if (ctx.image) return { text: isAdmin ? t('ai.imageHint') : t('ai.imageNoAdmin'), chips: isAdmin ? [t('chat.chip1')] : chipsDefault() };

  const generalIntent = /\b(opening hours|opening times|hours|address|located|location|directions|contact|email|phone|instagram|follow us|social|notifications?|reminders?|bookmarks?|save an event|help|what can you do|how do i|where are you|where is the pub|find you|radno vreme|adres[aeiu]|gde se nalazite|kontakt|mejl|telefon|podsetni|obavestenj|pomoc|sta umes|kako da|maps)\b/.test(n);
  if (generalIntent) return generalAnswer(text, ctx);

  const isQuestion = /\b(what|when|where|which|who|how|is there|are there|any|anything|show|list|tell|happening|going on|on at|next|sta|šta|kada|kad|gde|da li|ima li|koji|koje|pokaži|pokazi|prikazi|prikaži|reci|sledeci|sledeći|program)\b/.test(n) || text.includes('?') || /\bwhats on\b/.test(n) || /\bsta ima\b/.test(n);
  if (isQuestion || range || category) {
    const list = matches(ctx.events || [], range, category);
    const scope = range ? t('ai.scopeOn', { label: range.label }) : '';
    const cat = (categoryLabel(category) || '').toLowerCase();

    if (range && category) {
      if (!list.length) {
        return { text: t('ai.rangeCatEmpty', { cat, scope }), events: matches(ctx.events || [], null, null).slice(0, 3), chips: [t('chat.chip1')] };
      }
      return { text: t('ai.rangeCat', { scope }), events: list, chips: [t('chat.chip1')] };
    }
    if (range) {
      if (!list.length) {
        return { text: t('ai.rangeEmpty', { scope }), events: matches(ctx.events || [], null, null).slice(0, 3), chips: [t('chat.chip1'), t('chat.chip2')] };
      }
      return { text: t('ai.range', { scope }), events: list, chips: [t('chat.chip1')] };
    }
    if (category) {
      const singular = /\b(next|upcoming|sledeci|sledeće|sledeci)\s+(quiz|trivia|kviz|live|music|gig|band|svirk|comedy|komedij|roast|dj|special|event|događaj)\b/.test(n);
      const next = list.slice(0, singular ? 1 : 3);
      if (!next.length) return { text: t('ai.nextNone', { cat }), chips: chipsDefault() };
      return { text: t(singular ? 'ai.nextOne' : 'ai.nextMany', { cat }), events: next, chips: [t('chat.chip1')] };
    }
    return { text: t('ai.upcoming'), events: matches(ctx.events || [], null, null).slice(0, 4), chips: chipsDefault() };
  }
  return generalAnswer(text, ctx);
}
