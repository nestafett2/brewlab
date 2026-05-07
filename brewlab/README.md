# BrewLab (React PWA)

Brewery management system for Nomodachi Brewery, distributed as a shareable
app — every brewery brings its own Supabase project. The schema is
single-brewery-per-database; only *which* database is user-configurable.

See `../CLAUDE.md`, `../CALCULATIONS.md`, `../SCHEMA.md`, and `../SYNC.md` for
the authoritative reference. The HTML reference apps (`brewlab-desktop.html`,
`brewlab-tablet.html`, `brewlab-mobile.html`) are the spec for every feature.

## Run locally

```sh
npm install
npm run dev
```

## First launch

The app boots in fully local mode. To enable cloud sync across devices:

1. Create a Supabase project (free tier is fine).
2. Apply the schema from `../SCHEMA.md`.
3. Open BrewLab → **Settings → Connection**.
4. Paste your Project URL and anon key. Both fields auto-save on change.
5. Click **Test Connection**. On ✓ Connected, click **Push Local → Supabase**
   to upload anything you've already created locally.

The anon key is safe to store in the browser — it's designed to be public.
**Never** paste a service key into the app.

## Build

```sh
npm run build
```

Output goes to `dist/`. Deploy to any static host — Vercel is planned for
production hosting (better SPA routing than GitHub Pages).
