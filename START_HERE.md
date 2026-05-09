# BrewLab — START HERE

**Last session: 9 May 2026 (long day — morning: live deploy; evening: Recipe tab redesign + bug fixes)**
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

Long day, two distinct chunks: morning got BrewLab onto a live URL; evening was UI polish + bug fixing.

### Morning — live deploy

- **GitHub migration to `nestafett2/brewlab`** (personal account; `nomodachi` work account still suspended, appeal optional).
- **Vercel deploy** — live at https://brewlab-red.vercel.app, auto-redeploys on every push to `main`. One-line gotcha: `vite.config.ts` `base` was `/brewlab/` (GitHub Pages subpath) → changed to `/` for Vercel root.
- **Supabase configured live** via Settings → Connection. Per-user creds in-app, NOT Vercel env vars — preserves the shareable single-brewery-per-DB model.
- **OneDrive risk dismissed** — path looks like OneDrive but Backup is OFF for Desktop. Verified twice; do not re-raise.
- **`.github/workflows/deploy-pages.yml` removed** — Pages no longer the host.

### Evening — PWA polish, Recipe tab redesign, bug fixes

**iPad PWA polish.** Status bar was overlaying the BREWLAB top nav in standalone mode. Added `padding: env(safe-area-inset-*)` on `#root` (top/L/R only — dropped bottom after content shifted up leaving a home-indicator gap). Cleaned up `/brewlab/` subpath leftovers in `index.html`, `main.tsx`, `manifest.json`, and `sw.js`. `theme_color` updated from blue (`#0a84ff`) to dark gray (`#2c2c2e`) to match the actual top nav (`var(--panel)`).

**Recipe tab redesign — 4 passes.**
- **Pass 1** (`fbcd9c6`): top metric strip (BATCH/GRAIN/HOPS/IBU/ABV) replacing the 6 process pills; new PROCESS panel in the bottom row; TOTALS picks up DH G/L + WP G/L (new `calcDryHopGperL` / `calcWhirlpoolGperL` helpers).
- **Pass 2** (`5202f53`): dense ingredient list — `IngredientCard.tsx` rewritten as flat sections (no card chrome, no header column row); right-click section header opens a column-visibility menu (mirrors inventory's pattern, persists per-section to `bl_recipe_cols_<type>`, local-only); misc gets extra top gap.
- **Pass 3** (`75a3b10`): visual unification — bottom 4 panels lose backgrounds/borders/radius; panel headers go from amber Bebas to muted gray small-caps (matching ingredient section labels); meta-bar pills flatten; sidebars unified to main bg; orphan `.ing-card*` CSS deleted.
- **Pass 4** (`b09724e`): polish — bottom panel rows cluster label+value on the left with whitespace right; ingredient amounts unbolded; top metrics center-grouped (40 px gap, dropped maxWidth); DryHopModal font sizes +2 across the board.

**BSMX audit.** Reference test file: `hop1.bsmx` (Wakatu hop, `F_H_PRICE = 141.7476156`). Audited React `importBSMX` against HTML reference (lines 17058–17220). All three suspected areas — price conversion (× 35.274 ¥/oz → ¥/kg), notes preservation, core fields — match HTML verbatim. **No bugs in the importer.**

**Brew Day MASH panel divergence fix** (`3863570`). Symptom: bob2 recipe (250 kg grain) showed Mash Water = 1320 L (total) instead of 750 L (mash only); Sparge = 0 instead of ~570; Strike = 71.7°C instead of 74.6°C. Root cause: `MashProfileModal` initializes from a hard-coded in-memory `DEFAULT_PROFILE` (`{ ratio: 3.0, steps: [...] }`) but only persists to `bl_mash_<recipeId>` on Save click. `BrewDayTab` reads `bl_mash_<recipeId>` directly, gets null, passes null to `calcBrewDayTargets`, which falls back to the water-balance ratio formula `(preBoilVolL + grainAbsorbTotL) / totalGrainKg` ≈ 5.28 L/kg. Fix: extracted `DEFAULT_MASH_PROFILE` to `lib/calculations.ts`; `BrewDayTab` applies the same fallback when localStorage is null. Both views now compute against the same baseline before the user explicitly saves.

**Library price display fix** (`fe4766f`). Two bugs surfaced after the BSMX audit confirmed the importer was correct.
- **Issue A — malt price empty for imported entries.** `LIB_FIELDS.malts` had 9 entries (`name, maltster, supplier, malt_type, malted, tariff, ebc, price, notes`) but `LIB_HEADERS.malts` had 7 columns. The two are zipped positionally at render time, so `malted`/`tariff` shifted every column from EBC onward — the visual "Price ¥/kg" column was actually rendering the `tariff` boolean (always empty for imports). Fix: removed `malted` and `tariff` from `LIB_FIELDS.malts` (still in modal as checkboxes via `LIB_FIELD_DEFS`). Existing imported data was correct in Supabase; just being read from the wrong field name.
- **Issue B — yeast library missing price column.** Added Price ¥/pkg to `LIB_HEADERS.yeast` + `LIB_FIELDS.yeast`, plus a price field to `LIB_FIELD_DEFS.yeast` so the Add/Edit modal can edit it.

---

## What's Still Broken / Pending

### Infrastructure

- **GitHub work account appeal (low priority).** Code is safely on the `nestafett2` personal account. The suspended `nomodachi` work account can be appealed if/when convenient — not blocking anything.

### Recipe + Brew Day follow-ups

- **Brew Day tab card chrome.** Visual unification pass only touched the Recipe tab — Brew Day's MASH / BOIL / PITCH & OXYGEN panels still have card backgrounds + borders. Apply the same flatten treatment.
- **WaterTab passes `mashProfile: null`** to `calcBrewDayTargets`. Same divergence as the Brew Day MASH bug; may be intentional for ion-blending math (water-balance ratio is what mash-pH calc actually wants there). Investigate before applying the same fallback.
- **`BrewDayTab.mashProfile` `useMemo([recipeId])` stale dep.** Doesn't refetch when the modal saves while Brew Day is mounted. Likely masked by tab unmount/remount; real edge case.
- **Top metric strip spacing.** Still feels off per user — minor follow-up.

### End-of-port queue (priority-ish order)
- **15.8L volume offset** in Brew Day calcs (data quality bug — investigate before brewing real batches)
- **BSMX recipe import** — selective hand-pick from user's 632-recipe BeerSmith export (not bulk)
- **Style Guide setting** — decide function or remove (5 min)
- **Beer style guideline import** flow (BJCP 2025) into Style Guide modal
- **Broader undo coverage** — current undo doesn't restore the 7 per-recipe blobs (ferm_log, brew_day, cold_side, water_chem, etc.).

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

- **Brew Day card chrome flatten pass** — extends Recipe tab unification to Brew Day's MASH / BOIL / PITCH & OXYGEN panels.
- **BSMX recipe import (selective)** — user has a 632-recipe BeerSmith export; wants hand-picked imports rather than bulk dump. Build a recipe-picker modal on top of the existing `importBSMX` infrastructure (already handles grain/hop/yeast/misc lib entries; recipe path is new).
- **Eyeball the new recipe layout** in normal workflow (carryover from 7 May).
- **Optional: calc-drift sanity check** from the 7 May TS fix — `calcOG` / `calcEBC` / `grainDiPh` correctly parse string-typed legacy library numerics. Spot-check imported recipes; not urgent.
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
