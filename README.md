# Old London Pub — "What's On"

A bilingual (English / Serbian) events site for a pub, shipped as a **progressive web app**
that also runs as a native **Android** app.

## What it does
- **Live calendar** of events (quiz, live music, comedy, DJ, food, specials) with English + Serbian copy.
- **Save events** across devices when signed in.
- **Shareable event links** with auto-generated Open Graph images so they look right when shared on socials.
- **Installable PWA** — add to home screen from the browser, or install the Android app (APK at the repo root).
- **Recurring events engine** — define a weekly / biweekly / monthly series once; occurrences are generated automatically.
- **Real Web Push notifications** — the admin can broadcast a message and it is delivered to subscribed devices via the
  Web Push protocol (VAPID + encrypted payloads, using the `web-push` library with a dependency-free fallback).
- **iCal export** — subscribe to the calendar in any calendar app.
- **Admin mode** — sign in as the seeded `OLP` account to add / edit / delete events and broadcast notifications.

## Project layout
```
www/                 Static PWA + Node API (the deployable app)
  index.html         App shell (uses relative paths → works under a GitHub subpath)
  server.js          Optional shared-mode HTTP server (serves the site + /api/*)
  js/core.js         Shared domain core (runs identically in browser and Node)
  js/webpush.js      Real Web Push delivery (Node only)
  sw.js              Service worker (install / offline / push)
android/            Android Studio project (Capacitor wrapper)
android-web/        Web assets bundled into the Android app
tools/              Build / packaging helpers
Old-London-Pub.apk  Signed Android build
```

## Run locally (full experience)
```bash
cd www
npm install
node server.js            # serves on http://localhost:3000
# open http://localhost:3000
```
Sign in with the seeded **admin** account (`OLP`) to manage events and send push notifications.
The first run seeds sample events and generates a VAPID keypair automatically.

## Deploy
- **GitHub Pages (static site):** already wired via `.github/workflows/deploy.yml`.
  Live at `https://<user>.github.io/OLP/`. The static build works offline / device-local;
  for the server-backed features (real push, share pages, iCal) use one of the options below.
- **Docker:** `docker build -t old-london-pub . && docker run -p 3000:3000 -v olp-data:/app/www old-london-pub`
- **Render:** connect the repo and use `render.yaml` (Blueprint). Health check at `/api/health`.

## Tech notes
- No frontend framework and no runtime dependencies in the browser bundle — plain ES modules.
- The same `core.js` logic powers the in-browser offline mode and the Node `/api/*` backend,
  so behaviour is identical everywhere.
