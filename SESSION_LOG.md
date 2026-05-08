# SESSION_LOG entry — 2026-05-07 (afternoon)

Recipe page layout redesign + 13-error TS cleanup that turned out to be 40 once cache-visibility was resolved. Many CC rounds, all desktop React; Tablet and Mobile pages untouched.

---

## Recipe page layout redesign

Two-column RecipeTab: left = ingredient cards + bottom 3-panel grid (Style / Totals / Measured); right = full-height ActionStack at 188 px. Meta bar collapsed to a single row — name + Tax Batch # + Brew Date + Version + Brew # + beer glass icon (size 50, EBC-derived flat fill via new `lib/ebcColor.ts`). Sub-tab nav now sits below the meta bar. Equipment-derived values pill row (Batch into FV/WP, Expected Loss, Boil, BH Eff, WP Temp) lives at the top of the left column, gated to `recipeSubTab === 'ingredients'`, constrained to left-column width.

ActionStack groups, top to bottom:
- **SETUP** — Classification dropdown, Equipment dropdown (truncates with ellipsis at 188 px), Mash Profile button.
- **ADD** — Fermentable / Hops / Misc / Yeast / Water Adj / + Carrageenan.
- **EDIT** — Substitute / Duplicate / Delete (selection-gated, dimmed when no row selected).
- **TOOLS** — Scale / Grain % / Hop IBUs / Add to Planner. Scale relocated from the File menu (was a no-op `closeMenus` placeholder; now stub-alerted until a Scale modal is built).

Bottom 3-panel grid:
- **Style** — picker + 5-zone red/yellow/green/yellow/red range bars (hard-stop CSS gradient, no anti-aliased transitions). Marker is a black SVG triangle. Layout per row: value (left) / bar (middle) / range text (right). Green block = `[min, max]`, yellow = ±37.5 % buffer, red beyond.
- **Totals** — Total Grains / Total Hops / IBU/SG ratio / Est Pre-Boil Gravity / Est Final Gravity.
- **Measured** — Measured OG / Postboil Vol (renamed from "Measured Batch Size" — sources `bd.postboilL`) / Measured Efficiency / Total Cost. Reads `bl_bd_<recipeId>` from localStorage same way AnalysisTab and FermTab do.

New files: `ActionStack.tsx`, `StyleSummaryPanel.tsx`, `BeerGlassIcon.tsx`, `lib/ebcColor.ts`. `StatsSidebar.tsx` deleted. Iterative session — many CC rounds tightening based on visual feedback (column reorder, pill-row position, Tax Batch # placement, divider cleanup, etc.).

---

## 13 TS errors cleanup

Real count was **40** once cache-visibility was resolved. The "cache hides errors" theory in standing notes was wrong — actual cause was bypassing `tsc -b` by running `npx vite build` directly. The references-root `tsconfig.json` (`files: []`, `references` only) means plain `tsc --noEmit` checks zero files. `npm run build` was always doing the right thing (`tsc -b && vite build`); session-long verification just used the wrong invocation.

**Going forward**: use `tsc -b` or `npm run build` for typecheck verification. Plain `tsc --noEmit` is vacuous against this project's tsconfig.

Fixes, grouped by root cause:
- **27 errors** from `LibNum` (`number | string | undefined`) loose-union arithmetic at library-field read sites — `lib/calculations.ts:calcOG/calcEBC/grainDiPh`, `RecipeTab.tsx`, `EditIngredientModal.tsx`, `AddIngredientModal.tsx`. Resolution: new `asNum(x: LibNum, fallback = 0): number` helper in `lib/utils.ts`. Funnels reads through one parser. Real semantic improvement.
- **9 errors** from `LibEntry → Record<string, unknown>` casts in the inventory column system. Mechanical: `as Record` → `as unknown as Record` per TS's own suggestion. Runtime semantics identical.
- **TankCalibration optionality** (3 errors in `fvVolume`) — fields are user-config and may be empty. Guarded via `asNum` so missing fields → 0 (treated as "no calibration" per existing call-site convention).
- 1 regression I introduced earlier (`StylePickerDropdown.placeholderStyle()` missing `carb: null`).
- 2 unused vars (`sectionToIngType`, `useState`).
- 1 dead branch (`'water'` comparison after upstream type narrowing).

Two non-trivial behavior changes worth flagging:
- `fvVolume` now returns 0 for uncalibrated tanks instead of `NaN`-propagating. Silent — callers already guard on `> 0`.
- Library numeric reads in `calcOG` / `calcEBC` / `grainDiPh` now correctly parse string-typed legacy data. **OG / EBC / pH calcs become more accurate on any recipe imported via BeerXML or BSMX before today.** No risk for Nomodachi (no real brewery data yet); flag as a "first deploy" event when BrewLab is shared with a brewery that has legacy library imports.

Verified clean: cold-cache `npx tsc -b` → exit 0, 0 errors. Cold-cache `npm run build` → tsc + vite both pass.

---

# SESSION_LOG entry — 2026-05-07

> Append to the top of `SESSION_LOG.md`.

Long session focused on yeast tracking polish, inventory display consistency, sidebar/recipe-browsing rework, and extending the Style data model. Five distinct CC passes shipped, two Supabase migrations applied.

---

## Yeast tracking — tax batch semantics + generation rule

The HTML's "From Brew #" field on harvested yeast was free-text and ambiguous — could be a tax batch, recipe name, or brew counter. Last session's `brewNum` → `taxBatch` rename gave us a real tax batch field; this session brought the harvested yeast UI in line.

**Decision:** the yeast inventory needs to show **the tax batch number** (not beer name or per-lineage counter) because the tax office cares about traceability when auditing yeast lineage.

Changes shipped:
- "From Brew #" field relabeled "From Tax Batch #" on the harvest modal; pre-fills from `r.taxBatch`
- Use-log modal: dropped the redundant Beer field, renamed Brew # → Used In Tax Batch # with auto-fill from the loaded recipe, kept the Date field (the React port had added this as a useful improvement over the HTML's two-prompt flow; preserving it allowed retroactive logging)
- Inventory column relabels accordingly
- Generation rule was inconsistent — Ferm-tab harvest kept the strain's last gen unchanged, Inventory-page "+ Log Harvest" auto-bumped +1. Unified rule: **harvest gen = parent brew's yeast gen + 1**, fresh yeast = Gen 1. Both entry points now apply this rule.
- Wired the previously-disabled Ferm tab "🧫 Log Harvest" button (handoff docs claimed it was working but it was disabled in code)

Caveat surfaced and fixed: `yeastSource` and `yeastGen` lived only in local state — not in `ingToRow`. After a fresh hydrate from another device, the Ferm-tab harvest pre-fill defaulted to fresh / Gen 2 even when the brew was actually pitched on harvested Gen 3. Fix: migration adding `yeast_source text` + `yeast_gen integer` to `recipe_ingredients`; round-trip code updated.

---

## Inventory display — tax batch + beer name everywhere a brew is referenced

The harvested yeast change initially repurposed `entry.beer` to store the tax batch number, which broke consistency with the rest of the inventory: the regular ingredient ledger (grain, hops, misc) tracks "which brew used this" by **brew name**, not tax batch.

Asked Ben to choose between: revert harvested yeast to beer name (consistency), or upgrade everything to show both tax batch + beer name. He picked **show both, everywhere a brew is referenced**.

Implementation:
- `entry.taxBatch` added as a new field; `entry.beer` restored to storing beer name
- New paired field on harvest rows for the source's tax batch
- HarvestedYeastView columns render inline as "ABC-23 — Hazy IPA" via a `formatPair` helper; legacy entries with only one field render gracefully
- Regular ingredient ledger: `confirmRecordUsage` now also stores `taxBatch` derived from `brew.recipeId → recipe.taxBatch`
- Order planner brew column headers updated to the same composite format; XLSX export same
- `checkBrewFullyRecorded` matching switched to taxBatch-exact (more reliable than the brew-name substring match it was using); falls back to legacy substring match for entries without a tax batch

**Key debt incurred and then paid off in the same session:** the harvested_yeast Supabase table is not a JSON blob (the prompt assumed it was). CC worked around the schema by overloading the unused `brew_num` column to carry tax-batch info per row type. This worked but was ugly — especially given BrewLab is meant to be shareable, every fresh brewery installation would inherit the oddity. Followed up immediately with a small migration adding a dedicated `tax_batch text NULL` column; the React code now writes there and `brew_num` is left in place but unused (deprecated).

---

## Recipe Explorer — sidebar tab rework + new right-side view

Ben wanted a richer way to navigate his recipes than just the folder tree. Designed a new "Recipe Explorer" tab alongside Overview.

**Tab row change:** `[Overview | Folders | By Style]` → `[Overview | Recipe Explorer]`. The "By Style" tab was dead anyway, and "Folders" was redundant with the always-visible recipe tree. Top buttons (`[+ New] [📁 Folder]`) unchanged. Added right-click on blank tree space → "+ New Folder" context menu.

**Recipe Explorer right-pane**: 5 modes — By Date / By Folder / By Style / By Name / By Tax #. Each mode sorts/groups the recipes differently. Empty values for the sort field go under muted "No brew date" / "No tax batch" subheaders. Recipe rows match the sidebar's existing 3-line format.

**Click behaviour decided mid-session:** initial port had explorer single-click open the recipe directly. Ben wanted a preview-first interaction: single-click → preview pane (split-pane within the explorer's right pane), double-click → open in main editor. Sidebar single-click while in Explorer mode auto-switches to Overview and shows the preview there (the alternative — silently updating preview state with no visible feedback — was confusing per CC's caveat).

Caveat: browser fires `click` before `dblclick` (~250-500ms gap), so a double-click intended to open a recipe currently flashes the preview before the editor takes over. Fix is a 250ms debounce on click — sent to CC at session end, hadn't reported back when Ben wrapped up.

---

## Style data model extension

BeerSmith's BJCP guide entries include rich descriptive content (Description, Profile, Ingredients, Examples, Web Link). BrewLab only had numeric ranges and a name. Ben wanted parity — every style should support these fields, BJCP and custom alike.

**Sourcing decision:** on the question of pre-populating BJCP 2021 with descriptive content, my first take was "copyright concern" — Ben pushed back rightly that BJCP guidelines are publicly available and other apps include them. Real concern: sourcing reliably. Asking CC to type out 100+ multi-paragraph style descriptions risks hallucination. Decided to ship the schema with empty BJCP descriptive fields and let the future BeerSmith bulk-import flow populate them when it lands (BeerSmith's data has been vetted by their team).

Implementation:
- New optional fields on every style: `notes`, `carbonationMin/Max`, `description`, `profile`, `ingredients`, `examples`, `webLink`
- BJCP styles get a writable overlay layer (`bl_style_overlays` settings dict keyed by `styleKey`) — numeric ranges still come read-only from `BJCP_2021`, but descriptive content can be edited and persisted
- Custom styles persist descriptive fields directly on the record
- Add Custom Style modal extended with all new inputs
- Style Guide modal renders any non-empty descriptive fields below the existing range bars; Edit / Done toggle for in-place editing of any field on any style

Caveat dropped: carbonation isn't rendered as a 5th visual range bar (would need plumbing the recipe's actual carbonation through to the Style Guide modal). Ben confirmed he just wants the carbonation number for reference, not visual matching — text in the descriptive section is fine.

---

## Cleanup items knocked out

- **Style Guide dropdown removed.** It let users pick BJCP 2008 / 2015 / 2021 but only 2021 data was loaded — picking the others did nothing. Removed dropdown, hardcoded `bjcp2021`. The `StyleGuide` type in `types/index.ts` stays for forward-compat — when BJCP 2025 import lands, the multi-guide selector returns.
- **Dead Save button on meta-bar removed.** Auto-save was already wired everywhere; the button never had an `onClick`. Adjacent meta-pills retain their spacing.

---

## Items dropped from the queue

- **15.8L volume offset** — handoff docs framed it as "investigate before brewing real batches," not a confirmed bug. Ben's read: probably equipment settings, not code. Demoted to "verify when actually brewing."
- **Mash thickness override placement** — current Mash Profile modal puts the L/kg field at the top, one click away. Good enough.
- **Carbonation 5th range bar in Style Guide modal** — Ben wants the carb numbers as a text reference only, no visual matching needed.

---

## Items added to the queue

- **Drop deprecated `brew_num` column from harvested_yeast** — once confirmed no other deployments depend on it
- **BJCP 2021 descriptive data import** — bundled as a follow-up under BeerSmith bulk imports; populates the new descriptive fields when a BeerSmith XML is imported

---

## End state

Both migrations applied today. All build work shipped or in flight (debounce was the last CC pass, sent right before wrapping). No data migration needed for any of today's changes — Ben has no real brewery data yet, and old entries hydrate gracefully through the new code paths.

Next session is verification: smoke-test everything before declaring done.

# BrewLab — Session Log

Detailed per-session history. Day-to-day status lives in **START_HERE.md**; architectural context in **CLAUDE.md**. This file is for "what got built when, and why" — useful when you need to remember the reasoning behind a past decision.

---

## Session 2026-05-04 (evening) — Tax / Analysis / Settings / Profiles port

### New library files
- `lib/waterChem.ts` — canonical water-chem exclusion. Exports `WATER_CHEM_KW` (frozen regex), `isWaterChem(ing)`, `iterTaxIngredients(ings)` generator. All tax build points use the iterator so the three-filter rule (use field + name regex + type='water' skip) is enforced structurally, not by convention.
- `lib/tax.ts` — pure tax builders: `pullIngredientTotals`, `pullTaxDataFromTabs`, `waterLitresForTax`, `buildSnapshot`, `mergeTaxFieldUpdate`. snap_* keys are produced ONLY by `buildSnapshot`.
- `lib/nta.ts` — `ntaNormalise`, `ntaNormalise1000` (scale = 1000 / batchL), `ntaMatchScore` (TOL_TIGHT=0.10 / TOL_LOOSE=0.25).

### snap_* write-once enforcement
Two layered guards: (1) `buildSnapshot` is the only function that produces snap- keys; (2) `loadTaxRecord` and `updateTaxFromRecipe` use an explicit allowlist of recompute fields, which excludes snap-* by construction. A runtime assertion at module load checks the two sets are disjoint.

### water_l three-tier rule (unified for Tax tab + NTA Submitter)
1. Misc row: `type==='misc' && /water/i.test(name) && unit==='L'`
2. Else `water_chem.mashVol + water_chem.spargeVol`
3. Else sum of `type==='water'` rows' amt
Note: deliberate divergence from HTML — HTML's Tax tab had an equipment-profile fallback that React drops because water chem is always set at recipe creation.

### New constants in lib/calculations.ts
- `HOP_ABSORPTION_ML_PER_G = 6` — applied to whirlpool hops only. Boil/flameout/first-wort retain existing 1.0 L/kg pellet / 3.0 L/kg whole rates.
- Cooling shrinkage formula: `hotWortL = batchL / (1 − shrinkage/100)`, `postBoilVol = hotWortL + trubLoss`, `preBoilVol = postBoilVol + boilOff`. batchL = cooled into-FV target. Trub stays in kettle (added on top of scaled hot-wort, not scaled with it).

### Settings — wired/removed
- Removed (dead in HTML and React): hopUnit, yeastUnit, pressureUnit, dateFormat from BrewSettings type and Units panel.
- colorUnit (EBC/SRM toggle) — wired through StatsSidebar. SRM = EBC / 1.97 at display boundary; internal stats.ebc canonical.
- grainAbsorb — now read by BrewDayTab targets useMemo + WaterTab water-chem prefill, in addition to existing tax.ts spent-grain.
- defaultGrainTemp + coolingShrinkage — wired into calcBrewDayTargets via grainTempC and coolingShrinkagePct fields. WaterTab also passes coolingShrinkagePct.
- 6 of HTML's 6 grainAbsorb consumer sites covered (the 6th is the Mash Profile editor on the Recipe tab — pending porting).

### Profile selections
- New store slice `recipeProfilesByRecipe: Record<string, RecipeProfileSelections>` with `getRecipeProfiles(recipeId)` lazy-load and `setRecipeProfileKind(recipeId, kind, profileId)`.
- Desktop.tsx ProfileSelect rewritten — was a hardcoded stub. Subscribes to equipProfiles / waterProfiles / pitchProfiles, persists per-recipe selection.
- BrewDayTab.activeEquip and WaterTab.recipeWaterProfileId now read from store (live-reactive on dropdown change).
- **Limitation**: per-recipe profile selections are local-only — don't sync across devices. Migration SQL written by Claude Code (path: `brewlab/migrations/`); not yet applied. To fix: add bl_recipe_profiles_<id> to settings sync allowlist or move onto the recipe row as columns.

### Bug fixes
- `recipes_brew_num_key` 409: `recipeToRow` now writes `null` for empty/whitespace brew_num. Postgres treats NULL ≠ NULL for uniqueness, so multiple unsubmitted recipes coexist. `newVersionFromRecipe` explicitly sets brewNum: '' on new recipes (not inherited from spread).
- `recipe_ingredients.malted` PGRST204: column dropped from ingToRow payload. Field is local-only. MaltLib.malted recovers the value at recipe-edit time on any device. Migration SQL shipped at `brewlab/migrations/2026-05-04_add_malted_column.sql` for explicit per-row sync if wanted.

### + New Version flow
- `newVersionFromRecipe` in store. Bumps version (1.0 → 1.1). Copies ingredients + water chem; leaves brew-day/ferm/cold-side/tax empty. Shares lineageId; if source has none, sets it to source.id.

### Audit finding (false alarm)
"Brew Day calcs not reactive to ingredient changes" — investigated with temporary console.warn in BrewDayTab targets useMemo. Live test confirmed calcs ARE reactive (pellet hops 22200g → 200g dropped water by ~22L). Original report was unit confusion (g vs kg in test). Diagnostic flagged for removal.

### Known unported / pending
- Mash Profile modal on Recipe tab Actions sidebar — needs porting with calc display.
- Settings: Styles, Tanks, Water Profiles, Suppliers.
- Libraries (Malt/Hop/Yeast/Misc + BeerXML import/export).
- Notes, Planner, Inventory, Order Planner, Tariff Reduction.
- Sync layer rebuild + 10 unsynced lsSet keys + 15.8L volume offset — saved for end.

---

## Session 2026-05-05 — Settings sub-tabs / Libraries / Notes / Planner / Inventory / Order Planner

Massive port session. Most of the remaining big work is done.

### Settings sub-tabs ported
- **Styles** — Style Guide selector + custom-styles modal (OG/FG/ABV/IBU/EBC min/max grid, save-clears-form, list)
- **Tanks** — derives FV/BT groups from `tankCalib` keys (matching the BrewDayTab/PackagingTab convention). Add/Delete/Edit mutates tankCalib. Deletion reassigns plannerBrews referencing the tank to unassigned with confirm. Side benefit: fixes HTML's `addTankVessel` bug (mutated a non-persistent in-memory array).
- **Water Profiles** — list+modal pattern matching Equipment/Mash/Pitch. 7-field grid (Ca/Mg/Na/SO₄/Cl/HCO₃/pH) + notes. CSV/BeerSmith XML import deferred.
- **Suppliers** — chip-style add/remove, Enter-to-add, dedupe-on-add, seeded with HTML's DEFAULT_SUPPLIERS. Plus Default Shipping Costs section (shipMalt/shipHops/shipYeastDry/shipYeastLiquid/orderTax).

Doc/sync resolution: HTML's `sbSet` settingsKeys array is missing `bl_suppliers` (HTML-app suppliers are local-only despite docs). React's `SETTINGS_KEYS` (`lib/supabase.ts:940`) includes it correctly. No code change needed; docs are accurate for React.

### Style picker rework
Unified all style pickers (New Recipe modal, Recipe-tab Style dropdown, Style Guide modal) into one BeerSmith-style list with columns: Name / Style Guide / # / Category / OG Range / FG Range. Search filters across all. Spans BJCP_2021 entries plus all customStyles. Note: the `styleGuide` setting in BrewSettings is now decorative (HTML reference always returned BJCP_2021 anyway). Flagged for future decision.

Style Guide modal dropdown spacing tightened.

### Recipe-tab Profiles row redesign
- **Removed** Water Profile and Pitch / O₂ dropdowns (redundant — Water tab and Brew Day tab have their own selectors)
- **Equipment Profile bug fix**: `Desktop.tsx` was hardcoding `equipProfiles[0]` for the meta-bar's `effectiveTrubLossL`, ignoring the dropdown. Now uses the same fallback chain as `BrewDayTab.activeEquip` (selection → first profile → null). Expected loss + Batch into WP pills now respond to Equipment changes.
- **Pills relocated** from top meta-bar to Profiles row alongside Equipment: Batch into FV, Batch into WP, Expected Loss, Boil, BH Eff, WP Temp. Equipment flush left, pills centered against ingredient cards width. Restricted to Ingredients sub-tab only.

Out-of-scope flagged (HTML matches, not bugs): BH Eff and Batch into FV are recipe-level (don't change with Equipment); largeBatchUtil per-profile field unused.

### Libraries page
Full port: Malt / Hop / Yeast / Misc with BeerXML import/export and BSMX (BeerSmith) import. Auto-detects file type (`.bsmx` extension OR `<F_G_NAME>` substring → BSMX path; else BeerXML). Section auto-routed by tag presence regardless of active sub-section. EBC↔SRM at the boundary (× 1.97). BeerSmith price quirk handled (`F_G_PRICE` ¥/oz → ¥/kg via × 35.274; `F_Y_PRICE` ¥/pkg kept as-is). Stock auto-populates from `<INVENTORY>` / `<F_G_INVENTORY>` to `bl_inv_stock`. Selection: shift-click range, Select-All header. Bulk Edit / Bulk Delete / Duplicate / Search.

Type changes: hop `alpha` field renamed to `aa` (matches HTML disk format and existing AddIngredientModal reader). All four lib types extended with optional fields.

### Notes page
Small port. Pre-existing store/type/actions; just needed the page component. Two-column layout (320px add column + scrollable list). Newest-first by `created_at`. Ctrl/Cmd+Enter shortcut to submit.

### Planner page
Full port. Vessel × date grid with brew bars, upcoming-actions side panel (30-day horizon), calendar popup, Add/Edit Brew modal with nested actions editor, Recipe Picker modal, FV Conflict modal (overlap resolution with three buttons), Yearly Overview modal (3×4 grid + add/delete chips + print-to-window).

Greedy lane assignment for action stacking ported verbatim. Brewhouse row stacks brews on shared days (kept HTML behaviour per Ben's call).

`bl_yearly` added to `SETTINGS_KEYS` (was local-only in HTML — explicit behaviour change for cross-device sync). `bl_planner_brews` already in.

Recipe-tab "Add to Planner" button wired (`addCurrentRecipeToPlanner` HTML 13522). Opens AddBrewModal pre-filled with recipe + today's date.

Brewhouse currently a constant `bh`. End-of-port follow-up: Ben will have 2 brewhouses. Decided pattern: vessels in tankCalib with `bh*` prefix. Needs Tanks panel support + Planner deriveVesselGroups update + equipment profile association.

### Inventory + Order Planner

**Phase 1 — Inventory + Tax Ledger + Record Usage + Harvested Yeast + Inventory Correction:**
- New `lib/units.ts`, `lib/ledger.ts` (`getLedgerBalance`, `runningBalances`, `sortLedgerByDate`), `lib/ingredient-matcher.ts` (`ingNamesMatch` verbatim from HTML 14266).
- Ledger high-stakes: matches HTML shape exactly (`{date, got?, used?, supplier?, beer?, receivedDate?, usedDate?, correctionNote?}`, IN/OUT mutually exclusive, kg-canonical).
- Column visibility/reorder ported. `bl_inv_cols_<sec>` and `bl_inv_order_<sec>` stay local-only via `lsLocal` (per audit memory — intentional per-device prefs).
- Tax Ledger XLSX export filename uses `settings.breweryName || 'BrewLab'` (replaced HTML's hard-coded "OpenAir").
- Harvested Yeast type rewired from dormant flat-array shape to strain-keyed dict matching HTML/Supabase routing.
- Library entry modal "On Hand" reads live ledger balance now (was 0 placeholder).
- Brew-Day "Record Usage" button wired. Manual log only — no auto-log on brew complete (matches HTML).

**Phase 2 — Order Planner:**
- Forecast table: cross-product brew × ingredient × delivery columns with running balance + status (DONE/SHORT/LOW/OK per HTML 15562). Right-click brew header → reuses Phase 1's `RecordUsageModal`.
- Orders panel (slide-in 320px, date-grouped collapsible).
- Add Order modal: 3-column (brew filter / suggested / staged) with supplier-grouped rendering, manual-add expandable section, log+print flow.
- Edit Order modal: fills HTML's dead `openEditOrderModal` callsite. Edits qty/supplier/delivery/status/notes + delete.
- Stock import (CSV/JSON), XLSX export, Current Page XLSX (Phase 1 deferred item, wired alongside).
- Google Sheets — disabled with "Coming soon". Decided: end-of-port queue, one-way only (BrewLab → Sheets, read-only mirror). Credentials (`bl_gsheets`) stay local-only.

**Order → Ledger flow correction (in flight at session end):** ledger entries should only exist for `status === 'received'` orders (NTA compliance — ledger is the tax paper trail; can't log inventory you don't have). Add Order "Confirm & Log" no longer writes ledger entries unless status is received. Edit Order: status flip to/from 'received' adds/removes the matching ledger entry. Tagged with `orderId` on LedgerEntry for clean lookup. Prompt sent to Claude Code; verify on next session.

### Caveats
- Toast/undo system — every port skips it (alerts as placeholders). Retrofit in end-of-port queue.
- Edit-order ledger sync edge cases: partial deliveries, multi-line orders — flagged in the in-flight prompt.
- Library XML import button on Order Planner toolbar duplicates the Libraries page (kept for HTML parity, no issue).

---

## Session 2026-05-06 — Recipe-tab fixes / docs split / Templates / sync sweep / Tariff Reduction / Sync layer rebuild / Right-click context menu

The biggest single-day push to date. Most of the end-of-port cleanup landed.

### Recipe tab small fixes
- Add to Planner button was broken: there were two of them and the bottom-bar button had no `onClick`. Wired both to a single `handleAddToPlanner`.
- Brew Date input couldn't be changed. Fixed.
- Removed Duplicate and Delete from the StatsSidebar Actions section (was assumed redundant with the recipe-browser right-click menu — see Recipe Context Menu below for the real situation).

### Order Planner rename
"+ LOG ORDER" → "+ NEW ORDER" (toolbar). "LOG ORDER" submit → "Create Order". Inside the modal, the staged-list trigger that opens the Order Details panel renamed to "📋 Review & Create" so the two-step flow has distinct labels (the final ✓ Create Order is the actual submit).

### Documentation consolidation
- CLAUDE.md split into three files:
  - `CLAUDE.md` — project decisions, architecture, business rules, schema/sync quick refs.
  - `FEATURES.md` — per-device feature inventory (Desktop / Tablet / Mobile + features added late).
  - `SESSION_LOG.md` — per-session history.
- CLAUDE.md trimmed from 47.4k → ~14.3k chars. Removed: Design System CSS variable block (lives in `theme.css` now), Tech Stack and Deployment tables, redundant Current Build Status (already in START_HERE), Known Issues list (audited away — items either done or already in START_HERE end-of-port queue).
- New rule documented in CLAUDE.md and START_HERE.md "Working Style":
  - Session log entries → append to **SESSION_LOG.md**
  - Feature inventory changes → edit **FEATURES.md**
  - **CLAUDE.md** changes only when an architectural decision changes
  - Day-to-day status → **START_HERE.md**

### Templates port (week-1 priority — built ahead of Tariff)
Decided to port templates first so the Tariff Annual Planner could reference real `templateId` values without a recipeId-based deviation.

- New `Template` type — flat fields renamed to React conventions (`batchL`, `bhEff` instead of HTML's `batchSize`, `bheff`). Dropped HTML's `mashTemp`/`mashTime` because React's mash data lives in the per-recipe Mash Profile blob, not on the recipe row. Dropping them avoids entangling the template with mash profiles for no real benefit.
- New store actions: `setTemplates`, `saveRecipeAsTemplate(recipeId, name)`, `deleteTemplate(id)`, `createRecipeFromTemplate(templateId, opts)`. Latter allocates fresh recipeId, deep-copies ingredients with `${newId}_${idx}` IDs (per the React ID rule), persists via `lsSet` to `bl_recipe_list` + `bl_recipe_ings_<newId>`.
- Two new modals: `SaveTemplateModal` (single name field, seeded from active recipe) and `NewRecipeModal` (replaces the old inline `createNewRecipe()` direct call — two tabs: Blank Recipe + From Template). The old + New button now opens `NewRecipeModal`.
- File menu Save as Template wired (gates on `activeRecipeId`).
- No amber-flash visual feedback on save (HTML's flash targeted the StatsSidebar's "Save as Template" button which doesn't exist in React; modal closes silently instead, matching every other modal).
- Initially shipped `lsLocal`-only; flipped to sync via the sweep below.

### Sync sweep — easy flips
Added `bl_templates`, `bl_equipment`, `bl_nta_register`, `bl_nta_basis_current`, `bl_nta_basis_default` to SETTINGS_KEYS in `lib/supabase.ts`. Audit revealed most were already correctly wired from earlier sessions — only `bl_equipment` actually needed adding. CLAUDE.md "Known Issue #6" about `bl_orders`/`bl_ledger` being local-only turned out stale; both are correctly synced. Note removed during the trim.

Per-recipe blob keys (`bl_water_chem_<id>`, `bl_mash_<id>`, `bl_recipe_profiles_<id>`) and per-year keys (`bl_tariff_<year>`) were left out of this sweep — handled by the sync layer rebuild later in the session.

### Tariff Reduction port — last major page
Three sub-tabs (Annual Planner / Reservations / 需給表), FY selector, print + XLSX export per applicable tab.

- New `lib/tariff.ts` with FY helpers (`currentFiscalYear`, `fiscalYearLabel`, `fyMonths`), malt usage calcs (`calcMaltUsageFromMaster`, `calcPlannedMaltUsage`), monthly ledger builder (`buildMonthlyLedger`), NTA report block seeding (`seedNeekyuuBlocks` — 8 standard blocks).
- Annual Planner uses `templateId` (not `recipeId`) — clean HTML-faithful port enabled by the templates work above.
- Reservations: card-per-reservation with mark-received button + nested malts table. Dropped HTML's dead-on-write `m.tariff` field (re-derived from malt library at calc time).
- 需給表 (Neekyuu Hyo): opening stock + monthly malt ledger + auto-seeded report blocks.
- XLSX exports via existing `lib/excel.ts` helper. Three filenames pattern: `tariff-{tab}_{slug(breweryName)}_FY{year}.xlsx`. Upgrades HTML's CSV-pretending-to-be-XLSX export.
- Per-tab print buttons (Planner + 需給表; Reservations has no print path in HTML either).
- Skipped HTML dead code: `calcReservationBalances` (reads `data.orders` which is never written), `renderTariffTracker`, `addTariffOrder`/`updateTariffReservation` (never routed from `renderTariffPage`).

**SETTINGS_KEYS prefix support added** to `lib/supabase.ts`: new `SETTINGS_KEY_PREFIXES = ['bl_tariff_']` array. `isSettingsKey()` checks both the exact-match Set and the prefix list. `bl_tariff_<year>` keys round-trip through the settings table — one row per FY. Ben gets cross-device sync for tariff data without the sync-layer rebuild's JSONB-table approach.

Caveat: tariff data uses lowercase classification (`'beer'`/`'happoshu'`) — HTML wire format. Rest of the app uses canonical `'Beer'`/`'Happoshu'`. Calc helpers and XLSX export normalise; tariff is the one place this mismatch lives. Don't "fix" by capitalising — would break round-trip with existing data.

### Sync layer rebuild
Phase 0 verification: all five expected schema artefacts missing (clean slate). Three migrations applied via Supabase SQL editor:
- `2026-05-04_add_recipe_profiles_table.sql` (existing, recommended)
- `2026-05-06_add_deleted_at_columns.sql` (new — adds `deleted_at timestamptz` + index on `recipes` and `ferm_log`)
- `2026-05-06_add_mash_table.sql` (new — JSONB blob table mirroring `brew_day` shape)

Optional `2026-05-04_add_malted_column.sql` deferred per existing decision.

Code in three phases:

**Phase 2 — `bl_mash_<id>` sync.** New dispatch route `key.startsWith('bl_mash_') && !key.startsWith('bl_mash_profiles')` upserts to the `mash` table. Negative guard prevents the per-recipe prefix from swallowing the global `bl_mash_profiles` settings key. Added `'mash'` to the JSONB hydrate loop and to `sbWipeAll`'s `recipeIdTables` list.

**Phase 3a — soft-delete write side.** Dispatch on `bl_recipe_list` does a diff vs Supabase's currently-active recipe ids; ids missing from the new payload get `update(...).in('id', tombstoneIds)` to stamp `deleted_at = now()`. Same pattern on `bl_ferm_log_<recipeId>`, scoped per-recipe via `eq('recipe_id', ...)`. Store actions (`deleteRecipe`, `setFermLog`) unchanged — dispatch handles tombstoning automatically.

**Phase 3b — fetch + apply split.** `sbHydrate` refactored:
- `sbFetchHydration(LocalContext) → HydrationPlan` does all reads, no writes. Computes `pendingRecipeDeletions` and `pendingFermLogDeletions` with self-deletion filter (a tombstone whose id is no longer in this device's local set is the user's own deletion echoing back — skipped from the prompt but still queued for orphan cleanup).
- `sbApplyHydration(plan, lsLocal, lsRemove, { applyDeletions })` writes localStorage. Deletion-gated writes skip when `applyDeletions=false`. `bl_last_sync` only stamps when `applyDeletions=true`, so a declined prompt re-fires next hydrate.
- Store's `hydrate()` builds `LocalContext`, calls fetch → if pending and `lastSync` is non-empty, runs `window.confirm()` with a formatted prompt → calls apply with the chosen flag → reloads state.
- New helper `buildDeletionPrompt(recipes, fermLogs)` formats the message: up to 5 recipe names inline, "…and N more" past that, ferm logs summarised by total + recipe count.

**Phase 3c — orphan cleanup.** `PER_RECIPE_KEY_PREFIXES` exported from `lib/supabase.ts` (was module-private). Lists every per-recipe localStorage prefix to clear when a recipe is tombstoned: `bl_recipe_ings_`, `bl_bd_`, `bl_ferm_meta_`, `bl_cold_`, `bl_water_chem_`, `bl_recipe_profiles_`, `bl_mash_`, `bl_checklist_`, `bl_ferm_log_`. **`bl_tax_<id>` deliberately excluded** — tax data is audit trail; deleting a recipe shouldn't wipe filed declarations. Cleanup runs inside `sbApplyHydration` only when `applyDeletions=true`. The store's `deleteRecipe` also runs the same cleanup pass on the local id (would otherwise leak per-recipe blobs on self-delete; cross-device cleanup only fires for incoming tombstones).

Decisions captured:
- **First-hydrate-silent.** New install with empty `bl_last_sync` skips the prompt and applies all deletions silently. Once a real timestamp lands, subsequent prompts fire normally.
- **Self-deletion echo.** Filtered out of the prompt (no "remove the recipe you just deleted") but still triggers cleanup, covering the "delete dispatch failed mid-flight on this device but Supabase recorded the tombstone" recovery case.
- **Decline behaviour.** If user clicks Cancel on the prompt: `bl_recipe_list` and ferm logs for affected recipes are NOT overwritten (deleted recipes stay in local view). Other writes (libraries, settings, blobs, tax) DO apply. `bl_last_sync` does NOT advance — next hydrate re-fires the same prompt. User must eventually accept.

Tested locally: right-click delete a recipe on desktop → recipe row's `deleted_at` populated in Supabase ✓. Cross-device prompt UI not visually verified (no second device handy at session end).

RLS note for the future: tablet/mobile currently have INSERT-only on `ferm_log`. The soft-delete UPDATE path on `ferm_log` is dispatch-wired but RLS blocks it from non-desktop devices. Today this doesn't matter because there's no UI to delete ferm log entries from any device. If a delete UI ever lands on tablet/mobile, the RLS policy needs to allow UPDATE on rows the device originated.

### Recipe browser right-click context menu
Today's earlier "remove redundant Duplicate/Delete from sidebar Actions" task assumed the right-click menu was already ported in React. It wasn't — only the HTML had it. The bottom-bar Delete/Dup buttons that were left in place are ingredient-scoped, not recipe-scoped. Result: there was briefly no way to delete a recipe in the React UI.

Fix: ported `rbCtxMenu` from HTML.

- New `onContextMenu` handler on the recipe-item div in `Desktop.tsx`. Inline menu component with HTML's four items: ✎ Rename / ⧉ Duplicate / → Move to folder / ✕ Delete recipe. Click-outside and Escape close (deferred mousedown listener so the right-click that opens the menu doesn't immediately close it).
- Rename uses `window.prompt` to edit `name` (the tax identifier 仕込記号), not `beerName`. Matches HTML. **Asymmetry worth knowing:** right-click rename = tax identifier; meta-bar top input = brand name.
- New `duplicateRecipe(sourceId)` store action. **Fresh `lineageId`** (deliberate divergence from HTML's accidental same-lineage behaviour) — keeps the semantic split clean: "+ New Version" = same lineage, version bump; "Duplicate" = separate beer. Adds " (copy)" suffix, fresh `brewDate = today()`, `brewNum = ''`, `version = '1.0'`, brew-results fields zeroed. Inserts at `idx+1` from source so the copy sits next to its source in the recipe browser.
- Move to folder: numbered `window.prompt` list (matches HTML). Bails politely if no folders defined.
- Delete: confirm with HTML's exact wording, cascades planner-brews removal, closes the open recipe tab if applicable, then `deleteRecipe(id)` (which now also runs orphan cleanup per Phase 3c above).
- Bottom-bar buttons untouched. They keep their HTML-faithful ingredient-scoped behaviour.

Folder right-click context menu (HTML's `#folderCtxMenu`) deliberately not ported — separate concern, future task if folder UX ever needs work.

### Build status
`tsc --noEmit` clean throughout. `vite build` succeeds. No regressions reported.

### Pending verification (carried forward)
- "+ New Version" flow
- DH Split UI on Recipe tab
- Mash Profile modal on Recipe tab — likely already exists per today's mash sync work (CC referenced `MashProfileModal` as wired with `buildProfileBlob`); worth a visual check before assuming.

---

## 2026-05-06 — Brew/Batch rename, Tax Batch # field, three-action brew flow, toast/undo plan

Long session. Multiple CC rounds; everything below shipped except toast/undo (still building at session end) and the recipe-row + Brewery Overview audit (also in flight).

### Decisions
- **Naming, Option C**: Renamed `brewNum` → `taxBatch` (column + ~30 code call sites). Added new `brewNumber` int for per-lineage sequential counter. Cleanest naming, biggest churn — chose it because no real brewery data yet, so column rename was free. Avoids the "Brew #" semantic debt that Option A would have left in place forever.
- **Three-action brew creation**: Single button became primary "+ New Brew" + caret dropdown for "Amounts Changed" (minor bump) and "Ingredients Changed" (major bump). Default plain "+ New Brew" no longer auto-bumps version. From a non-latest source, dropdown variants both jump to the next major from the lineage's latest (e.g. latest v2.3 + source v1.0 → v3.0).
- **"Brew #" terminology kept** (instead of flipping back to "Batch #") despite Ben's recurring slip into "batch" verbally. Logged as something to revisit if the slip persists weeks from now.
- **Recompute pass for old data**: Auto-run on first hydrate after migration, gated by localStorage flag. Walks each lineage chronologically and reassigns `brewNumber` 1, 2, 3, …. Caveat acknowledged: any manually-set `brewNumber` that breaks chronological 1..N ordering gets overwritten — fine for Ben's no-real-data state, would be wrong if real production data ever populates the field semi-manually.
- **Toast position deviation**: Bottom-right (vs HTML's bottom-center) approved — bottom-center would obstruct the bottom-bar buttons (Add to Planner, Delete, Dup).
- **Toast undo via closures**: Caller snapshots `before`, store holds the function reference only. Way simpler than HTML's snapshot-everything approach. Each call site captures only the slices its action touched.
- **Stack cap of 4** for toasts: rapid-fire delete bursts (>4) silently lose oldest undos. Acceptable.

### Process notes
- CC silently skipped the recipe-row layout work in the first batch, even though it was explicitly in the prompt. Re-prompted at session end with the three follow-ups; flagged the pattern as a fatigue signal in long CC sessions.
- One CC response on the navigation-bug debug was rambling and uncertain — fix was already in code, apparent bug was a stale build cache (Ctrl+Shift+R resolved it). Logged as another long-session degradation indicator.
- Suggested workflow for next time: end CC sessions periodically and start fresh with full orientation (read START_HERE.md, CLAUDE.md, relevant component files). Two parallel CC terminals viable when scopes don't overlap.

### Migrations applied
- `2026-05-06_rename_brew_num_to_tax_batch_and_add_brew_number.sql` — column rename + new column + UNIQUE constraint rename + index. Idempotent.

### Tests passed (all green at session end except in-flight items)
- BREW # auto-recompute (was "123", became "1"): ✓
- BREW # pill read-only: ✓
- Tax tab labels updated: ✓
- Meta-bar order rearranged: ✓
- Brew History "Unversioned" bug fix: ✓
- Switch-to-new-recipe (after Ctrl+Shift+R): ✓
- Beer # → Beer Name / Tax Batch # rename: visual confirmation pending

### Carried forward to next session
- Toast/undo build + 8-surface retrofit
- Recipe-row layout + Brewery Overview audit
- Switch-to-new-recipe persistence audit

---

## 2026-05-06 — Brew/Batch rename, Tax Batch # field, three-action brew flow, toast/undo, recipe sidebar reorganization, deletion overhaul

Long session. Multiple CC rounds across two terminals (one for the sidebar reorganization, one for the deletion overhaul). Significant decisions and ports below.

### Decisions
- **Naming, Option C**: Renamed `brewNum` → `taxBatch` (column + ~30 code call sites). Added new `brewNumber` int for per-lineage sequential counter. Cleanest naming, biggest churn — chose it because no real brewery data yet.
- **Three-action brew creation**: Single button became primary "+ New Brew" + caret dropdown for "Amounts Changed" (minor bump) and "Ingredients Changed" (major bump). Default plain "+ New Brew" no longer auto-bumps version. From a non-latest source, dropdown variants both jump to next major from latest.
- **"Brew #" terminology kept** despite Ben's recurring slip into "batch" verbally. Logged to revisit.
- **Recompute pass for old data**: Auto-run on first hydrate, gated by localStorage flag. Walks each lineage chronologically and reassigns brewNumber 1, 2, 3, …
- **Toast position**: bottom-right (vs HTML's bottom-center) — bottom-center would obstruct bottom-bar buttons.
- **Toast undo via closures**: caller snapshots `before`, store holds function reference. Way simpler than HTML's snapshot-everything.
- **Recipe sidebar drag-and-drop + multi-select**: HTML had recipe→folder drag only; React extends to folder reorganization (subfolder, root, reorder) and file-explorer-convention multi-select (Ctrl/Shift). Native HTML5 drag (no library), array-order as source of truth (no new sort field).
- **Folder Delete cascade**: matches HTML — recipes inside become unfiled, subfolders move up one level, never deletes recipes.
- **Two-tier deletion model**: hard delete only allowed on recipes with no committed data (tax_records, tax_master, ferm_log, or non-empty brew_day/ferm_meta/cold_side/water_chem); everything else gets archived. Archive = soft-hide via `archived_at` column, reversible via Restore. Bulk operations always archive.
- **Schema migration for deletion overhaul**: rename `recipes.deleted_at` → `recipes.archived_at`. Implicitly converts existing tombstones to archived (zombie cleanup happens for free).

### Process notes
- CC silently skipped the recipe-row layout work in an early round. Re-prompted at session end with the three follow-ups; flagged as a fatigue signal in long CC sessions.
- One CC response on the navigation-bug debug was rambling and uncertain — fix was already in code, apparent bug was a stale build cache (Ctrl+Shift+R resolved it).
- Two CC terminals run in parallel (one for sidebar reorganization, one for deletion overhaul) without conflict because their file scopes didn't overlap.

### Migrations applied
- `2026-05-06_rename_brew_num_to_tax_batch_and_add_brew_number.sql`
- (Pending — applied next session): `recipes.deleted_at` → `recipes.archived_at` rename + ON DELETE CASCADE on the 6 per-recipe tables that lack it.

### Carried forward to next session
- Deletion overhaul completion (schema migration + 9 code steps)
- Smoke testing all of the above

### Late-session correction: simplified Delete model

Originally built an Archive-based two-tier model (hard delete only on empty drafts; recipes with committed data forced to Archive). After review, simplified to a universal Delete: works on any recipe, hard-removes everything per-recipe, ALWAYS preserves tax_records and tax_master. 8-second toast undo with snapshot-then-restore covering all per-recipe data and planner cascade.

Reasoning: Ben's actual workflow is to keep recipes he brewed (no automated archiving needed) and only delete drafts/experiments. Archive was overengineered.

Kept: schema migration (column renamed, stays NULL), broader snapshot-then-undo pattern, dangling-ref handling in TaxMasterPage and HarvestedYeastView, BrewDayTab/PackagingTab dirtyRef guards.

Removed: archiveRecipe / restoreRecipe actions, hasCommittedData predicate, Archive UI surfaces, Archive-specific badges.
