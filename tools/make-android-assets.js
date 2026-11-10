/* Brands the native Android project: launcher icons, adaptive foreground,
   splash screens, notification small icon and theme colors. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, c]);
}
function png(w, h, px) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

const GLYPHS = {
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  P: ['11110','10001','10001','11110','10000','10000','10000']
};
const BG = [22, 19, 16];
const DARK = [16, 14, 12];
const GOLD = [217, 164, 78];
const CREAM = [247, 240, 228];

function pixel(px, w, h, x, y, rgb, a) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = a === undefined ? 255 : a;
}

/* Square monogram icon. mode: 'solid' | 'transparent' | 'mono' */
function icon(size, mode) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const ringRatio = mode === 'transparent' ? 0.27 : 0.40;
  const radius = size * ringRatio;
  const thickness = Math.max(1.5, size * 0.016);
  const transparent = mode !== 'solid';
  const ringColor = mode === 'mono' ? [255, 255, 255] : GOLD;
  const textColor = mode === 'mono' ? [255, 255, 255] : CREAM;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (transparent) pixel(px, size, size, x, y, DARK, 0);
      else pixel(px, size, size, x, y, BG, 255);
      if (Math.abs(d - radius) < thickness) pixel(px, size, size, x, y, ringColor, 255);
    }
  }
  const cell = size * (mode === 'transparent' ? 0.026 : 0.033);
  const gw = 5 * cell, gap = cell * 0.9;
  const totalW = 3 * gw + 2 * gap, totalH = 7 * cell;
  const sx = c - totalW / 2, sy = c - totalH / 2;
  'OLP'.split('').forEach((ch, k) => {
    const g = GLYPHS[ch];
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) {
      if (g[r][col] !== '1') continue;
      const x0 = sx + k * (gw + gap) + col * cell, y0 = sy + r * cell;
      for (let y = Math.floor(y0); y < Math.ceil(y0 + cell); y++)
        for (let x = Math.floor(x0); x < Math.ceil(x0 + cell); x++) pixel(px, size, size, x, y, textColor, 255);
    }
  });
  const lineY = sy + totalH + cell * 0.9, lineW = totalW * 0.42;
  for (let y = Math.floor(lineY); y < Math.ceil(lineY + Math.max(1, cell * 0.12)); y++)
    for (let x = Math.floor(c - lineW / 2); x < Math.ceil(c + lineW / 2); x++) pixel(px, size, size, x, y, ringColor, 255);
  return px;
}

function splash(w, h) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixel(px, w, h, x, y, DARK, 255);
  const size = Math.round(Math.min(w, h) * 0.46);
  const src = icon(size, 'splash');
  const ox = Math.round((w - size) / 2), oy = Math.round((h - size) / 2);
  for (let y = 0; y < size; y++) {
    src.copy(px, ((oy + y) * w + ox) * 4, y * size * 4, (y + 1) * size * 4);
  }
  return px;
}

function writePng(rel, w, h, px) {
  const file = path.join(RES, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(w, h, px));
}

const DENSITIES = [
  { dir: 'mipmap-mdpi', launcher: 48, foreground: 108, stat: 24, splashPort: [320, 480], splashLand: [480, 320] },
  { dir: 'mipmap-hdpi', launcher: 72, foreground: 162, stat: 36, splashPort: [480, 800], splashLand: [800, 480] },
  { dir: 'mipmap-xhdpi', launcher: 96, foreground: 216, stat: 48, splashPort: [720, 1280], splashLand: [1280, 720] },
  { dir: 'mipmap-xxhdpi', launcher: 144, foreground: 324, stat: 72, splashPort: [960, 1600], splashLand: [1600, 960] },
  { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432, stat: 96, splashPort: [1440, 2560], splashLand: [2560, 1440] }
];

DENSITIES.forEach((d) => {
  writePng(path.join(d.dir, 'ic_launcher.png'), d.launcher, d.launcher, icon(d.launcher, 'solid'));
  writePng(path.join(d.dir, 'ic_launcher_round.png'), d.launcher, d.launcher, icon(d.launcher, 'solid'));
  writePng(path.join(d.dir, 'ic_launcher_foreground.png'), d.foreground, d.foreground, icon(d.foreground, 'transparent'));
  const statDir = d.dir.replace('mipmap-', 'drawable-');
  writePng(path.join(statDir, 'ic_stat_icon.png'), d.stat, d.stat, icon(d.stat, 'mono'));
  writePng(path.join('drawable-port-' + statDir.split('-').pop(), 'splash.png'), d.splashPort[0], d.splashPort[1], splash(d.splashPort[0], d.splashPort[1]));
  writePng(path.join('drawable-land-' + statDir.split('-').pop(), 'splash.png'), d.splashLand[0], d.splashLand[1], splash(d.splashLand[0], d.splashLand[1]));
});
writePng(path.join('drawable', 'splash.png'), 480, 320, splash(480, 320));

fs.writeFileSync(path.join(RES, 'values', 'colors.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#161310</color>
    <color name="colorPrimaryDark">#100e0c</color>
    <color name="colorAccent">#d9a44e</color>
</resources>
`);
fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#161310</color>
</resources>
`);
console.log('Branded Android icons, splash screens, notification icon and colors written.');
