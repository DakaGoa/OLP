/* Old London Pub - optional shared-mode HTTP server.
   Serves the static app and exposes the same domain core as /api/*.
   No dependencies: plain Node http + a JSON file for persistence. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createCore } = require('./js/core.js');
const SEED = require('./js/seed.js');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'olp-data.json');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.ics': 'text/calendar; charset=utf-8'
};

/* The hosted runtime may serve requests from more than one process, so the
   source of truth is always the data file. Each request gets a fresh core. */
let fallback = null;
function storageForRequest() {
  return {
    read() {
      try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      } catch (err) { console.error('[olp] could not read data file:', err.message); }
      return fallback;
    },
    write(db) {
      fallback = db;
      try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); }
      catch (err) { console.error('[olp] data kept in memory only:', err.message); }
      return Promise.resolve();
    }
  };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-OLP-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, payload) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 200000) req.destroy(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve({}); }
    });
  });
}

async function handleApi(req, res, urlPath) {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }
  const method = req.method.toUpperCase();
  const routePath = urlPath.replace(/^\/api/, '') || '/';
  const body = method === 'GET' ? {} : await readBody(req);
  const auth = req.headers.authorization || '';
  const token = String(req.headers['x-olp-token'] || auth.replace(/^Bearer\s+/i, '')).trim();
  try {
    const result = await createCore(storageForRequest(), SEED).route(method, routePath, body, token);
    sendJson(res, result.status, result.data);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[olp] request error:', err.message);
    sendJson(res, status, { error: err.message || 'Something went wrong.' });
  }
}

/* Generate a server-rendered HTML shell with OG meta for share links. */
async function serveSharePage(req, res, eventId) {
  try {
    const core = createCore(storageForRequest(), SEED);
    const db = await core.load();
    const ev = db.events.find(function (e) { return e.id === decodeURIComponent(eventId); });
    if (!ev) { res.writeHead(404); res.end('Not found'); return; }
    const title = (ev.title || 'Old London Pub') + ' — Old London Pub';
    var desc = (ev.description || '').slice(0, 160);
    var dateParts = String(ev.date).split('-');
    var dStr = dateParts[2] + '.' + dateParts[1] + '.' + dateParts[0];
    var url = 'https://' + (req.headers.host || 'oldlondonpub.example') + '/event/' + encodeURIComponent(ev.id);
    var img = ev.image || 'assets/img/hero.jpg';
    if (img.indexOf('http') !== 0) img = 'https://' + (req.headers.host || 'oldlondonpub.example') + '/' + img.replace(/^\//, '');
    var html = '<!doctype html><html lang="en"><head>' +
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escXml(title) + '</title>' +
      '<meta name="description" content="' + escXml(desc) + '">' +
      '<meta property="og:title" content="' + escXml(title) + '">' +
      '<meta property="og:description" content="' + escXml(desc) + '">' +
      '<meta property="og:type" content="article">' +
      '<meta property="og:url" content="' + escXml(url) + '">' +
      '<meta property="og:image" content="' + escXml(img) + '">' +
      '<meta property="og:site_name" content="Old London Pub">' +
      '<meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + escXml(title) + '">' +
      '<meta name="twitter:description" content="' + escXml(desc) + '">' +
      '<meta name="twitter:image" content="' + escXml(img) + '">' +
      '<meta name="theme-color" content="#12100e">' +
      '<link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">' +
      '<link rel="stylesheet" href="css/styles.css">' +
      '<style>body{margin:0;background:#100e0c;color:#f7f0e4;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}' +
      '.share-card{max-width:520px;padding:40px;text-align:center}' +
      '.share-card h1{font-family:Georgia,serif;font-size:1.8rem;margin:0 0 12px;color:#f2ca7c}' +
      '.share-card p{color:#a79c8c;font-size:.95rem;line-height:1.6;margin:0 0 20px}' +
      '.share-card a{display:inline-block;padding:14px 28px;border-radius:100px;background:#d9a44e;color:#1b1307;text-decoration:none;font-weight:700}</style>' +
      '</head><body><div class="share-card">' +
      '<h1>' + escXml(ev.title || 'Old London Pub') + '</h1>' +
      '<p>' + escXml(dStr + ' at ' + (ev.time || '20:00') + ' · ' + (ev.price || 'Free entry')) + '</p>' +
      '<p>' + escXml(desc) + '</p>' +
      '<a href="/#' + escXml('/event/' + encodeURIComponent(ev.id)) + '">Open in Old London Pub</a>' +
      '</div></body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  } catch (err) {
    res.writeHead(500); res.end('Server error');
  }
}

function escXml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* Generate a subscribable iCal feed of all upcoming events. */
async function serveCalendar(req, res) {
  try {
    const core = createCore(storageForRequest(), SEED);
    const db = await core.load();
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var events = db.events.filter(function (e) { return e.date >= todayStr; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Old London Pub//Happenings//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Old London Pub', 'X-WR-TIMEZONE:Europe/Belgrade'];
    events.forEach(function (e) {
      var start = new Date(e.date.slice(0, 4), +e.date.slice(5, 7) - 1, +e.date.slice(8, 10), +(e.time || '20:00').slice(0, 2), +(e.time || '20:00').slice(3, 5));
      var end = e.endTime ? new Date(e.date.slice(0, 4), +e.date.slice(5, 7) - 1, +e.date.slice(8, 10), +e.endTime.slice(0, 2), +e.endTime.slice(3, 5)) : new Date(start.getTime() + 2 * 3600 * 1000);
      function fmt(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '00'; }
      function esc(s) { return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
      lines.push('BEGIN:VEVENT', 'UID:' + e.id + '@oldlondonpub', 'DTSTAMP:' + fmt(new Date()) + 'Z', 'DTSTART:' + fmt(start), 'DTEND:' + fmt(end), 'SUMMARY:' + esc(e.title), 'DESCRIPTION:' + esc(e.description), 'LOCATION:' + esc(db.settings.address || 'Old London Pub'), 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var body = lines.join('\r\n');
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="old-london-pub.ics"',
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500); res.end('Server error');
  }
}

/* Serve the APK for direct download. */
function serveApk(req, res) {
  var apkPath = path.resolve(ROOT, '..', 'Old-London-Pub.apk');
  fs.stat(apkPath, function (err, stat) {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('APK not found'); return; }
    cors(res);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename="Old-London-Pub.apk"',
      'Cache-Control': 'public, max-age=3600'
    });
    fs.createReadStream(apkPath).pipe(res);
  });
}

function serveStatic(req, res, urlPath) {
  var m;
  if (m = urlPath.match(/^\/event\/(.+)$/)) { serveSharePage(req, res, m[1]); return; }
  if (urlPath === '/calendar.ics') { serveCalendar(req, res); return; }
  if (urlPath === '/app/old-london-pub.apk') { serveApk(req, res); return; }
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  // Never expose the data store, server source or hidden files.
  const blocked = /(^|\/)(olp-data\.json|server\.js|package\.json|\.[^/]+)$/i;
  if (blocked.test(rel)) { res.writeHead(404); res.end('Not found'); return; }
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      // Extensionless paths are client-side routes.
      if (!path.extname(rel)) {
        fs.readFile(path.join(ROOT, 'index.html'), (e2, buf) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(buf);
        });
        return;
      }
      res.writeHead(404); res.end('Not found'); return;
    }
    cors(res);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/api' || urlPath.indexOf('/api/') === 0) {
    handleApi(req, res, urlPath).catch((e) => sendJson(res, 500, { error: e.message }));
  } else {
    serveStatic(req, res, urlPath);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[olp] Old London Pub running on port ' + PORT);
});
