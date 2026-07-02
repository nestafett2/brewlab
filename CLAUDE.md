# BrewLab — Master Handoff (CLAUDE.md)

**Last updated: 6 May 2026**

> **Read START_HERE.md first.** That file has the current state of play and the next concrete step. This file is the long-form reference: project decisions, architecture, business rules, schema/sync quick refs.

Reference docs:
- **START_HERE.md** — current state, next step, working style. Read first.
- **CLAUDE.md** (this file) — project decisions, architecture, business rules, schema/sync quick refs.
- **FEATURES.md** — per-device feature inventory.
- **SESSION_LOG.md** — per-session history. Read when you need the reasoning behind a past decision.
- **CALCULATIONS.md** — every formula.
- **SCHEMA.md** — every table and field.
- **SYNC.md** — sync rules and pitfalls.
- **brewlab-desktop.html / brewlab-tablet.html / brewlab-mobile.html** — working reference apps. Read the actual JS before building any feature.

---

## What BrewLab Is

A brewery management system for **Nomodachi brewery in Japan**, designed to be **shareable with other breweries**. Each brewery brings their own Supabase project — single-brewery-per-database, not multi-tenant.

Three interfaces — desktop, tablet (iPad), mobile (iPhone) — that all sync via Supabase.

**Owner:** Ben, Nomodachi Brewery, Amagasaki, Japan. Doesn't write code himself but does not need basic concepts re-explained.

---

## Accounts & Services

| Service | Account | Notes |
|---|---|---|
| Supabase | brewing@nomodachi.com | Project ID: inxipvdturxgeapsznxb |
| GitHub | nomodachi (work account) | Repo: nomodachi.github.io/brewlab |
| Vercel | Ben has personal account | BrewLab not yet deployed |
| Netlify | Abandoned | Hit free-tier bandwidth limit. Do not use. |

**Supabase URL:** `https://inxipvdturxgeapsznxb.supabase.co`
**Supabase Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlueGlwdmR0dXJ4Z2VhcHN6bnhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjMzMzgsImV4cCI6MjA4OTUzOTMzOH0.JvFqTwcwYPnIi3A7daySsOnAf8XLyttl9nLVXZ_J59A`

Anon key is safe in front-end. **Never** use service key in any front-end file.

---

## Key Architectural Decisions (do not revisit)

- **Tauri: dropped.** Build toolchain too heavy; Supabase as primary data store removes the need. The React PWA runs in Chrome on desktop, same as tablet/mobile.
- **One codebase, three layouts.** One React PWA detects device type and renders accordingly.
- **Supabase is source of truth.** Hydrate from Supabase first, fall back to localStorage if offline. Different from HTML app where localStorage was primary.
- **Hosting:** Vercel for React PWA (planned), GitHub Pages for HTML reference apps. No Netlify.
- **Shareable app, single-brewery-per-database** (3 May 2026). Each user supplies their own Supabase credentials via Settings → Connection. Stored in `bl_brew_settings.sbUrl` / `sbAnonKey`. Supabase client created lazily, re-created when credentials change. App boots in fully-local mode when credentials are absent — no setup screen, no blocking.

Phase 1 (HTML apps) is complete and serves as the authoritative spec for the rebuild.
Phase 2 (React PWA in `brewlab/` subfolder) — see START_HERE.md for status.

---

## File Structure

```
/ (repo root)
  brewlab/                    ← React PWA
    src/
      lib/                    ← calculations.ts, supabase.ts, storage.ts, utils.ts, waterChem.ts, tax.ts, nta.ts, ledger.ts, units.ts, ingredient-matcher.ts
      components/             ← recipe/ brewday/ ferm/ packaging/ tax/ planner/ inventory/ libraries/ settings/ shared/
      pages/                  ← Desktop.tsx Tablet.tsx Mobile.tsx
      store/index.ts          ← Zustand global state
      theme.css               ← Design tokens
      main.tsx
    public/manifest.json      ← PWA manifest
    migrations/               ← SQL migrations (apply via Supabase SQL editor)
  brewlab-desktop.html        ← HTML reference (treat as reference; modify only for data-layer fixes affecting the live database)
  brewlab-tablet.html         ← HTML reference (DO NOT MODIFY)
  brewlab-mobile.html         ← HTML reference (DO NOT MODIFY)
  CLAUDE.md / START_HERE.md / FEATURES.md / SESSION_LOG.md / CALCULATIONS.md / SCHEMA.md / SYNC.md
  index.html                  ← GitHub Pages redirect
```

---

## Tech Stack

React + TypeScript (Vite) + Zustand + Supabase + SheetJS. Fonts: Bebas Neue + SF Mono. PWA via `public/manifest.json`. Vercel hosting planned.

---

## Architecture Principles

### Data flow
Supabase is source of truth. On startup: show cached local data immediately, hydrate from Supabase in background, update UI. Writes: local store first (instant UI), Supabase in background (fire and forget). Never wait for Supabase to render.

### Deletion sync (still pending — end-of-port queue)
Soft deletes with `deleted_at` timestamp on `recipes` and `ferm_log`. Stamp `deleted_at = now()` instead of hard deleting. On sync, if incoming data has `deleted_at` newer than last sync → remove locally. Before applying any incoming deletion, warn user ("This sync will remove X recipes. Continue?") — trigger on ANY deletion, not just bulk. Ingredients cascade-delete by recipe_id; no per-row tombstone needed. Full spec in SYNC.md.

### State management
Zustand for global state (recipes, libraries, settings, planner). Calculations as pure functions in `lib/calculations.ts`. Do not prop-drill — app is too interconnected.

---

## Design System

Dark theme primary; light mode toggle on mobile and desktop. Tablet is dark only. Design tokens (colors, fonts, spacing) live in `brewlab/src/theme.css` — edit there, don't duplicate values in components.

---

## Calc Constants (cross-tab)

- `HOP_ABSORPTION_ML_PER_G = 6` (whirlpool only)
- Cooling shrinkage applied at boundary: `batchL` = cooled into-FV target
- `grainAbsorb` consumed across all 6 sites except Mash Profile modal on Recipe tab (pending)
- `defaultGrainTemp` + `coolingShrinkage` wired into BrewDayTab targets

Full formulas in CALCULATIONS.md.

---

## Critical Business Rules

### Beer Name vs Recipe Name
- `beerName` = label/brand name shown to users
- `name` = internal tax identifier (仕込記号)
- Tax submissions use `name`. Display uses `beerName || name`.

### Classification
- Must be exactly `'Beer'` or `'Happoshu'` — Supabase CHECK constraint
- Stored once on recipe, never independently recalculated on different pages
- Malt ≥ 80% of total fermentables = Beer; < 80% OR `happoshu_trigger` ingredient = Happoshu (80% is the correct NTA threshold; see CALCULATIONS.md)
- Carrageenan has `happoshu_trigger` flag in misc library
- `syncClassification()` is the one function that sets it — call it, don't recalculate inline

### NTA Tax Snapshots
- `snap-*` fields written once at "Record to Tax Master" time
- NEVER recalculated from live data afterwards — legal compliance requirement
- Editing recipe or packaging after filing does NOT change filed figures

### Water Chemistry — Tax Exclusion Rules

Salts and acids (phosphoric, lactic, gypsum, CaCl2, etc.) are water adjustments. They MUST NEVER appear in:
- NTA tax misc ingredient totals (the `other` bucket on the per-recipe tax record)
- NTA Submitter misc ingredient lists (CC1-5610-6 form)
- Tax Master committed declarations
- Auto-classification's "is this a Happoshu trigger?" pass

**HTML reference**: enforces this with **two filters applied together** at every tax-build point — name regex OR `use === 'water chemistry'`, either match excludes.

**React (current behavior — diverges from HTML, intentional)**: explicit `use` field is decisive when set; the regex is fallback for legacy entries with no use selected. The single canonical helper lives at `brewlab/src/lib/waterChem.ts:isWaterChem`.

**React precedence:**
1. `use === 'water chemistry'` (case-insensitive, trimmed) → water-chem.
2. Else if `use` is any other non-empty value (`'Boil'`, `'Mash'`, etc.) → NOT water-chem. Explicit user choice wins.
3. Else (`use` empty/null) → fall through to name regex.

**Why diverged**: the both-filters-together rule produces false positives on names that incidentally match the regex (e.g. "Kaffir Lime" — the regex matches "lime"). Such items, when explicitly tagged with a real `use` like "Boil", were silently excluded from tax misc totals. The new precedence trusts the brewer's explicit `use` selection.

**Filter 1 — `use` field (case-insensitive):**
```js
const use = (m.use || '').trim().toLowerCase();
if (use === 'water chemistry') return; // exclude (water-chem)
if (use !== '')                return; // KEEP — explicit non-WC use, NOT water-chem (React only)
// (HTML reference: skip the second check — falls through to regex)
```

**Filter 2 — name regex (used only when `use` is empty in React):**
```js
const waterChemKw = /gypsum|calcium.*sulfate|calcium.*chloride|magnesium|lactic.*acid|phosphoric.*acid|hydrochloric.*acid|sulfuric.*acid|chalk|lime|bicarbonate|calcium.*carbonate|epsom|baking.*soda|sodium.*bicarbonate|potassium.*metabisulfite|campden|salts|nacl|cacl|caso4|mgso4|cacl2|table.*salt|sodium.*chloride/i;
if (waterChemKw.test(name)) return; // exclude
```

The regex itself is unchanged from HTML.

**Filter 3 (implicit) — `type='water'` rows are NEVER iterated for tax totals.** Tax loops only walk `type='grain'` and `type='misc'`. The water type bypasses the misc bucket entirely. Lives in `iterTaxIngredients` in `lib/waterChem.ts`, unchanged.

**Snap-* unaffected**: `buildSnapshot` (`lib/tax.ts`) reads from `ColdSideData` and the existing `TaxRecord` only — does not call `isWaterChem` or `iterTaxIngredients`. Already-filed tax records preserve their captured values from filing time. Only live recompute and displays shift for affected recipes.

**HTML reference locations (all must match in React):**

| Function | HTML Line | Purpose |
|---|---|---|
| `pullIngredientTotals()` | 8454 | Live recompute of `malt`/`wheat`/`oats`/`other` for `bl_tax_<id>`. Called whenever the Tax tab opens — overwrites stale saved values. |
| `loadTaxPage()` (block at) | 8585 | Pulls live ingredients into the Tax tab UI when it renders. Same exclusion. |
| NTA Submitter misc list | 11553 | Builds the per-1000L misc list shown on CC1-5610-6. Exclusion runs **before** the `happoshu_trigger` check. |

**Auto-classification (`autoClassifyRecipeById`, line 12068)** does NOT apply the name regex — it relies on:
- `type='water'` rows being skipped (only iterates `misc` and `grain`)
- water-chem misc items not having `happoshu_trigger=true` in the library
- water-chem misc items not being mistakenly stored as `type='grain'`

If any of those invariants break, classification can flip incorrectly. Defensive note: when porting auto-classification, consider adding the `waterChemKw` regex as a third guard.

**Water source recognition (`brewlab-desktop.html:11537`)** — separate concern. The `water_l` tax field needs the recipe's water *volume*, three-tier fallback:
1. A `type='misc'` row whose name contains "water" and has `unit='L'`
2. `bl_water_chem_<recipeId>.mashVol + spargeVol` if (1) absent
3. Sum of all `type='water'` rows' `amt` if (1) and (2) absent

Water-typed rows are **excluded from misc totals but included as water volume**.

**Inventory has its own narrower regex (`brewlab-desktop.html:15655`):**
```js
const EXCLUDE_MISC = /phosphoric|sulfuric|lactic|hydrochloric|caustic|water|h2o/i;
```
Used by Record Usage modal. Don't substitute this for the tax regex — narrower, would let some salts through in tax contexts.

**Library trigger flag — `bl_lib_misc[].happoshu_trigger`** is a separate mechanism, independent of the regex. Auto-classification reads it after the type-filter step. Keep the checkbox in the rebuild's misc library editor.

### Active Brew
- brewDate is today or past AND `ferm_meta.packaged != true`
- Past brew date + zero ferm log entries = Fermenting (NOT Brew Day)

### fermStatus Logic
```
if packaged → "Packaged"
if ferm log entries > 0 → "Fermenting"
if brewDate exists:
  if brewDate >= today → "Brew Day"
  if brewDate < today → "Fermenting"  ← past date, no readings yet
else → "Planned"
```

### Ingredient IDs
Format: `recipeId + '_' + index` (e.g. r1_0, r1_1, r2_0). Never sequential integers — causes PK collisions in Supabase.

### Misc rules
- 1L yeast slurry = 1kg for NTA tax purposes
- ferm_log IDs always `crypto.randomUUID()` — never `Date.now()` (collisions)

---

## Pending Database Migrations

The React rebuild has shipped code that depends on Supabase schema changes that may not be applied yet. Apply from Supabase SQL editor in date order. App keeps working without them — Supabase upserts fail silently, local writes succeed — but cross-device sync of the affected feature is degraded.

| Migration | Adds | Affects | Status |
|---|---|---|---|
| `2026-05-04_add_malted_column.sql` | `recipe_ingredients.malted boolean` | Per-row malted flag round-trip across devices | Optional — recoverable from `MaltLib.malted` at edit time. Code currently does NOT write the column. |
| `2026-05-04_add_recipe_profiles_table.sql` | New `recipe_profiles` table (recipe_id PK, JSONB data) | Cross-device sync of per-recipe Equipment / Water / Pitch / Mash profile selections | **Recommended** — without it, profile picks don't propagate across devices. |

When applying a migration, also flip any code-side gate the migration's comment header documents.

---

## Supabase Schema Quick Reference

Full details in SCHEMA.md.

**Tables with `id` as PK:** recipes, recipe_ingredients, ferm_log, settings, harvested_yeast, tax_records, tax_master → delete with `?id=not.is.null`

**Tables with `recipe_id` as PK (JSONB blobs):** brew_day, ferm_meta, cold_side, water_chem, recipe_profiles → delete with `?recipe_id=not.is.null`. Wrong filter silently skips all rows. `water_chem` and `recipe_profiles` were added during the React rebuild — see Pending Migrations.

**Always add `&limit=1000000` to multi-row fetches.** PostgREST default is 1000 — silently truncates. Broke the app at ~45 recipes.

**`bl_brew_settings`** must NEVER be overwritten during hydration — it contains Supabase credentials.

---

## Sync Quick Reference

Full details in SYNC.md.

**The three functions:**
- `lsGet(key, default)` — reads from local store
- `lsLocal(key, value)` — writes local only (use during hydration)
- `lsSet(key, value)` — writes local + dispatches to Supabase (use for user data changes)

**Never use `lsSet()` during hydration** — triggers re-dispatch loop back to Supabase.

**Device write permissions:**

| Table | Desktop | Tablet | Mobile |
|---|---|---|---|
| recipes / recipe_ingredients | WRITE | read | read |
| ferm_log | WRITE | INSERT | INSERT |
| brew_day / ferm_meta / cold_side | WRITE | upsert | upsert |
| settings | WRITE | read | bl_brewery_notes only |
| tax_records / tax_master | WRITE | NEVER | NEVER |
| harvested_yeast | WRITE | delete+reinsert | NEVER |

---

## Profile Locking (May 2026)

Equipment, Mash, and Pitch profiles auto-lock when any recipe pointing at them has `brew_day.measOg > 0`. This prevents retroactive shifts in historical brew-day display targets and on-the-fly efficiency numbers — brew_day stores raw user inputs verbatim but recomputes derived targets live from the current profile every render, so profile edits otherwise corrupt historical displays even though tax_records snap_* fields stay immutable.

Implementation: `src/lib/profileLock.ts` exports `computeLockedProfileIds(recipes, cache, kind: 'equip'|'mash'|'pitch'): Map<string, number>` (returns id → usage count) and `nextCloneName(name, existingNames): string`. Each profile panel (EquipmentProfilesPanel, MashProfilesPanel, PitchProfilesPanel) wraps the helper in a useMemo over (recipes, recipeProfilesByRecipe).

UI rule: locked profiles show 🔒 in the row + "🔒 LOCKED" badge in the modal; "✕ Delete" → "⎘ Clone & Edit"; **value fields lock, metadata stays editable** (name + notes). Mash steps array locks in entirety (including the + Add Step button) — adding/removing steps changes the program shape, same reproducibility concern as numeric edits.

Clone & Edit: makes a new profile via makeId() + nextCloneName, inserts at end, switches editingId to the clone, toasts. Does NOT auto-switch any recipe to the new clone — existing recipes continue to reference the locked original (preserves their reproducibility); user re-points individual recipes manually via the per-recipe Profiles dropdown.

Reactivity caveat: useMemo only re-runs when recipes or recipeProfilesByRecipe change. Saving a brew_day in another tab while Settings is open won't refresh the lock state until the panel re-renders. Settings unmounts on tab switch so reopening always recomputes. Acceptable v1 trade-off; not building a brewDayHasRecord slice.

Water Profiles deferred indefinitely. Different architecture: the values that retroactively shift on edit live in per-recipe water_chem blobs, not in the profile itself. Source water profile changes are extremely rare in practice. Revisit only if real-world friction emerges.

---

## Working Style — Architecture Reminders

START_HERE.md has the general working style rules. Reminders unique to this file:

- **brewlab-desktop.html is the spec** — read the actual JS before building or porting anything. The .md files alone are not enough.
- **Tax logic is high-stakes.** Extra care on `snap-*` fields and classification. Never recompute snap-* from live data.
- **Sync bugs are subtle.** Read SYNC.md before touching any data layer.
- **Verify in Supabase Table Editor directly** (and Ctrl+Shift+R refresh it) before debugging rendering code.

### File update destinations
- Day-to-day status updates → **START_HERE.md**
- Session log entries → append to **SESSION_LOG.md**
- Feature inventory changes → edit **FEATURES.md**
- **CLAUDE.md** changes only when an architectural decision changes
