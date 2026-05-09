# BrewLab — START HERE

**Last session: 9 May 2026 (GitHub migration, Vercel deploy, Supabase live)**
**Read this first. Everything else is reference.**

---

## What BrewLab Is

A brewery management app for **Nomodachi Brewery** in Amagasaki, Japan, owned by Ben.

Three interfaces — desktop, tablet (iPad), mobile (iPhone) — that all sync via Supabase. Covers recipe design, brew day logging, fermentation tracking, packaging, and Japanese tax authority (NTA) compliance.

**Important:** Ben plans to share BrewLab with other breweries. Each brewery brings their own Supabase project. The app is **single-brewery-per-database** — distributed as a shareable app where each user supplies their own Supabase credentials via Settings → Connection.

---

## Where the Project Is At

- **HTML reference apps** (`brewlab-desktop.html`, `brewlab-tablet.html`, `brewlab-mobile.html`) — feature-complete, hosted on GitHub Pages. **The authoritative spec for the rebuild.**
- **React PWA rebuild** — feature-complete on every page including Tariff Reduction. Sync layer rebuilt: soft-delete tombstones, mash sync, recipe_profiles sync, orphan cleanup, plus a SETTINGS_KEYS prefix mechanism so per-year keys (`bl_tariff_*`) sync automatically. What's left is end-of-port polish.
- **Three Supabase migrations applied today** — `recipe_profiles` table, `deleted_at` columns on `recipes` and `ferm_log`, `mash` table.
- **Supabase project** active. URL and anon key in CLAUDE.md.
- **No real brewery data yet** — Ben hasn't started production brewing. Test recipes are rebuild debris and can be deleted any time.

---

## Hosting

- **Live URL:** https://brewlab-red.vercel.app
- **Source repo:** https://github.com/nestafett2/brewlab
- Auto-deploys on every push to `main`.
- Per-user Supabase credentials supplied via Settings → Connection in the live app (not Vercel env vars), preserving the shareable single-brewery-per-DB model.

---

## Tabs Status

| Tab | State | Notes |
|---|---|---|
| Recipe | ✓ working | Right-click context menu (rename/duplicate/move/delete) ported today |
| Brew Day | ✓ working | |
| Fermentation | ✓ working | DH pH prediction live |
| Packaging | ✓ working | |
| Water | ✓ working | |
| Tax / Tax Summary / NTA / Tax Master | ✓ working | |
| Analysis | ✓ working | |
| Batch History | ✓ working | |
| Checklist | ✓ working | |
| Planner | ✓ working | |
| Notes | ✓ working | |
| Libraries | ✓ working | |
| Inventory / Order Planner | ✓ working | "+ NEW ORDER" / "Create Order" labels |
| Settings (all sub-tabs) | ✓ working | |
| Templates | ✓ working | **New** — Save as Template + From Template tab in New Recipe modal |
| Tariff Reduction | ✓ working | **New** — three sub-tabs, XLSX export, prefix-synced |

All major page ports complete. Sync layer rebuild complete.

---

## What Got Done Last Session (9 May 2026)

Infrastructure session. Got BrewLab onto a live URL. No app feature work beyond a one-line `vite.config` fix.

### GitHub migration

Pushed the repo to a new personal-account home: **github.com/nestafett2/brewlab**. The original `nomodachi` work account is still suspended; appeal not yet filed (now low priority — code is safe on the personal account).

Removed `.github/workflows/deploy-pages.yml` — GitHub Pages is no longer the host so the workflow was dead weight.

### Vercel deploy

BrewLab is **live at https://brewlab-red.vercel.app**, auto-redeploys on every push to `main`.

One-line gotcha: `brewlab/vite.config.ts` had `base: '/brewlab/'` (set for the old `nomodachi.github.io/brewlab/` subpath). Vercel serves at root, so the deployed bundle 404'd on every asset until `base` was changed to `'/'`. Worth remembering if anyone ever flips back to a subpath host — it'll need to flip back.

### Supabase configured in the live app

Credentials entered into the deployed app via Settings → Connection. Sync verified — Vercel app pulls from the same Supabase project as local dev. Critically, **credentials stay per-user via in-app Settings, NOT Vercel env vars** — preserves the shareable single-brewery-per-DB model. Each brewery brings their own Supabase, configured in the running app.

### OneDrive risk dismissed

The standing concern that `.git/` could be corrupted by OneDrive sync was investigated and **dismissed**. The project path is `C:\Users\nesta\OneDrive\Desktop\Apps\Brewing App\brewlab` but OneDrive Backup is **OFF** for Desktop. Verified two ways:
1. Right-click context menu on Desktop shows no OneDrive sync items / cloud icons.
2. OneDrive Settings → Manage backup shows Desktop = "Not backed up".

The OneDrive path is vestigial from a past Backup configuration. Project is NOT actively syncing. Removed from the pending list; do not re-raise.

---

## What's Still Broken / Pending

### Infrastructure

- **HTML reference apps decision.** `brewlab-desktop.html` / `-tablet.html` / `-mobile.html` are still in the repo but not deployed. The React app supersedes them. Decide: delete from the repo, or re-host on Vercel as a separate project.
- **GitHub work account appeal (low priority).** Code is safely on the `nestafett2` personal account. The suspended `nomodachi` work account can be appealed if/when convenient — not blocking anything.

### Pull from CC at start of next session
- Confirm the deletion overhaul unwind didn't break anything: right-click any recipe → "Delete" appears (no Archive), delete a recipe with data → tax records persist, undo within 8s restores everything.
- Confirm CC's commits all landed.

### End-of-port queue (priority-ish order)
- **15.8L volume offset** in Brew Day calcs (data quality bug — investigate before brewing real batches)
- **BeerSmith bulk imports** — grains, hops, suppliers (needed for new-brewery onboarding)
- **Vercel deployment** (when ready to share)
- **13 pre-existing TS errors** — cleanup pass
- **Style Guide setting** — decide function or remove (5 min)
- **Dead Save button on meta-bar**
- **Yeast harvest "From Brew #" semantics** — free-text could be either tax serial or per-lineage counter
- **Mash thickness override** on Recipe or Water tab
- **Beer style guideline import** flow (BJCP 2025) into Style Guide modal
- **Broader undo coverage** — current undo doesn't restore the 7 per-recipe blobs (ferm_log, brew_day, cold_side, water_chem, etc.); when deletion overhaul ships, audit if this is still a gap.

### Deferred
- **Brewhouses-as-tankCalib** — when 2nd brewhouse arrives
- **Google Sheets sync** — one-way (BrewLab → Sheets, read-only)
- **Teiban / Gentei / One-off classification** — deferred from today
- **HTML/React label divergence** — cosmetic
- **Optional add_malted_column.sql migration**
- **Typography pass** — last

### Future products (post-launch)
- AI-powered recipe analysis tool
- Sales team upcoming-brews app
- Can count reporting tool

---

## Next Session Focus

- **HTML reference apps decision** — delete from the repo, or re-host on Vercel as a separate project.
- **BeerSmith bulk imports** — now more relevant since new breweries can be pointed at the live Vercel URL for trial.
- **Eyeball the new recipe layout** in normal workflow (carryover from 7 May).
- **Optional: calc-drift sanity check** from the 7 May TS fix — `calcOG` / `calcEBC` / `grainDiPh` now correctly parse string-typed legacy library numerics. Spot-check imported recipes; not urgent given no real brewery data.
- **15.8L volume offset** — only if you want a self-contained data-quality task.

---

## Working Style

These are Ben's hard rules. Don't violate them.

- **No assumptions.** If something isn't obvious from these handoff docs, ask one specific question. Don't fabricate context.
- **Be honest.** Never claim you've checked, read, or compared something you haven't. If you're guessing, say "I'm guessing." If you don't know, say "I don't know."
- **Read the HTML app source** before building any feature. The HTML is the spec.
- **Show planned changes before writing code** for non-trivial work. Skip the plan step for small obvious fixes (CSS tweaks, single-line bugs, missing alerts).
- **Complete each feature fully** in one pass — UI + calculations + state + Supabase sync.
- **Don't redesign without permission.** Copy layout, spacing, fonts, and behaviour from the HTML app exactly — unless asked to deviate.
- **Tax logic is high-stakes.** Extra care on `snap_*` fields, classification, and ledger entries.
- **Sync bugs are subtle.** Read SYNC.md before touching any data layer. **Verify in Supabase Table Editor directly — and refresh it (Ctrl+Shift+R) — before debugging rendering code.**
- **Be direct.** Ben doesn't need long explanations of basic concepts unless he asks for them.
- **Keep scope tight.** Catch yourself when investigation expands beyond the original goal — flag it, ask whether to continue or defer, don't expand silently.
- **Verify state before fixing.** Before assuming something's broken, check what the React app actually does — bugs in handoff notes are often already resolved.
- **Always flag the caveats** when reporting back from Claude Code. Ben wants those surfaced every time.

---

## Reference Files

| File | What's in it | When to read |
|---|---|---|
| `START_HERE.md` | This file. State of project + next step. | Every session, first. |
| `CLAUDE.md` | Project decisions, architecture, business rules, schema/sync quick refs. | When you need context on a specific decision. |
| `FEATURES.md` | Per-device feature inventory. | When you need to know what each device does. |
| `SESSION_LOG.md` | Per-session history. | When you need the reasoning behind a past decision. |
| `CALCULATIONS.md` | Every formula. | Before implementing any calculation. |
| `SCHEMA.md` | Supabase tables, columns, localStorage key mappings. | Before touching the data layer. |
| `SYNC.md` | localStorage ↔ Supabase sync rules. | Before touching anything that writes to Supabase. |
| `brewlab-desktop.html` | The authoritative spec. ~20,850 lines. | Before building any feature. |
| `brewlab-tablet.html` | Tablet reference. | Before building tablet layout. |
| `brewlab-mobile.html` | Mobile reference. | Before building mobile layout. |

---

## Accounts & Services

| Service | Account | Notes |
|---|---|---|
| Supabase | brewing@nomodachi.com | Project ID: `inxipvdturxgeapsznxb` |
| GitHub | nestafett2 (personal account) | Repo: `github.com/nestafett2/brewlab`. The `nomodachi` work account is suspended; appeal optional. |
| Vercel | Ben's personal account | Deployed at `https://brewlab-red.vercel.app`, auto-deploys on push to `main`. |
| Netlify | — | Abandoned. Hit free-tier bandwidth limit. Do not use. |

**Supabase URL:** `https://inxipvdturxgeapsznxb.supabase.co`
**Supabase Anon Key:** in CLAUDE.md.

---

## How to Run the React App Locally

1. Open PowerShell
2. `cd` to the brewlab folder
3. `npm run dev`
4. Open the printed `localhost:5173` (or 5174) URL in Chrome

---

## End-of-Session Checklist

When wrapping up a session, update **this file** with:
- Date of the session
- What got built (under "What Got Done Last Session" — replace previous content)
- What's still broken (under "What's Still Broken / Pending")
- What the next concrete step is

Keep this file short — under one page worth of "where are we and what's next." Append a new dated entry to **SESSION_LOG.md** if the session was substantial. **CLAUDE.md** changes only when an architectural decision changes. Detailed reference stays in CALCULATIONS / SCHEMA / SYNC / FEATURES.
