/* Old London Pub - shared domain core.
   The exact same logic runs in the browser (offline / device-local mode)
   and inside the Node API (shared mode). No framework, no dependencies. */
(function (root) {
  'use strict';

  function fail(status, message) {
    var e = new Error(message);
    e.status = status;
    return e;
  }

  function uid(prefix) {
    var c = root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (c && typeof c.randomUUID === 'function') return prefix + c.randomUUID().replace(/-/g, '').slice(0, 16);
    return prefix + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async function hashPassword(password, salt) {
    var input = 'olp::' + salt + '::' + password;
    var c = root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (c && c.subtle && typeof c.subtle.digest === 'function') {
      var bytes = new TextEncoder().encode(input);
      var buf = await c.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    }
    if (typeof require === 'function') {
      try { return require('crypto').createHash('sha256').update(input).digest('hex'); } catch (_) { /* fall through */ }
    }
    var h = 2166136261;
    for (var i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'fnv' + (h >>> 0).toString(16);
  }

  function publicUser(u) {
    if (!u) return null;
    return {
      id: u.id, username: u.username, name: u.name || u.username,
      email: u.email || '', role: u.role, notify: u.notify !== false,
      createdAt: u.createdAt
    };
  }

  function cleanEvent(input, existing) {
    var e = existing ? Object.assign({}, existing) : {};
    var allowed = ['title', 'titleSr', 'category', 'date', 'time', 'endTime', 'description', 'descriptionSr', 'image', 'price', 'priceSr', 'featured', 'recurring', 'seriesId'];
    allowed.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(input, k)) e[k] = input[k];
    });
    if (!e.title || !String(e.title).trim()) throw fail(400, 'An event needs a title.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) throw fail(400, 'Event date must be YYYY-MM-DD.');
    if (!/^\d{2}:\d{2}$/.test(e.time || '')) throw fail(400, 'Event time must be HH:MM.');
    e.title = String(e.title).trim().slice(0, 120);
    e.category = String(e.category || 'special').toLowerCase().trim();
    if (['quiz', 'live', 'comedy', 'dj', 'food', 'special'].indexOf(e.category) === -1) e.category = 'special';
    e.description = String(e.description || '').slice(0, 1200);
    e.image = String(e.image || 'assets/img/hero.jpg');
    e.price = String(e.price || 'Free entry');
    e.featured = !!e.featured;
    e.endTime = e.endTime || '';
    e.recurring = e.recurring || null;
    e.updatedAt = new Date().toISOString();
    if (!existing) {
      e.id = uid('ev_');
      e.createdAt = new Date().toISOString();
    }
    return e;
  }

  function isFuture(e) {
    var p = String(e.date).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2], 12);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return d.getTime() >= now.getTime();
  }

  function advanceDate(iso, steps, freq) {
    var p = String(iso).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2], 12);
    if (freq === 'monthly') d.setMonth(d.getMonth() + steps);
    else d.setDate(d.getDate() + steps * (freq === 'biweekly' ? 14 : 7));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function createCore(storage, seed) {
    var state = null;

    async function load() {
      if (state) return state;
      var raw = await storage.read();
      if (!raw || !raw.events || !raw.settings) {
        state = {
          version: 1,
          users: [], sessions: {}, saved: {}, series: [], subscriptions: [], vapid: null,
          events: JSON.parse(JSON.stringify(seed.events)),
          settings: JSON.parse(JSON.stringify(seed.settings))
        };
        var salt = seed.admin.salt || uid('s_');
        var hash = seed.admin.hash || await hashPassword(seed.admin.password || '', salt);
        state.users.push({
          id: uid('u_'), username: seed.admin.username,
          usernameLower: seed.admin.username.toLowerCase(),
          salt: salt, hash: hash,
          role: 'admin', name: seed.admin.name, email: '', notify: true,
          createdAt: new Date().toISOString()
        });
        await save();
      } else {
        state = raw;
        state.users = state.users || [];
        state.sessions = state.sessions || {};
        state.saved = state.saved || {};
      }
      state.series = state.series || [];
      state.subscriptions = state.subscriptions || [];
      state.vapid = state.vapid || null;
      return state;
    }

    async function save() { await storage.write(state); }

    function userFor(token, db) {
      if (!token) return null;
      var id = db.sessions[token];
      if (!id) return null;
      return db.users.find(function (u) { return u.id === id; }) || null;
    }

    function requireUser(token, db) {
      var u = userFor(token, db);
      if (!u) throw fail(401, 'Please sign in to continue.');
      return u;
    }

    function requireAdmin(token, db) {
      var u = requireUser(token, db);
      if (u.role !== 'admin') throw fail(403, 'Only the admin account can change content.');
      return u;
    }

    var api = {
      bootstrap: async function (token) {
        var db = await load();
        var u = userFor(token, db);
        return {
          settings: db.settings,
          events: db.events.slice().sort(function (a, b) {
            return (a.date + a.time).localeCompare(b.date + b.time);
          }),
          user: publicUser(u),
          saved: u ? (db.saved[u.id] || []).slice() : [],
          mode: 'core'
        };
      },

      signup: async function (body) {
        var db = await load();
        var username = String(body.username || '').trim();
        var password = String(body.password || '');
        if (username.length < 3) throw fail(400, 'Username needs at least 3 characters.');
        if (password.length < 6) throw fail(400, 'Password needs at least 6 characters.');
        if (db.users.some(function (u) { return u.usernameLower === username.toLowerCase(); })) {
          throw fail(409, 'That username is taken. Try another one.');
        }
        var salt = uid('s_');
        var u = {
          id: uid('u_'), username: username, usernameLower: username.toLowerCase(),
          salt: salt, hash: await hashPassword(password, salt),
          role: 'user', name: String(body.name || username).trim().slice(0, 80),
          email: String(body.email || '').trim().slice(0, 120), notify: true,
          createdAt: new Date().toISOString()
        };
        db.users.push(u);
        var token = uid('t_');
        db.sessions[token] = u.id;
        db.saved[u.id] = [];
        await save();
        return { token: token, user: publicUser(u) };
      },

      signin: async function (body) {
        var db = await load();
        var username = String(body.username || '').trim().toLowerCase();
        var u = db.users.find(function (x) { return x.usernameLower === username; });
        if (!u) throw fail(401, 'Wrong username or password.');
        var hash = await hashPassword(String(body.password || ''), u.salt);
        if (hash !== u.hash) throw fail(401, 'Wrong username or password.');
        var token = uid('t_');
        db.sessions[token] = u.id;
        if (!db.saved[u.id]) db.saved[u.id] = [];
        await save();
        return { token: token, user: publicUser(u) };
      },

      signout: async function (token) {
        var db = await load();
        if (token) delete db.sessions[token];
        await save();
        return { ok: true };
      },

      me: async function (token) {
        var db = await load();
        return { user: publicUser(requireUser(token, db)) };
      },

      setNotify: async function (token, body) {
        var db = await load();
        var u = requireUser(token, db);
        u.notify = !!body.notify;
        await save();
        return { user: publicUser(u) };
      },

      getSaved: async function (token) {
        var db = await load();
        var u = requireUser(token, db);
        return { saved: (db.saved[u.id] || []).slice() };
      },

      toggleSaved: async function (token, id) {
        var db = await load();
        var u = requireUser(token, db);
        if (!db.events.some(function (e) { return e.id === id; })) throw fail(404, 'That event no longer exists.');
        var list = db.saved[u.id] || (db.saved[u.id] = []);
        var i = list.indexOf(id);
        if (i === -1) list.push(id); else list.splice(i, 1);
        await save();
        return { saved: list.slice(), added: i === -1 };
      },

      createEvent: async function (token, body) {
        var db = await load();
        requireAdmin(token, db);
        var e = cleanEvent(body, null);
        db.events.push(e);
        await save();
        return { event: e };
      },

      updateEvent: async function (token, id, body) {
        var db = await load();
        requireAdmin(token, db);
        var idx = db.events.findIndex(function (e) { return e.id === id; });
        if (idx === -1) throw fail(404, 'Event not found.');
        var e = cleanEvent(body, db.events[idx]);
        db.events[idx] = e;
        await save();
        return { event: e };
      },

      deleteEvent: async function (token, id) {
        var db = await load();
        requireAdmin(token, db);
        var before = db.events.length;
        db.events = db.events.filter(function (e) { return e.id !== id; });
        if (db.events.length === before) throw fail(404, 'Event not found.');
        Object.keys(db.saved).forEach(function (uid) {
          db.saved[uid] = (db.saved[uid] || []).filter(function (x) { return x !== id; });
        });
        await save();
        return { ok: true };
      },

      listSeries: async function (token) {
        var db = await load();
        requireAdmin(token, db);
        return {
          series: db.series.map(function (sr) {
            return Object.assign({}, sr, { count: db.events.filter(function (e) { return e.seriesId === sr.id; }).length });
          })
        };
      },

      createSeries: async function (token, body) {
        var db = await load();
        requireAdmin(token, db);
        var repeat = body.repeat || {};
        var freq = ['weekly', 'biweekly', 'monthly'].indexOf(repeat.freq) !== -1 ? repeat.freq : 'weekly';
        var count = Math.min(Math.max(parseInt(repeat.count, 10) || 8, 1), 26);
        var interval = Math.min(Math.max(parseInt(repeat.interval, 10) || 1, 1), 4);
        var base = cleanEvent(body, null);
        var seriesId = uid('series_');
        var created = [];
        for (var i = 0; i < count; i++) {
          var date = advanceDate(base.date, i * interval, freq);
          var e = cleanEvent(Object.assign({}, base, { date: date }), null);
          e.seriesId = seriesId;
          db.events.push(e);
          created.push(e);
        }
        var series = {
          id: seriesId, title: base.title, titleSr: base.titleSr || '',
          freq: freq, interval: interval, count: count,
          category: base.category, createdAt: new Date().toISOString()
        };
        db.series.push(series);
        await save();
        return { series: series, events: created };
      },

      updateSeries: async function (token, id, body) {
        var db = await load();
        requireAdmin(token, db);
        var affected = [];
        db.events.forEach(function (e, idx) {
          if (e.seriesId !== id || !isFuture(e)) return;
          db.events[idx] = cleanEvent(body, e);
          affected.push(db.events[idx]);
        });
        if (!affected.length) throw fail(404, 'No upcoming events in that series.');
        var sr = db.series.find(function (x) { return x.id === id; });
        if (sr && body.title) sr.title = body.title;
        await save();
        return { events: affected };
      },

      deleteSeries: async function (token, id, futureOnly) {
        var db = await load();
        requireAdmin(token, db);
        var before = db.events.length;
        db.events = db.events.filter(function (e) {
          return !(e.seriesId === id && (!futureOnly || isFuture(e)));
        });
        var removed = before - db.events.length;
        if (!removed) throw fail(404, 'Series not found.');
        if (!db.events.some(function (e) { return e.seriesId === id; })) {
          db.series = db.series.filter(function (x) { return x.id !== id; });
        }
        var ids = {};
        db.events.forEach(function (e) { ids[e.id] = true; });
        Object.keys(db.saved).forEach(function (u) {
          db.saved[u] = (db.saved[u] || []).filter(function (x) { return ids[x]; });
        });
        await save();
        return { ok: true, removed: removed };
      },

      pushSubscribe: async function (body) {
        var db = await load();
        if (typeof require === 'function') { try { require('./webpush.js').ensureVapid(db); } catch (e) {} }
        var endpoint = String((body.subscription && body.subscription.endpoint) || body.endpoint || '');
        if (endpoint.indexOf('https://') !== 0) throw fail(400, 'Invalid push subscription.');
        var rec = db.subscriptions.find(function (x) { return x.endpoint === endpoint; });
        if (!rec) {
          rec = { endpoint: endpoint, createdAt: new Date().toISOString() };
          db.subscriptions.push(rec);
        }
        var prefs = body.prefs || {};
        rec.lang = prefs.lang || rec.lang || 'en';
        rec.categories = Array.isArray(prefs.categories) ? prefs.categories.slice(0, 10) : (rec.categories || []);
        rec.quiet = prefs.quiet || rec.quiet || null;
        rec.updatedAt = new Date().toISOString();
        await save();
        return { ok: true, subscribers: db.subscriptions.length };
      },

      pushUnsubscribe: async function (body) {
        var db = await load();
        var endpoint = String((body.subscription && body.subscription.endpoint) || body.endpoint || '');
        db.subscriptions = db.subscriptions.filter(function (x) { return x.endpoint !== endpoint; });
        await save();
        return { ok: true, subscribers: db.subscriptions.length };
      },

      pushPrefs: async function (body) {
        var db = await load();
        var rec = db.subscriptions.find(function (x) { return x.endpoint === String(body.endpoint || ''); });
        if (!rec) throw fail(404, 'Subscription not found.');
        if (body.lang) rec.lang = String(body.lang).slice(0, 4);
        if (Array.isArray(body.categories)) rec.categories = body.categories.slice(0, 10);
        if (Object.prototype.hasOwnProperty.call(body, 'quiet')) rec.quiet = body.quiet;
        await save();
        return { ok: true, prefs: { lang: rec.lang, categories: rec.categories, quiet: rec.quiet } };
      },

      publicVapid: async function () {
        var db = await load();
        var pub = null;
        if (typeof require === 'function') { try { pub = require('./webpush.js').ensureVapid(db).publicKey; await save(); } catch (e) {} }
        return { publicKey: pub };
      },

      pushList: async function (token) {
        var db = await load();
        requireAdmin(token, db);
        return {
          count: db.subscriptions.length,
          subscribers: db.subscriptions.map(function (x) {
            return { lang: x.lang, categories: x.categories || [], quiet: x.quiet || null, createdAt: x.createdAt };
          }),
          publicKey: db.vapid ? db.vapid.publicKey : null
        };
      },

      pushBroadcast: async function (token, body) {
        var db = await load();
        requireAdmin(token, db);
        var msg = String(body.message || '').slice(0, 500);
        if (!msg) throw fail(400, 'Message is empty.');
        if (typeof require !== 'function') return { ok: true, subscribers: db.subscriptions.length, message: msg, note: 'node-only' };
        var out = { ok: true, subscribers: db.subscriptions.length, message: msg };
        try {
          var wp = require('./webpush.js');
          var res = await wp.broadcast(db, msg, { title: 'Old London Pub', url: '/' });
          out.sent = res.sent;
          out.failed = res.failed;
          out.results = res.results;
        } catch (e) { out.error = e.message; }
        return out;
      },

      updateSettings: async function (token, body) {
        var db = await load();
        requireAdmin(token, db);
        var allowed = ['pubName', 'tagline', 'taglineSr', 'eyebrow', 'eyebrowSr', 'about', 'aboutSr', 'address', 'hours', 'hoursSr', 'instagram', 'email', 'phone'];
        allowed.forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(body, k)) db.settings[k] = String(body[k]).slice(0, 600);
        });
        await save();
        return { settings: db.settings };
      }
    };

    // One router, used by both the local (in-browser) adapter and the Node HTTP server.
    async function route(method, path, body, token) {
      body = body || {};
      var m;
      if (path === '/health') return { status: 200, data: { ok: true, mode: 'shared' } };
      if (path === '/bootstrap' && method === 'GET') return { status: 200, data: await api.bootstrap(token) };
      if (path === '/auth/signup' && method === 'POST') return { status: 200, data: await api.signup(body) };
      if (path === '/auth/signin' && method === 'POST') return { status: 200, data: await api.signin(body) };
      if (path === '/auth/signout' && method === 'POST') return { status: 200, data: await api.signout(token) };
      if (path === '/auth/me' && method === 'GET') return { status: 200, data: await api.me(token) };
      if (path === '/auth/me' && method === 'PATCH') return { status: 200, data: await api.setNotify(token, body) };
      if (path === '/saved' && method === 'GET') return { status: 200, data: await api.getSaved(token) };
      if ((m = path.match(/^\/saved\/([^/]+)$/)) && method === 'POST') {
        return { status: 200, data: await api.toggleSaved(token, decodeURIComponent(m[1])) };
      }
      if (path === '/events' && method === 'POST') return { status: 200, data: await api.createEvent(token, body) };
      if ((m = path.match(/^\/events\/([^/]+)$/)) && method === 'PATCH') {
        return { status: 200, data: await api.updateEvent(token, decodeURIComponent(m[1]), body) };
      }
      if ((m = path.match(/^\/events\/([^/]+)$/)) && method === 'DELETE') {
        return { status: 200, data: await api.deleteEvent(token, decodeURIComponent(m[1])) };
      }
      if (path === '/series' && method === 'GET') return { status: 200, data: await api.listSeries(token) };
      if (path === '/series' && method === 'POST') return { status: 200, data: await api.createSeries(token, body) };
      if ((m = path.match(/^\/series\/([^/]+)$/)) && method === 'PATCH') {
        return { status: 200, data: await api.updateSeries(token, decodeURIComponent(m[1]), body) };
      }
      if ((m = path.match(/^\/series\/([^/]+)$/)) && method === 'DELETE') {
        return { status: 200, data: await api.deleteSeries(token, decodeURIComponent(m[1]), body.futureOnly !== false) };
      }
      if (path === '/push/vapid' && method === 'GET') return { status: 200, data: await api.publicVapid() };
      if (path === '/push/subscribe' && method === 'POST') return { status: 200, data: await api.pushSubscribe(body) };
      if (path === '/push/unsubscribe' && method === 'POST') return { status: 200, data: await api.pushUnsubscribe(body) };
      if (path === '/push/prefs' && method === 'POST') return { status: 200, data: await api.pushPrefs(body) };
      if (path === '/push/broadcast' && method === 'POST') return { status: 200, data: await api.pushBroadcast(token, body) };
      if (path === '/push/subscribers' && method === 'GET') return { status: 200, data: await api.pushList(token) };
      if (path === '/settings' && method === 'PUT') return { status: 200, data: await api.updateSettings(token, body) };
      throw fail(404, 'Unknown request: ' + method + ' ' + path);
    }

    return { route: route, load: load };
  }

  var exported = { createCore: createCore, cleanEvent: cleanEvent, hashPassword: hashPassword };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  root.OLPCore = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this);
