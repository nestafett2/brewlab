# BrewLab — START HERE

**Last session: 02 July 2026 (env catch-up — git + Vercel deploy after 7-week gap; no feature work)**
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

## What Got Done Last Session (12 May 2026)

Substantial session. Three new print artifacts shipped, the Monthly Packaging Report print path fixed in place, two new recipe schema fields added with full Supabase round-trip. All 10 HTML print functions are now confirmed ported.

**Print port verification.** Started with concern that HTML print functions (`printTaxRecord`, `printMonthlyReport`, etc.) might be unported. Function-name grep was misleading — the porter restructured features (Monthly Report became a sub-tab of Tax Master). Follow-up grep on the calculation fingerprint (`fvBtWaste`, `totalWastePkg`, `kegWaste`, `flowmeterWaste` used together) found everything ported. Lesson logged for future "is feature X ported?" investigations: grep for the calc fingerprint, not the function name.

**Monthly Packaging Report print fix.** `TaxMasterPage.tsx`'s `printSubTab` was special-casing nothing — the Total sub-tab dumped a flat 24-column table instead of the HTML reference's per-month block layout (table + sidebar per month, page-break-inside:avoid, UNSCHEDULED section, date range in title). Fixed by adding a dedicated `printMonthlyReport` branch in `handlePrint` dispatch and narrowing `printSubTab`'s signature to `'brew' | 'cond'`. Extracted shared `groupRowsByMonth()` to module scope so on-screen `TotalSubTab` (via `useMemo`) and the print builder agree on grouping by construction. Sidebar metrics computed locally — on-screen `MonthSummaryCard` splits Beer/Happoshu by COUNT (units of kegs/cans), the HTML print sidebar splits by LITRES. Same source fields, different aggregations. "UNSCHEDULED" renamed to "NO PACKAGE DATE" everywhere (Ben's choice — more specific). Added per-block auto-suppress yellow Happoshu row highlight in print only (`#FFF8C4`, `print-color-adjust: exact` for Chrome PDF without "background graphics" toggle). The all-Happoshu edge case encoded as auto-suppress rather than an explicit toggle. A3 landscape kept; A4 question parked until Ben sees real output.

**Fake-data fixture for testing.** New `fake-monthly-report-data.json` (17 KB) at project root + reproducible generator at `brewlab/scripts/gen-fake-monthly-report-data.mjs`. Eight brews #432–439 with Japanese craft names spanning Feb/Mar/Apr 2026, 6 Beer + 2 Happoshu (one in each packaged month so sidebar split is testable), 2 unscheduled (both Beer). Mixed 350/500 ml cans. One intentional outlier brew (Goro Pilsner 5.4% FV→BT loss) for the high-waste rendering path. `.gitignore` updated for `fake-*.json` and `brewlab-backup-*.json`. Imported via Settings → Import Backup; round-trip verified.

**Prep Sheet print — new feature.** `src/components/recipe/prepSheetPrint.ts`. A4 portrait, 10 mm margins, 12 px body / 11 px labels / 18 px header. Designed across 5 mockup iterations. Five sections: header + targets stripe (OG/FG/ABV/IBU/SRM chips) → fermentables (MILL FIRST — first physical task on prep day) → water (strike/mash/sparge grid + minerals + salt additions inline) → hops & boil → yeast (single inline row — Ben specifically didn't want the full pitch math chain) → extra additions (free-text, suppressed entirely when empty — no ghost header). Soft amber/cream target chips (`#FFF4D9`, `print-color-adjust: exact`). No row dividers in tables, header underline only. Yeast section uses honest harvested display ("10 L harvested (short 27% — supplement w/ fresh)" in amber-red if short, "sufficient" muted green if not) — doesn't fabricate a top-up amount. Whirlpool section dropped (Ben's call — belongs on brew day sheet, not prep). Button: Recipe tab TOOLS group, after "Add to Planner".

**Brew Day Sheet print — new feature.** `src/components/recipe/brewDaySheetPrint.ts`. Same A4 shape as prep sheet but with " · brew day" suffix on the beer-name H1 and IBU/SRM dropped from targets row (irrelevant mid-brew). Designed by following Ben's existing Excel-sheet-2 layout, converted to chronological brew order. Six sections: mash (with 4×6 measurement grid — 5 unlabeled cols + 1 Pre-trans) → lauter & sparge (8-step flowmeter tracker matching Ben's Excel verbatim: start sparge / finish sparge / after underlet / after grain rinse / sparge amount / extra used / need sparge / finish #) → boil & whirlpool → knockout & pitch → efficiency → notes. Two distinct blank styles, deliberately: inline underlines for short fields, bordered empty cells for grid handwriting. Notes box has feint horizontal rules via CSS `repeating-linear-gradient` so handwriting tracks straight. Single-column layout (column packing fights handwriting density). Button: Brew Day tab bottom action strip, next to "📝 Record Usage". Disabled when targets haven't computed.

**Two new recipe schema fields.** `extraAdditions` (free-text additions field — Ben chose this over a structured cellar-additions schema) and `brewer` (per-recipe brewer name — Ben chose per-recipe over per-brew-day for current scale; per-brew-day would be more flexible if multiple brewers ever brew the same recipe). Two SQL migrations applied today (`text NOT NULL DEFAULT ''`). Both fields seeded in all four recipe-creation paths (`createRecipeFromTemplate`, BeerXML import, blank-recipe path; `createNewVersion` + `duplicateRecipe` inherit via spread). Initially shipped with the safe asymmetric read-but-don't-write pattern (read with empty-string fallback, omit from `recipeToRow` to avoid PGRST204); after Ben confirmed the SQL was applied, flipped to full read+write — both fields now round-trip across devices. UI: Brewer single-line input in a slim header row at the top of the Recipe tab; Extra additions textarea between ingredient cards and bottom panel. Both prints fall back: `recipe.brewer || settings.breweryName || "—"`.

**Ferm/pitch temp field-source bug.** Initial brew day sheet derived ferm temp from yeast-library `temp_min`/`temp_max` midpoint — wrong for Ben's recipes (e.g. Minatoyama Lager has 18 °C planned ferm temp, W-34/70 midpoint ~13.5 °C). Ben corrected: `BrewDayData.fermTemp` and `pitchTemp` are PLANNED targets, not recorded measurements as Claude Code had assumed from the field names. Fix: rewired `brewDaySheetPrint.ts` to read `brewDay.fermTemp` / `brewDay.pitchTemp` as the primary source, with yeast-lib derivation as fallback. Verified `prepSheetPrint.ts` was already doing this for pitch temp — only the variable name + comment misframed it as "input/actual"; renamed + comment updated. Lesson logged: don't assume a field's name implies its semantic; grep the field first.

---

## What's Still Broken / Pending

### Housekeeping (do soon)
- Move project out of OneDrive. Current location: /Users/ben/Library/CloudStorage/OneDrive-株式会社オープンエア/Apps/Brewing App. OneDrive placeholder files break Git and Node builds; moving to ~/Developer/brewlab (or similar non-synced location) is the real fix. Session on 2 July hit ETIMEDOUT on node_modules reads because of this.
- Retroactive migration files for recipes.extra_additions and recipes.brewer. Both columns are live in Supabase, but no .sql file was ever saved in the migrations/ folder. Match the naming convention of the other 05-* migrations (dated 2026-05-12). Both are text NOT NULL DEFAULT ''.

### End-of-port polish (do together)
- Typography pass (with click-any-text-to-find-token dev tool idea — defer until all tabs are visible together).

### Feature gaps
- File menu: 1 placeholder left — Export Selected (context-aware multi-select: recipes / malts / hops / etc. depending on current view; needs design discussion).

### Calibration
- BEER_BUFFER_PH_PER_MEQ_L (now editable in Settings → Advanced → Calculation Constants, default 0.04) is a rough estimate. Recalibrate against measured datapoints once production brewing produces real data. Lower priority.

### Smoke tests pending (browser, no CC needed)
- Numeric formatting (integer batch sizes, 1 dp ABV everywhere).
- Toast/undo retrofit (recipe delete confirms still gate, MashProfileModal Reset restores form, WaterTab Clear, FermTab log row delete).
- Beer Buffer Capacity input renders in Settings → Advanced + Ferm tab residual-acid responds when changing the value.
- Equipment + Mash + Pitch profile locking (🔒 + Clone & Edit + disabled fields on profiles attached to recipes with measOg saved).
- Templates BJCP filter (dropdown + search in New Recipe → From Template).
- BeerXML round-trip (export a recipe, re-import the file, confirm equivalent).
- Backup round-trip (export, import, reconnect Supabase from Settings → Connection, verify state preserved).
- Yeast harvest picker (formatted pair "384 — Hazy IPA" displays in Add/Edit Ingredient).
- **Prep Sheet print** — all sections render, target chips visible, "—" fallbacks appear, Extra Additions section suppressed on empty.
- **Brew Day Sheet print** — ferm/pitch temps sourced from `brewDay.fermTemp` / `brewDay.pitchTemp` correctly (not yeast-lib midpoint), 8-step sparge tracker complete, 4×6 mash measurement grid renders.
- **Brewer field cross-device sync** — set on desktop, verify it appears on tablet/mobile after pull.
- **Extra additions field cross-device sync** — same as above.
- **Monthly Report print** — NO PACKAGE DATE label appears, Happoshu highlight visible in mixed Feb/Mar blocks, suppressed in all-Happoshu blocks.

### Print follow-ups (from 12 May session)
- **Monthly Report A3 vs A4** — A3 landscape currently; revisit page-size choice once Ben prints a real one with production data.
- **Fixture brews showing "(recipe deleted)"** — `bl_recipes` stubs in `fake-monthly-report-data.json` don't fully populate `decorateBeerName`'s identity check. Cosmetic-only on the fixture; real data unaffected. Low priority.
- **Internal naming residue** in `printMonthlyReport` — variable `unscheduledRows` and CSS class `.unscheduled-label` still say "unscheduled" even though every user-visible string changed to "NO PACKAGE DATE". Code-internal only.

### Brew-floor print sheets remaining
- **Sheet 3** — Ferm + Packaging combined daily log. Design + impl pending. Next print artifact after current ones are smoke-tested.
- **Sheet 4** — Brew Day filled (auto-archive). Discussed; may not be needed since blank + typed-back data covers it. Revisit after Ben uses the blank sheet in production.
- **"Print Full Brew Packet"** button — stringing the sheets together. Eventually, after the individual sheets stabilise.

### Layout bugs
- Inventory screen too wide (needs investigation — flagged for next session).

### Deferred (post-launch / conditional)
- BJCP 2025 style guideline import (gated on JBA/BJCP releasing the spec).
- Google Sheets sync (one-way).
- Teiban / Gentei / One-off classification.
- HTML/React label divergence.

### Future products (post-launch)
- AI-powered recipe analysis tool (claude.ai not API).
- Sales team upcoming-brews app.
- Can count reporting tool.

---

## Next Session Focus

1. **Test the new prints in the live app + cross-device sync.** Top priority before more code lands. Prep Sheet, Brew Day Sheet, fixed Monthly Report — plus brewer / extra additions field round-trip across desktop/tablet/mobile. The print smoke tests are listed under Smoke tests pending above; running them is the highest leverage thing to do next.
2. **If prints look good in practice: Sheet 3 design (Ferm + Packaging combined daily log).** Otherwise: fix what surfaces. Sheet 3 is the next brew-floor print artifact after the current pair.
3. **Inventory-screen-too-wide bug.** Flagged for investigation — exact symptom unclear yet; first session task is reproduce + identify the offending layout rule.

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
| GitHub | nestafett2 (personal account) | Repo: `github.com/nestafett2/brewlab`. |
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
