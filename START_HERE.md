# BrewLab — START HERE

**Last session: 6 May 2026 (long session — multiple CC rounds + toast/undo plan)**
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

## What Got Done Last Session (6 May 2026)

Big session. Full Brew/Batch terminology rebuild + Tax Batch # field, three-action brew creation flow, brew history grouping, toast/undo system, recipe sidebar reorganization (drag-drop + folder context menu + multi-select), and a deletion-overhaul investigation that's mid-way through.

### Brew/Batch rename + Tax Batch # field

The HTML's `r.brewNum` (text, brewery-wide unique, NTA tax serial) was confusingly named. Picked **Option C**: rename `brewNum` → `taxBatch` everywhere; add NEW `brewNumber` int column for the per-lineage sequential counter. Migration applied: `2026-05-06_rename_brew_num_to_tax_batch_and_add_brew_number.sql`.

- All ~30 call sites updated.
- Meta-bar: BREW # pill wired to `brewNumber`, **read-only**, auto-filled. TAX BATCH # pill wired to `taxBatch`, free-text input, moved LEFT next to recipe name. Right-side order: BREW DATE → VERSION → BREW # → Save.
- Tax-surface labels: "Brew #" → "Tax Batch #" everywhere `taxBatch` displays. "Beer #" cleanup in TaxSummaryTab/TaxMasterPage column headers (some columns were beer name → "Beer Name", others tax serial → "Tax Batch #").
- One-time recompute pass on hydrate cleans up garbage values.

### + New Brew flow

Renamed and restructured. Single "+ New Version" button → primary "+ New Brew" + caret dropdown. Three actions:
- **+ New Brew** (no version change, brewNumber+1)
- **Amounts Changed** (minor bump 1.0 → 1.1)
- **Ingredients Changed** (major bump 1.0 → 2.0)

From a non-latest source: plain "+ New Brew" inherits source version; dropdown variants jump to next major from lineage's latest. New `NewBrewModal`. Switches to the new recipe after creation.

### Brew History tab

Renamed from "Batch History" → "Brew History". Version-change highlighting (amber + ✏). Major-version grouping (v1.x, v2.x), collapsible. Empty/null versions fall back to "1.0" → group with v1.x.

### Toast/undo

Architecture: closure-based undos, Zustand slice, bottom-right position, stack capped at 4, 4500ms with undo / 2500ms without, hover-to-pause. Built and retrofitted across Libraries, Notes, Planner, Inventory, Orders.

### Recipe sidebar reorganization

Drag-and-drop (recipe → folder, folder → folder for subfolder, folder → root, reorder within parent). Folder right-click context menu (Rename / + New Subfolder / Delete folder, with cascade behavior matching HTML). Multi-select (plain click / Ctrl-click / Shift-click) with bulk move and bulk delete. Custom multi-drag image with "N recipes" badge. Top "Folder" button + bottom "+ New Folder" link both wired (were unwired). Subfolder + "New Recipe Here" buttons added inside FolderPreview.

### Recipe row layout (3-line) + Brewery Overview

Recipe rows in sidebar now show three lines: `#X name` / `style · BJCP code` / `v1.x`. Brewery Overview right pane uses the same format wherever brews are referenced.

### Recipe deletion

Investigated the existing delete path (Phase 1, read-only). Findings: tax_records and tax_master were already preserved by intent (NTA compliance safe). All other per-recipe data was soft-tombstoned but left as zombie rows in Supabase. Cross-hydrate undo was broken — undo restored local state but didn't clear the Supabase tombstone, so next hydrate re-prompted.

Built an Archive two-tier model first, then unwound it after deciding the simpler model fit the brewer's workflow better.

**Final model:** single Delete action works on any recipe. Hard-removes recipe + ingredients + all per-recipe blobs (brew_day, ferm_log, ferm_meta, cold_side, water_chem, recipe_profiles, mash) + planner cascade + harvested_yeast linked rows. ALWAYS preserves tax_records and tax_master (NTA compliance). 8-second toast undo with full snapshot-then-restore.

Came along for the ride:
- Cross-hydrate undo bug fixed (snapshot-restore now writes through to Supabase via lsSet)
- BrewDayTab / PackagingTab dirtyRef guards (no more empty-blob writes on mount)
- Tax Master and Yeast Tracker show "(recipe deleted)" inline for dangling refs

Schema migration applied: 2026-05-07_rename_deleted_at_to_archived_at.sql. Column renamed but always NULL going forward — kept for cleanness.

---

## What's Still Broken / Pending

### Infrastructure (resolve at start of next session)

- **GitHub account suspended.** Resolve before any push: appeal the suspension on the nomodachi work account, switch to the second personal account, or pick a different host (GitLab / Bitbucket / etc.).
- **Local repo not connected to a remote.** Once a remote is sorted: `git remote add origin <url>` then `git push -u origin main` to back up everything.
- **OneDrive + .git interaction.** The repo lives inside a OneDrive-synced folder, which can corrupt `.git/` over time. Either exclude `Brewing App/.git/` from OneDrive sync (OneDrive Settings → Choose folders), or move the project out of OneDrive entirely.
- **Verify HTML reference app hosting.** If `nomodachi.github.io/brewlab` is down due to the GitHub suspension, the tablet/mobile views that load from there are broken until re-hosted (Vercel or elsewhere).

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

1. **Pull CC's deliverables** from the deletion overhaul terminal. Apply the schema migration in Supabase SQL editor first, then test:
   - Archive UI appears as a collapsible section at the bottom of the Recipes sidebar
   - Empty/draft recipe right-click → "✕ Delete" (hard delete)
   - Recipe with data right-click → "📦 Archive"
   - Restore action on archived recipes works
   - Undo a delete, refresh — recipe should stay (cross-hydrate undo bug fixed)
   - Tax Master shows archived recipes with indicator; never shows truly-deleted recipes
   - Yeast tracker shows "(archived)" on entries pointing to archived recipes

2. **Pick the next item from the queue.** Recommendation:
   - **15.8L volume offset** (data quality, self-contained, matters before real brewing)
   - Or **BeerSmith bulk imports** if moving toward shareability
   - Or **Style Guide decision** as a 5-min palate cleanser

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
| GitHub | nomodachi (work account) | Repo: `nomodachi.github.io/brewlab` |
| Vercel | Ben has personal account | BrewLab not yet deployed |
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
