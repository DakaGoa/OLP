/* Real Web Push delivery for the Old London Pub backend.
   Primary path: the canonical `web-push` library (correct VAPID + aes128gcm
   payload encryption, identical to what every browser expects). It is optional:
   if it is not installed we fall back to a dependency-free empty-body push
   (still a real, delivered notification — the service worker shows a default
   message when there is no payload).

   Runs only inside Node (server.js requires this file); the browser never
   loads it. */
'use strict';
const crypto = require('crypto');
const https = require('https');

const DEFAULT_EMAIL = 'hello@olp.example';

/* ---- base64url helpers ---- */
function bufToB64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/* 65-byte uncompressed point from a P-256 public KeyObject. */
function rawPublicKey(keyObj) {
  const jwk = keyObj.export({ format: 'jwk' });
  return Buffer.concat([Buffer.from([0x04]), b64urlToBuf(jwk.x), b64urlToBuf(jwk.y)]);
}

/* Ensure a VAPID key pair exists in the data store.
   publicKey  = base64url uncompressed point (what the browser needs as
                applicationServerKey).
   privateKey = base64url of the PKCS8 DER (what Node needs to rebuild a
                KeyObject; the web-push scalar `d` is derived from it). */
function ensureVapid(db) {
  if (db.vapid && db.vapid.publicKey && db.vapid.privateKey) {
    return {
      publicKey: db.vapid.publicKey,
      privateKey: db.vapid.privateKey,
      email: db.vapid.email || DEFAULT_EMAIL
    };
  }
  const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  db.vapid = {
    publicKey: bufToB64url(rawPublicKey(kp.publicKey)),
    privateKey: bufToB64url(kp.privateKey.export({ type: 'pkcs8', format: 'der' })),
    email: DEFAULT_EMAIL
  };
  return { publicKey: db.vapid.publicKey, privateKey: db.vapid.privateKey, email: db.vapid.email };
}

/* Rebuild the private KeyObject from the stored DER. */
function getKeyObject(vapid) {
  return crypto.createPrivateKey({ key: b64urlToBuf(vapid.privateKey), format: 'der', type: 'pkcs8' });
}

/* VAPID JWT (ES256) for a push endpoint origin. */
function makeVapidToken(keyObj, origin, email) {
  const header = bufToB64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = bufToB64url(Buffer.from(JSON.stringify({
    aud: origin, exp: now + 12 * 3600, sub: 'mailto:' + email
  })));
  const signingInput = header + '.' + payload;
  const sig = crypto.createSign('SHA256').update(signingInput)
    .sign({ key: keyObj, dsaEncoding: 'ieee-p1363' });
  return signingInput + '.' + bufToB64url(sig);
}

/* Dependency-free fallback: send an empty-body push (no payload). The browser
   still receives the push event; the service worker shows a default notice. */
function sendEmpty(subscription, vapidObj) {
  return new Promise((resolve) => {
    try {
      const endpoint = subscription.endpoint;
      if (!/^https:\/\//.test(endpoint)) return resolve({ ok: false, status: 0, error: 'bad endpoint' });
      const origin = new URL(endpoint).origin;
      const token = makeVapidToken(vapidObj.keyObject, origin, vapidObj.email);
      const u = new URL(endpoint);
      const req = https.request({
        hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
        headers: { 'Authorization': 'vapid t=' + token + ', k=' + vapidObj.publicKey, 'TTL': '86400', 'Urgency': 'normal' }
      }, (res) => {
        let d = ''; res.on('data', (c) => { d += c; });
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
      });
      req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
      req.end();
    } catch (e) { resolve({ ok: false, status: 0, error: e.message }); }
  });
}

/* Lazily load `web-push` and configure VAPID once. Returns the lib or null. */
let _lib = undefined; // undefined = not yet attempted
function getLib(vapidObj) {
  if (_lib !== undefined) return _lib;
  try {
    const wp = require('web-push');
    const d = vapidObj.keyObject.export({ format: 'jwk' }).d; // scalar web-push expects
    wp.setVapidDetails('mailto:' + vapidObj.email, vapidObj.publicKey, d);
    _lib = wp;
  } catch (_) {
    _lib = null;
  }
  return _lib;
}

/* Send one push. Uses web-push when available so the custom message text is
   delivered; otherwise falls back to an empty-body push. */
function sendToOne(subscription, payload, vapidObj) {
  const lib = getLib(vapidObj);
  if (lib) {
    return lib.sendNotification(subscription, JSON.stringify(payload))
      .then(() => ({ ok: true, status: 201 }))
      .catch((err) => ({ ok: false, status: err && err.statusCode ? err.statusCode : 0, error: err && err.message }));
  }
  return sendEmpty(subscription, vapidObj);
}

/* Broadcast a message to every stored subscription. */
async function broadcast(db, message, opts) {
  opts = opts || {};
  const base = ensureVapid(db);
  const vapidObj = { publicKey: base.publicKey, keyObject: getKeyObject(base), email: base.email };
  const payload = {
    title: opts.title || 'Old London Pub',
    body: String(message || ''),
    url: opts.url || '/',
    tag: opts.tag || 'olp-broadcast'
  };
  const results = [];
  for (const sub of db.subscriptions || []) {
    const r = await sendToOne(sub, payload, vapidObj);
    results.push({ endpoint: (sub.endpoint || '').slice(0, 40) + '…', ok: !!r.ok, status: r.status, error: r.error });
  }
  const sent = results.filter((r) => r.ok).length;
  return { sent, failed: results.length - sent, total: results.length, results };
}

/* Lightweight self-test (no network): VAPID key gen + JWT sign/verify. */
function selfTest() {
  const steps = [];
  try {
    const db = {};
    const base = ensureVapid(db);
    const keyObj = getKeyObject(base);
    steps.push({ step: 'ensureVapid', ok: !!(base.publicKey && base.privateKey), publicKey: base.publicKey.slice(0, 12) + '…' });
    const origin = 'https://fcm.googleapis.com';
    const token = makeVapidToken(keyObj, origin, base.email);
    const [h, p, s] = token.split('.');
    const okSig = crypto.createVerify('SHA256').update(h + '.' + p)
      .verify({ key: keyObj, dsaEncoding: 'ieee-p1363' }, b64urlToBuf(s));
    const claims = JSON.parse(Buffer.from(b64urlToBuf(p)).toString('utf8'));
    steps.push({ step: 'vapid JWT sign/verify', ok: okSig && claims.aud === origin, aud: claims.aud });
    steps.push({ step: 'web-push available', ok: getLib({ keyObject: keyObj, publicKey: base.publicKey, email: base.email }) !== null });
    return { ok: steps.every((s) => s.ok), steps };
  } catch (e) {
    steps.push({ step: 'exception', ok: false, error: e.message });
    return { ok: false, steps };
  }
}

module.exports = { ensureVapid, makeVapidToken, sendToOne, broadcast, selfTest };
