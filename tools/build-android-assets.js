/* Builds the offline asset bundle that ships inside the Android APK.
   The WebView loads these files locally, while the data layer talks to the
   published site's API when a connection is available. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'www');
const DEST = path.join(ROOT, 'android-web');

const PUBLIC_URL = 'https://wbapp-k9y3ipkfv2f93l5jh5drzn.apps.workbuddy.host';
const SHARE_QUERY = '?sharecode=EEHZRXK5IQ';

const SKIP = new Set(['server.js', 'package.json', 'olp-data.json', 'package-lock.json']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (SKIP.has(name)) continue;
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
copyDir(SRC, DEST);

const cfgPath = path.join(DEST, 'js', 'config.js');
let cfg = fs.readFileSync(cfgPath, 'utf8');
cfg = cfg.replace('__PUBLISHED_URL__', PUBLIC_URL).replace('__SHARE_QUERY__', SHARE_QUERY);
fs.writeFileSync(cfgPath, cfg);

const htmlPath = path.join(DEST, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace('<script src="js/seed.js"></script>',
  '<script>window.OLP_NATIVE = true;</script>\n  <script src="js/seed.js"></script>');
fs.writeFileSync(htmlPath, html);

const count = (() => {
  let n = 0;
  const walk = (d) => fs.readdirSync(d).forEach((f) => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p); else n++;
  });
  walk(DEST); return n;
})();
console.log('Android web bundle ready: ' + count + ' files at ' + DEST);
console.log('Shared API: ' + PUBLIC_URL + SHARE_QUERY);
