/* Generates the pub monogram PNG icons with zero dependencies. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, pixels) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) pixels.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
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

function draw(size, transparent) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const bg = [22, 19, 16];      // #161310
  const gold = [217, 164, 78];  // #d9a44e
  const cream = [247, 240, 228];
  const c = size / 2;
  const radius = size * 0.40;
  const ring = Math.max(2, size * 0.015);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      let color = bg, alpha = transparent ? 0 : 255;
      if (Math.abs(d - radius) < ring) { color = gold; alpha = 255; }
      if (d < radius - ring && !transparent) { color = bg; alpha = 255; }
      set(x, y, color[0], color[1], color[2], alpha);
    }
  }

  const cell = size * 0.033;
  const gw = 5 * cell, gap = cell * 0.9;
  const totalW = 3 * gw + 2 * gap;
  const totalH = 7 * cell;
  const startX = c - totalW / 2, startY = c - totalH / 2;
  const word = 'OLP';
  for (let k = 0; k < word.length; k++) {
    const g = GLYPHS[word[k]];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] !== '1') continue;
        const x0 = startX + k * (gw + gap) + col * cell;
        const y0 = startY + row * cell;
        for (let y = Math.floor(y0); y < Math.ceil(y0 + cell); y++) {
          for (let x = Math.floor(x0); x < Math.ceil(x0 + cell); x++) set(x, y, cream[0], cream[1], cream[2], 255);
        }
      }
    }
  }
  // small underline
  const lineY = startY + totalH + cell * 0.9;
  const lineW = totalW * 0.42;
  for (let y = Math.floor(lineY); y < Math.ceil(lineY + Math.max(1, cell * 0.12)); y++) {
    for (let x = Math.floor(c - lineW / 2); x < Math.ceil(c + lineW / 2); x++) set(x, y, gold[0], gold[1], gold[2], 255);
  }
  return encodePng(size, size, buf);
}

const outDir = process.argv[2] || path.join(__dirname, '..', 'www', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });
[192, 512].forEach((size) => {
  fs.writeFileSync(path.join(outDir, 'icon-' + size + '.png'), draw(size, false));
  console.log('wrote icon-' + size + '.png');
});
fs.writeFileSync(path.join(outDir, 'icon-foreground-512.png'), draw(512, true));
console.log('wrote icon-foreground-512.png');
