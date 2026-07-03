## 03 July 2026 (late afternoon) — Analysis Sheet, Print Full Packet, OEM/Collab field

### Analysis Sheet print artifact
New `src/components/recipe/analysisSheetPrint.ts`. A4 portrait, black-on-white. Sections: header (beer name large, style/recipe#/tax batch grid top-right), stats row (brew date, package date, brewer, classification, ABV, batch size, sellable litres, IBU, IBU/SG ratio, price, per litre), cost breakdown, yeast & fermentation (real vs plan table), packaging (kegs/cans/waste + pitch pH/final pH), process notes (aggregated from all sources), tasting notes, changes for next time, analysis notes. All notes sections always render as blank ruled boxes when empty — unconditional, not gated on content. Replaces the old dark-theme DOM print on the Analysis tab (printHtml(node.outerHTML) removed). Handler in `AnalysisTab.tsx` replaced with call to `printAnalysisSheet`. `#analysis-printable` wrapper div removed. Commits: `ba5ec5d` (initial), follow-up fix for unconditional notes sections.

Spec deviations flagged by CC:
- `Settings` type → `BrewSettings` (actual export name)
- `recipe.ibuSg` doesn't exist on Recipe — IBU/SG ratio replicated inline from `calcRecipeStats` formula
- `coldSide['cs-pitch-ph']`/`['cs-final-ph']` don't exist — used `brewDay.pitchPh` and `coldSide['cs-ph']` instead

### Print Full Packet
"Print Full Packet" added to the Print ▾ dropdown in `Desktop.tsx`. Calls `handlePrintPrepSheet`, `handlePrintBrewDaySheet`, `handlePrintFermPackagingSheet` in sequence. Commit: part of same push.

### OEM/Collab/Own Brand recipe origin field
New `RecipeOrigin` type (`'own' | 'collab' | 'oem' | null`) added to `src/types/index.ts`. `recipeOrigin` and `oemFor` fields added to `Recipe` interface. UI in `RecipeTab.tsx`: three toggle buttons (Own Brand / Collab / OEM) on same row as Brewer; conditional partner name input below when Collab or OEM selected. Badge in `FolderTree.tsx` sidebar row for collab/OEM recipes showing type and partner name. Sync wiring in `src/lib/supabase.ts`: `recipeOrigin → recipe_origin`, `oemFor → oem_for` in both `recipeToRow` and `rowToRecipe`. Migration file created: `migrations/2026-07-03-recipe-origin.sql`. **Migration applied to Supabase.** Commits: `39ef19a` + origin button layout fix.

### Key decisions
- Analysis Sheet notes sections always render (blank ruled box when empty) — print sheet must be useful even for recipes with no notes yet.
- OEM/Own Brand badge suppressed in sidebar for Own Brand — not useful information in a list context. Only Collab and OEM show badges.
- Migration SQL provided directly in session rather than relying on CC-generated file — new rule going forward.

---

## 03 July 2026 (afternoon) — Recipe planning fields, DH pH fix, Explorer filtering, Ferm & Packaging sheet

### Recipe-level planning fields
Added six new optional fields to `Recipe` type and Supabase (`migrations/2026-07-03-recipe-planning-fields.sql`): `recipePitchTemp`, `recipeFermTemp`, `recipeO2Lpm`, `recipeO2Time`, `targetFinishPh`, `plannedCarb`. Full round-trip via `rowToRecipe`/`recipeToRow`. UI: pitch/ferm/O₂ fields in the yeast edit modal; target finish pH and planned carb alongside the Extra Additions box on the Recipe tab. Pre-fill: Brew Day tab pre-fills from recipe defaults on recipeId change (useEffect pattern); Ferm and Packaging tabs pre-fill via lazy useState initialiser (key={recipeId} remount pattern). All pre-fills only fire when the destination field is empty. Files: `src/types/index.ts`, `src/lib/supabase.ts`, `src/components/recipe/EditIngredientModal.tsx`, `src/components/recipe/RecipeTab.tsx`, `src/components/recipe/BrewDayTab.tsx`, `src/components/recipe/FermTab.tsx`, `src/components/recipe/PackagingTab.tsx`, `migrations/2026-07-03-recipe-planning-fields.sql`.

### Pitch profile selector in yeast popup
`EditIngredientModal.tsx` yeast section now has a Profile dropdown (rendered when `pitchProfiles.length > 0`) that auto-fills `recipeO2Lpm` and `recipeO2Time` state fields. Note: `PitchProfile` type has no pitch temp or ferm temp fields — those remain manual inputs.

### DH pH calculation bug fix
`calcDhPhPrediction` in `src/lib/calculations.ts` was comparing `currentPh > targetFinalPh` to decide whether to recommend acid, ignoring the predicted DH rise. Fixed: residual is now computed from `predictedFinalPh = currentPh + predictedRise` vs target. `predictedFinalPh` added to return type and object. Commit: part of `bd94391` batch.

### Ferm tab scroll fix
Bottom section div in `FermTab.tsx` (DH buttons + DH pH Prediction + Harvest + Carbonation) had no `overflowY` — content was clipped when DH pH Prediction card expanded. Added `overflowY: 'auto'`.

### Recipe Explorer folder filtering
`RecipeExplorerPanel.tsx` now accepts `selectedFolderId` prop from `Desktop.tsx` (derived from `preview` state). When a folder is selected, `displayedRecipes` filters to that folder and all descendants via `getDescendantFolderIds`. Toggle button shows folder name / "All". Count shows "N of Total recipes" when filtered. `showAll` resets when `selectedFolderId` changes.

### Ferm & Packaging Sheet
New print artifact `src/components/recipe/fermPackagingSheetPrint.ts`. A4 portrait, same CSS/visual language as Brew Day Sheet. Sections: header (beer name, brew #, date, brewer, tank, OG/FG/ABV chips), fermentation log (15-row blank handwriting table + DH date chips), harvest (single-row table), packaging (two-column: dates/readings/carbonation left, volume grid right), notes box. Handler `handlePrintFermPackagingSheet` added to `Desktop.tsx`. "Ferm & Packaging Sheet" added to Print ▾ dropdown. Layout polish deferred.

### Retroactive migration files
Created `migrations/2026-05-12-add-extra-additions.sql` and `migrations/2026-05-12-add-brewer.sql` documenting columns already live in Supabase since May 2026.

### Key decisions
- Recipe-level planning fields use `optional` (undefined) rather than null defaults — consistent with other optional Recipe fields like `brewNumber`.
- Ferm/Packaging pre-fill uses the lazy useState initialiser rather than a useEffect, because both tabs use `key={recipeId}` for remounting — confirmed by reading source files before writing.
- DH pH fix uses `predictedFinalPh` as the baseline for acid calculation, not raw `currentPh` — the brewer's current measurement plus the expected rise is the correct input to the acid recommendation.
- Recipe Explorer filtering is descendant-aware — selecting a parent folder shows recipes in all subfolders too.

---

## 03 July 2026 (evening) — NTA Print Summary, Water Chem Fix

**NTA Submitter — Print All vertical summary**
Print All now uses a new compact layout (`printNtaFormSummary`) — one row per recipe, columns: #, Recipe Name, Tax #, Grains, Hops, Wheat, Oats, Other, Water, Start Plato, Into FV, Packaged, Yeast, ABV, Misc. Target ~50 recipes per A4 portrait page. Print Form (selected recipes) unchanged — still uses `printNtaFormDetailed` (CC1-5610-6 horizontal, 4 per page). File: `src/components/tax/NtaPage.tsx`. Commit: `1714921`.

**NTA water chem exclusion fix**
Phosphoric acid (and other water chem ingredients) were passing through into `ntaNormalise`'s misc list when `use` was set to `'mash'` instead of `'water chemistry'`. The `isWaterChem` function's explicit-use-wins rule blocked the regex fallback. Fix: added `WATER_CHEM_KW.test(m.name || '')` as an unconditional OR in `ntaNormalise`'s misc loop, so the name regex always applies in the NTA path regardless of `use` field. This intentionally diverges from `isWaterChem`'s documented precedence for this one call site. File: `src/lib/nta.ts`. Commit: `8f82a95`.

**Water chem regex — lime removed**
`lime` removed from `WATER_CHEM_KW` in `src/lib/waterChem.ts` to prevent false exclusion of fruit/food ingredients (e.g. "Kaffir Lime"). Calcium hydroxide is still caught by `chalk` and `calcium.*carbonate`. Commit: `8f82a95`.

**Google Cloud credentials (for reference)**
OAuth Client ID: `1069631621980-lr80vo546tjbskkk676cbdt2f2hbbgg7.apps.googleusercontent.com`
Authorised JavaScript origins: `https://brewlab-red.vercel.app` and `https://brewlab-red.vercel.app/`
Account: brewing@nomodachi.com
Project: BrewLab

---

## 03 July 2026 — Google Sheets Sync + NTA Submitter Polish

**Google Sheets OAuth sync**
Built end-to-end Google Sheets integration for the inventory tax ledger. Three workbooks (Malts / Hops / Yeast & Misc), one tab per ingredient. OAuth implicit grant flow — user connects once per device via Settings → Google Sheets. Token stored in `bl_gsheets` (local-only, never syncs to Supabase). Auto-appends on Record Usage confirm and manual Add Entry. Edits push CORRECTION rows with delta qty. Deletes push CORRECTION rows with negative qty. XLSX export untouched. Google Cloud OAuth Client ID: `1069631621980-lr80vo546tjbskkk676cbdt2f2hbbgg7.apps.googleusercontent.com`. Authorised origins: `https://brewlab-red.vercel.app` and `https://brewlab-red.vercel.app/`.

Key files: `src/lib/gsheets.ts`, `src/components/settings/GoogleSheetsSettings.tsx`, `src/components/inventory/LedgerEntryModal.tsx`, `src/components/inventory/LedgerExportModal.tsx`, `src/components/inventory/RecordUsageModal.tsx`.

Commits: `4271b15` (initial build), `60c0e60` (auto-push on entry add/edit/delete, removed manual sync button), `218cb70` (separate EXPORT and SYNC TO SHEETS buttons — later superseded by auto-push approach).

**Tax Ledger XLSX — taxBatch in Beer/Note**
OUT rows now show `taxBatch — beerName` in the Beer/Note column when taxBatch is present. Manual Add Entry rows won't have taxBatch (no field in that form) — only Record Usage entries carry it.

**NTA Submitter improvements**
- Print Form gate: button now only shows when `isChecked && matches.length > 0`
- Register sort: newest-first default, toggle to oldest-first, original indices preserved for delete/detail/print actions
- Print All: prints entire register without checkbox selection

Commit: `5a84757`

**Note:** Monthly XLSX backup script (shell + cron, downloads Sheets as XLSX on 1st of month) deferred to post-launch. Sheet IDs to be confirmed once production data exists.

---

## 03 July 2026 (afternoon) — Inventory polish, Export Selected, Record Usage resolver, Overview reminders

### Commits this session
`3b91dce` → `f14b505` → `c727a5a` → `bd9ffa3` → `3f32351` → `d2e2082` → `118c95d` → `a3e22d0` → `7844310` → `29ba726` → `09a61eb` → `dbb2f58` → `192711e` → `8f7e4f4` (plus the docs/WORKFLOWS.md creation and START_HERE.md handoff commits either side of this range)

### What got built

**Inventory toolbar** — MALTS/HOPS/YEAST/ADJUNCTS/HARVESTED buttons collapsed into a single dropdown matching the Order Planner pattern. CURRENT button removed; TAX LEDGER is now a standalone toggle. Toolbar was too wide and visually cluttered.

**Inventory layout** — page constrained to 1024px max-width, centered, with auto margins. INGREDIENT column capped at 260px with ellipsis truncation and full-name tooltip on hover. Table was stretching full screen width with no visual containment.

**Recurring orders print gap fixed** — `forecastPrint.ts` was calling `deriveTimeline(plannerBrews, orders)` without `recurringOrders`, so printed forecasts were missing recurring delivery columns. Added `recurringOrders` to the function args and passed it through; `OrderPlannerPage.tsx` now pulls `recurringOrders` from the store and passes it to `printForecastTable`.

**Export Selected** — File → Export Selected now exports all highlighted sidebar recipes as a zip file (one BeerXML per recipe) via jszip, replacing a no-op placeholder. Multi-recipe BeerXML in a single file is poorly supported by most apps (BeerSmith etc.), so one file per recipe in a zip is the right approach. jszip installed and imported statically (~95KB bundle addition, accepted since export is a common action). Filename: `brewlab-recipes-N-YYYY-MM-DD.zip` for multiple recipes, or the single-recipe filename with a `.zip` extension for one.

**File menu stay-open bug** — File/View/Libraries/Settings menu items were re-opening their dropdown right after being clicked, because the click bubbled up to the wrapper's `onClick={() => toggleMenu(...)}` and re-toggled it open. Fixed by guarding each wrapper's onClick with `e.target === e.currentTarget` so it only fires on a direct click on the menu label, not on a bubbled click from a dropdown item — cheaper than adding `stopPropagation` to every one of the ~15 menu-dd-item handlers.

**Record Usage — "not in library" resolver** — ingredients that don't fuzzy-match any library entry showed a static warning. Clicking "⚠ not in library — click to fix" now opens an inline resolver panel with a search input filtered to that section's library, plus a "+ Add to library" button. On link: saves `libId` onto the recipe ingredient via `updateIngredient` so `ingNamesMatch` finds it on all future brews. On add: creates a new library entry then auto-links. `e.preventDefault()` added to the resolver's interactive elements (search input, library-entry rows, add button) to stop the parent `<label>` from also toggling the row checkbox.

**Record Usage — checkbox reset bug** — `resolveLink` calling `updateIngredient` triggered a `rows` recompute; `lastRowsRef` detected the change and `setChecked(initialChecked)` wiped every user checkbox selection. Fixed with two changes: (1) stable UIDs based on `section_name` instead of an incrementing counter, so a row's identity survives a recompute; (2) brewId-aware reseed — full reset to defaults only when the brew actually changes, merge-only (add missing UIDs, preserve existing values) when rows change for the same brew.

**Overview recording reminders** — each reminder row now has a clickable brew name (calls `onOpenRecipe`) and a Dismiss button. Dismissed IDs persist to `bl_dismissed_rec_reminders` in localStorage so they don't reappear. Previously reminders were display-only with no way to act on or clear them.

**WORKFLOWS.md updated** — new Workflow 3 (Managing Inventory) added, covering opening balances, recording usage (including the "not in library" resolver), reading the inventory table, Overview reminders, and Export Selected. First line changed from pointing to a separate user manual to stating this doc is the user manual. Workflows 3–7 renumbered to 4–8.

### Key decisions
- File menu bug fixed via an `e.target === e.currentTarget` guard on each wrapper's onClick, not `stopPropagation` on every dropdown item — touches 4 call sites instead of ~15.
- One BeerXML file per recipe in a zip (not one combined multi-recipe XML) for Export Selected — most BeerXML-consuming apps don't handle multi-recipe documents well.
- jszip imported statically rather than dynamically — simpler code; the ~95KB bundle cost was accepted since export is a common action, not a rare one.
- Record Usage row UIDs keyed on `section_name` instead of an incrementing counter so identity survives store-triggered recomputes — required for the checkbox-preservation fix to work at all.

### Noted for future
- Recurring orders print gap and the inventory too-wide layout bug — both carried over from the morning session's pending list — are now fixed.
- If a second bulk-export need arises, "Export Recipe (BeerXML)" and other single-item exports could unify on the same zip helper Export Selected uses.

---

## 03 July 2026 — Recipe UI, sync fixes, Order Planner overhaul, recurring orders

### Commits this session
`ad28b82` → `00fc396` → `539ccf4` → `3b1ba22` → `c00e337` → `cefca99` → `d05b7ac` → `10d6718` (plus several intermediate commits)

### What got built

**hopLib AA% in brew day sheet** — `brewDaySheetPrint.ts` now looks up hop alpha acid from `hopLib` by name and shows an AA% column in the boil additions table.

**Recipe tab UI polish** — ingredient cards background set to `var(--panel)` (theme-aware white in light mode); stat strip gap widened from 8 to 28px; `rp-stat-val`/`rp-stat-label` font-weight dropped from 600 to 400; batch L unit sits flush with the input via flex wrapper.

**boilTime/bhEff/whirlpoolTemp Supabase sync** — `rowToRecipe` was hardcoding 45/67.6/85 for all three fields; `recipeToRow` wasn't writing them at all. Migration `2026-07-03-recipe-process-fields.sql` adds `bh_eff numeric`, `boil_time integer`, `whirlpool_temp integer` to `recipes`. Both functions updated to round-trip correctly. Applied to Supabase before deploy.

**Default bhEff/boilTime on equipment profile** — `EquipmentProfile` gains `defaultBhEff?` and `defaultBoilTime?`. Equipment Profiles panel shows new fields. New recipe creation and BeerXML import read from the active equipment profile. `defaultBhEff` removed from Settings → Advanced where it was briefly added.

**BeerXML import uses system efficiency** — `<EFFICIENCY>` from XML is ignored. `bhEff` comes from equipment profile. OG/FG recalculated from the grain bill at the brewery's efficiency via `computeRecipeStats`.

**Water chem salts on brew day print** — `isWaterChem` returns false for imported ingredients with explicit `use: 'mash'`/`'boil'` (by design for tax). Print sheet now uses `WATER_CHEM_KW` regex directly via a local `isPrintWaterChem` helper that ignores the use field, correctly routing them to mash/sparge salt lines and excluding them from the boil additions table.

**Duplicate recipe bug** — `duplicateRecipe` action: `name: (source.name || '') + ' (copy)'` → `name: ''`. Tax identifier must be blank on duplicate.

**Order Planner toolbar** — section nav collapsed to `<select>` dropdown. Import Library + Import Stock moved to Settings → Order Planner panel. Toolbar now: dropdown | date range | GOOGLE SHEETS | ORDERS | EXPORT XLSX | + NEW ORDER.

**AddOrderModal redesign** — staging area: per-item checkboxes + bulk-assign bar (Select All, supplier, delivery, Apply). ORDER DETAILS: Supplier (fills blanks), Order Date, Notes. CREATE ORDER always visible. Add Manually: Type, Ingredient, Qty, Supplier only.

**OrdersPanel redesign** — grouped by `orderDate`. Header: derived status badge (PENDING/IN PROGRESS/COMPLETE) + delivery range. Per-item checkboxes. Bulk action bar: "Mark as" dropdown + APPLY + deselect. Received = strikethrough. Auto-delete complete groups after 30 days.

**Forecast table** — alternating column tints + `borderRight` dividers between brew column pairs. Date range filter (2w/1m/3m/All, default 1m). Print button via `forecastPrint.ts`. Fixed 120px column width with word-wrap (no mid-word breaks), `table-layout: fixed`.

**Recurring orders** — `RecurringOrder` type. Store slice with `bl_recurring_orders` (syncs via SETTINGS_KEYS). `expandRecurringOrders` generates synthetic delivery columns within 90-day window. Settings → Order Planner: list + form (type, ingredient from library dropdown, qty, supplier, cadence, start/end date, notes). Auto-appears in forecast as delivery columns.

### Key decisions
- Water chem print fix uses `WATER_CHEM_KW` directly (not `isWaterChem`) — preserves the tax exclusion logic which correctly uses the use field, while allowing print to identify by name regardless of use value.
- Equipment profile is the right home for default bhEff/boilTime, not global Settings — each brewhouse has its own efficiency and typical boil duration.
- BeerXML `<EFFICIENCY>` ignored on import — the original brewer's efficiency is meaningless on your system; OG recalculated from grain bill at your efficiency.
- Recurring orders are localStorage-only but synced via SETTINGS_KEYS (same as `bl_orders`) — no dedicated Supabase table needed.
- `forecastPrint.ts` not wired for recurring orders yet — flagged as a gap.

### Noted for future
- OEM/Collab/Own Brand per-recipe field
- Focus mode (full-screen toggle)
- Recurring orders in print forecast

---

# SESSION_LOG entry — 2026-07-02 — Print dropdown, Brew Day Sheet overhaul, NTA match bug fix, NTA print selector, manuals

## Print ▾ dropdown

Replaced the scattered print buttons (one in ActionStack sidebar, one in BrewDayTab bottom strip) with a single Print ▾ dropdown button on the right end of the recipe sub-tab bar in Desktop.tsx. Dropdown contains two items: Prep Sheet and Brew Day Sheet. Both call the existing print handler functions. ActionStack.tsx had the onPrintPrepSheet prop removed; BrewDayTab.tsx had the print button and getWaterChem import removed. Print handlers moved up to Desktop.tsx where they have access to all required data.

CC scope-crept during this task — refactored a useMemo block into a shared function in calculations.ts without being asked, and ran a full app QA test before committing, burning ~15 minutes on a task that should have taken 2. Lesson: prompts need to end with "do not test, do not run the app, commit and push when done" and should specify exact line numbers to avoid exploratory reads.

## Brew Day Sheet layout overhaul (ongoing)

Multiple CC passes iterating on brewDaySheetPrint.ts layout. Changes landed:
- Mash steps: tried horizontal card layout (two steps side by side with Target/Actual columns stacked), then reverted to vertical table per Ben's preference after seeing the output
- Header: OG/FG/ABV restored as target chips labelled "Target OG / FG / ABV"
- Flowmeter start and finish moved into the section header meta line
- Lauter & Sparge: two-column layout — 8-step flowmeter grid on left, runnings (first/last pH + gravity) and pre-boil targets on right
- Boil & Whirlpool: two-column layout — hot-side additions table on left (hops + misc sorted boil→whirlpool→misc), process fields on right condensed to 2 rows. Checkboxes added to additions table. OG target removed from this section.
- Knockout & Pitch: yeast strain + pitch amount moved to section header line; pitch temp / ferm temp / pitch pH condensed to one row
- Efficiency section removed entirely
- Salt additions: mash salts shown below mash section, sparge salts shown in lauter section
- Global spacing tightened to fit one page

Still pending: full one-page fit, grid alignment pass, Pre-trans column equal width fix.

## NTA Submitter match bug fix

Bug: ntaMatchScore was comparing only hop/yeast ratios (hopsKg/maltKg and yeastKg/maltKg). Two recipes with zero hops and zero yeast would always match each other regardless of malt amounts, because the within() helper returned true when y===0 and x===0.

Fix: expanded NtaRatioKey interface to include maltKg, hopsKg, yeastKg, waterL, ogP, abv (dropped the ratio approach entirely). ntaRatioKey() now stores per-1000L values directly. ntaMatchScore() compares all six fields at ±10% tolerance plus exact misc name list match. The within() helper now returns false when one value is zero and the other is not.

Also updated ratioKeyOfSubmission() in NtaPage.tsx to populate all new fields. Removed now-dead hopRatio/yeastRatio reads from handleSubmit(). Docstrings updated to reflect new behavior.

Files: src/lib/nta.ts, src/components/tax/NtaPage.tsx. Commit: c1d86b0.

## NTA Submitter print selector

Print Form button previously printed the entire ntaRegister (all submitted recipes). Replaced with a two-mode UI: clicking Print Form enters selection mode, showing checkboxes on each row of the Submitted Recipes Register. Select All button selects all. Print Selected prints only the checked entries via printNtaForm(selectedEntries). Cancel exits selection mode. Reset state after printing.

File: src/components/tax/NtaPage.tsx. Commit: db8e793.

## User manual + Workflow guide

Drafted two Word documents:
- BrewLab_User_Manual.docx — feature reference, tab by tab, all three devices
- BrewLab_Workflows.docx — step-by-step workflows: creating a recipe, order planning (including receiving deliveries and inventory update), brew day, fermentation, packaging, NTA tax filing, syncing

Both generated via docx npm script. Ben noted the original manual draft was a feature list not a manual — rewritten as step-by-step workflows. NTA submission workflow clarified by reading NtaPage.tsx directly and testing in the live app.

## Bugs flagged this session

- Duplicate recipe inherits Recipe Name (仕込記号): duplicateRecipe store action copies recipe.name from source. NTA Submitter matches by recipe name so duplicates incorrectly show as matching previously submitted recipes. Fix: clear recipe.name in duplicateRecipe the same way brewNum is cleared.
- hopLib in BrewDaySheetInputs: field declared in interface and passed from Desktop.tsx but never read anywhere in brewDaySheetPrint.ts. Was added with intention of showing AA% in boil additions table but never wired. Either add AA% column using hopLib or remove the field.

## NTA improvements flagged

- Dedicated Submitted Recipes view: accessible from menu, shows all submitted recipes sortable by date submitted, with Print All button for when tax office requests full history
- Print Form gate: button should only be available after recipe is marked as submitted for the currently checked recipe

---

## 2026-07-02 — Env catch-up: git + Vercel deploy after 7-week gap

After ~7 weeks away, resumed work on a new Mac. Session was entirely git/env/deploy plumbing, no feature work.

- Discovered 7 sessions of uncommitted code (05-09 late through 05-12) sitting in the working tree. HEAD was at `455c98f` (2026-05-09 evening); everything since was locally saved but never pushed.
- Committed all catch-up work as `438a73a`. Push initially failed (no gh CLI on the new Mac); installed via Homebrew (`brew install gh`), authenticated via `gh auth login`.
- Configured git identity: `nestafett2` / `nestafett2@gmail.com`. First commit landed with the wrong author (`ben@Bens-MacBook-Neo.local`, the pre-config default), causing Vercel Hobby-plan to reject the deploy. Fixed with `git commit --amend --author=` + force-push.
- Vercel build then failed on two TS6133 unused-variable errors introduced 12 May but not caught locally (dev mode is lenient, `tsc -b` in production build is strict): `brewDaySheetPrint.ts:294` unused `recipe` param, `prepSheetPrint.ts:82` unused `fmtInt`. Both fixed (prefix underscore or remove, whichever cleaner).
- Build then hit an ETIMEDOUT reading a `node_modules` file — OneDrive placeholder wasn't materialized. Full `rm -rf node_modules && npm ci` fixed it. Underlying issue: entire project lives inside OneDrive, which is genuinely risky for Git + Node builds. Flagged as a real problem to fix.
- Vercel deploy went green on the third attempt.

Two follow-ups added to START_HERE:
- Move project out of OneDrive (real risk of Git corruption; needs a proper `~/Developer/brewlab` home).
- Write retroactive migration `.sql` files for `recipes.extra_additions` and `recipes.brewer` (both are live in Supabase, doc history is missing).

---

# SESSION_LOG entry — 2026-05-12 — Print artifacts pass: Monthly Report fix + Prep Sheet + Brew Day Sheet + recipe metadata fields (brewer, extra additions)

A substantial session. Three new print artifacts shipped, a fourth (Monthly Packaging Report) fixed in place, two new recipe schema fields added with full Supabase round-trip, and one source-of-truth bug caught and corrected by Ben. The HTML reference's 10 print paths are now confirmed all ported. Several reusable lessons surfaced — baking them in here so future sessions don't re-litigate.

## Print port verification — function-name grep is misleading; calc-fingerprint grep isn't

The session opened with the question: were all HTML print functions actually ported, or had some been silently dropped? First-pass grep for HTML function names (`printTaxRecord`, `printTaxSummary`, `printTaxMasterTab`, `printMonthlyReport`, `printAnalysis`, `ntaPrintForm`, `printTariffPlanner`, `printNeekyuuHyo`, `printOrderList`, `printYearlySchedule`, `window.print`) showed several names absent — but the absence was misleading. The porter restructured features during the rebuild: Monthly Report became a sub-tab of Tax Master rather than its own page. Function-name grep doesn't account for that.

Follow-up grep on the calculation fingerprint — the four waste-calc fields `fvBtWaste`, `totalWastePkg`, `kegWaste`, `flowmeterWaste` used together — found the feature alive in `src/components/tax/TaxMasterPage.tsx`'s `TotalSubTab`. **Lesson for future sessions:** when verifying "is feature X ported?", grep for the calculation fingerprint (the field names the feature must mention to function), not the function name. Function names get renamed during restructures; the calc inputs are load-bearing and don't.

Verdict: all 10 HTML print paths ported. But the Monthly Report sub-tab DID have a print-path bug worth fixing.

## Monthly Packaging Report print path fix

`TaxMasterPage.tsx`'s `printSubTab` was special-casing nothing — every sub-tab routed through the same flat-table dumper. For Brew & Fermentation and Conditioning that was correct, but the Total sub-tab needed the per-month block layout that the HTML reference produced: one `<div>` per packaging month with table + sidebar, separated by `page-break-inside: avoid`, plus an "UNSCHEDULED" section for batches missing a pkg date, plus the date range carried into the H1 and title.

**Fix shape.** `handlePrint` now dispatches `activeSubTab === 'total'` to a new `printMonthlyReport(rows, dateFrom, dateTo)`; the existing `printSubTab` signature narrowed to `'brew' | 'cond'`. Extracted `groupRowsByMonth()` to module scope so the on-screen `TotalSubTab` (via `useMemo`) and the print builder use the same grouping — they agree by construction rather than by accident.

**Sidebar metrics** computed locally in the print builder rather than borrowed from `MonthSummaryCard`. The on-screen card splits Beer/Happoshu by COUNT (units of kegs/cans); the HTML print sidebar splits by LITRES (`sellKegL`, `sellCanL`, `sellTotal`). Same source fields on `DerivedRow`, different aggregations. The on-screen `MonthSummaryCard` is untouched.

**"UNSCHEDULED" renamed to "NO PACKAGE DATE"** everywhere (Ben's call — more specific than "MISSING DATES" or the abstract "UNSCHEDULED"). Applied to both the on-screen `TotalSubTab` and the print so they stay in lockstep. Internal variable name `unscheduledRows` + CSS class `.unscheduled-label` deliberately not renamed — they have no user-visible impact and renaming would churn the diff. Flagged as a low-priority code-cleanup follow-up.

**Per-block auto-suppress yellow Happoshu row highlight** added to the print path only. `#FFF8C4` soft amber/cream, `print-color-adjust: exact` for Chrome PDF rendering without forcing the user to toggle "background graphics" in the print dialog. The auto-suppress logic uses `mRows.some(r => r.isBeer)` — a row gets the highlight class only if (a) it's Happoshu and (b) its containing block has at least one Beer row. Per-block, not per-report — Feb can highlight while an all-Happoshu Mar wouldn't. Ben's reasoning: an explicit toggle felt unnecessary if the only reason to want one was the all-Happoshu edge case, so encoded that edge as auto-suppress instead.

**A3 landscape kept** — matches the other two Tax Master sub-tab prints, and the 19-column row demands the wider page. Ben deferred the A4 question until he's seen real output on paper. Parked as pending.

## Fake-data fixture for testing without production data

New `fake-monthly-report-data.json` at project root (17 KB) + reproducible generator at `brewlab/scripts/gen-fake-monthly-report-data.mjs`. Eight brews #432–439 with Japanese craft names spanning Feb/Mar/Apr 2026: 6 Beer + 2 Happoshu (one Happoshu packaged into each of Feb and Mar so the sidebar split is testable in both blocks), 2 unscheduled (both Beer so the NO PACKAGE DATE block sidebar shows a no-split case). One intentional outlier brew — Goro Pilsner with 5.4% FV→BT loss — exercises the high-waste rendering path. Mixed 350 ml and 500 ml cans. `snap-*` fields populated directly (deliberate bypass of `buildSnapshot` — this is fixture data, not a real flow test).

`.gitignore` updated for `fake-*.json` and `brewlab-backup-*.json` patterns. Imported via Settings → Import Backup — the existing import path wipes `bl_*` keys, scrubs Supabase URL/anon key from `bl_brew_settings`, and puts the app into local-only boot mode so the test data isn't immediately stomped by a Supabase pull. Round-trip verified.

## Prep Sheet print — new A4 brewer's prep artifact

New `src/components/recipe/prepSheetPrint.ts`. A4 portrait, 10 mm margins, 12 px body / 11 px labels / 18 px header. Designed across five mockup iterations with Ben.

**Section order is mill-first**: header + targets stripe (OG/FG/ABV/IBU/SRM chips) → fermentables (with "MILL FIRST" label — first physical task on prep day) → water (strike/mash/sparge grid + mineral profile + salt additions inline) → hops & boil → yeast (single inline row — Ben specifically did NOT want the full pitch math chain; one strain + pitch amount + pitch temp is enough) → extra additions (free-text, suppressed entirely when empty — no ghost header on an empty section).

**Soft amber/cream target chips** (`#FFF4D9` background, `#E8D89E` border, weight 500, `print-color-adjust: exact`). No row dividers in tables — header underline only. Ben's preference for visual density. Salt additions inline-suppressed when all zero ("No salt additions." italic note rather than blank space). Grain types inlined as `"210 kg (all malt)"` rather than a separate 6-col grid — keeps the section tight.

**Yeast section uses an honest harvested display.** When the strain has positive harvest balance, shows e.g. `"10 L harvested (short 27% — supplement w/ fresh)"` in amber-red if short, or `"10 L harvested · sufficient"` muted green if enough. Doesn't fabricate a top-up amount the brewer hasn't planned. Suppressed entirely when no harvest data exists or when the pitch unit isn't litres (no slurry semantics for dry/packet yeast).

**Whirlpool section dropped** — Ben's call: belongs on the brew day sheet, not the prep sheet. Prep is what the brewer does the night before / morning of, before whirlpool happens.

Button: Recipe tab → ActionStack → TOOLS group, after "Add to Planner", with the 🖨 icon.

## Brew Day Sheet print — new A4 handwriting sheet

New `src/components/recipe/brewDaySheetPrint.ts`. Same A4 / 10 mm / 12 px shape as the prep sheet but with " · brew day" suffix on the beer-name H1. Drops IBU + SRM from the targets row (irrelevant mid-brew). Designed by following Ben's existing Excel-sheet-2 layout, then converted to chronological brew order.

**Six sections**: mash (with measurement grid) → lauter & sparge → boil & whirlpool → knockout & pitch → efficiency → notes.

**Mash measurement grid**: 4 rows (Temp/pH/Gravity/Notes) × 6 cols (5 unlabeled + 1 "Pre-trans" rightmost). Ben picked 5 cols as a compromise between his Excel's ~8 fixed slots and a fully dynamic per-step grid. The on-screen Brew Day tab uses the same 5+pre-trans shape, so the print mirrors it.

**8-step sparge flowmeter tracker** — matches Ben's existing Excel verbatim: start sparge / finish sparge / after underlet / after grain rinse / sparge amount (target chip from `targets.spargeVolL`) / extra used (= 2 − 1) / need sparge (= 4 − 5) / finish # (= 3 + 6). Formula hints printed inline so the brewer doesn't have to remember which subtraction gives which. Ben explicitly said keep all 8 when Claude Code tried to collapse it to one notes line.

**Two distinct blank styles**, deliberately. **Inline underlines** (`border-bottom: 1px solid #999`, configurable `min-width`) for short fields like "Flowmeter start". **Bordered empty cells** (`height: 24px`, `border: 1px solid #ccc`) for the grid-style mash measurement section. Two visual languages so the brewer's eye learns which kind to fill in.

**Notes box** with feint horizontal stripes via CSS `repeating-linear-gradient` — keeps handwriting tracking straight without needing ruled paper. Claude Code embellishment, Ben kept it. `page-break-inside: avoid` per section. Single-column layout throughout (single-handed brewer writing on the floor — column packing fights handwriting density).

Button: Brew Day tab bottom action strip, next to "📝 Record Usage". Disabled when `targets` haven't computed (brand-new recipe with no batch size).

## Two new recipe schema fields — extraAdditions + brewer

Both needed by the new print sheets but worth separate fields rather than abusing `notes`.

**`extraAdditions`** (free-text additions field). Ben chose this over a structured cellar-additions schema. Simpler, no schema design for typed entries, brewer types what they need. The textarea on the Recipe tab sits between the ingredient cards and the bottom panel row, with an example placeholder ("e.g. orange peel @ 5 min · coriander @ flameout · vanilla bean during DH"). Suppressed entirely from the print sheet — section header included — when the trimmed value is empty.

**`brewer`** (per-recipe brewer name). Ben chose per-recipe over per-brew-day for simplicity at his current scale (small brewery, mostly one brewer). Per-brew-day would be more flexible if multiple brewers ever brew the same recipe — explicit decision worth re-examining if scale grows. UI is a slim header row at the top of the Recipe tab (label "BREWER" + transparent-background input with bottom-border underline — sits as recipe meta, not as a process input). Placeholder shows the brewery-wide setting as the default fallback.

**Two SQL migrations applied today** (`recipes.extra_additions` and `recipes.brewer`, both `text NOT NULL DEFAULT ''`). Fields seeded in all four recipe-creation paths: `createRecipeFromTemplate` (store), BeerXML import (`Desktop.tsx`), blank-recipe path (`NewRecipeModal.tsx`); `createNewVersion` and `duplicateRecipe` inherit via `...source` spread.

**Sync pattern: ship safe, then flip.** Initially implemented with the asymmetric read-but-don't-write pattern (read with empty-string fallback in `rowToRecipe`, omit from `recipeToRow` to avoid PGRST204 on devices that hadn't yet pulled the migration). After Ben confirmed the SQL was applied to Supabase, flipped to full read+write: `extra_additions: r.extraAdditions || ''` and `brewer: r.brewer || ''` added to `recipeToRow`. Both fields now round-trip across devices. JSDoc on the Recipe interface updated to drop the "Local-only for now" language.

Both prints fall back: `recipe.brewer || settings.breweryName || "—"`.

## Ferm/pitch temp field-source bug — naming-implies-semantic trap

Claude Code's initial brew day sheet implementation derived the ferm-temp target from yeast-library `temp_min`/`temp_max` midpoint. Wrong for Ben's recipes — e.g. Minatoyama Lager has 18 °C planned ferm temp, but the W-34/70 yeast-lib midpoint would be ~13.5 °C. The library is a generic floor/ceiling; the recipe-level setpoint is the brewer's actual plan, and it ought to be the source of truth on the print.

Ben corrected: **`BrewDayData.fermTemp` and `BrewDayData.pitchTemp` are PLANNED targets** (the brewer's chosen setpoints), not recorded measurements as Claude Code had assumed from the field names. The naming was misleading — both live on the brew-day blob alongside actual measurements like `postboilL` and `measOg`, but their semantics differ (target vs measured).

**Fix:** rewired `brewDaySheetPrint.ts` to read `brewDay.fermTemp` and `brewDay.pitchTemp` as the primary source for both target chips, with yeast-lib derivation as fallback (yeast-lib midpoint for ferm; yeast-lib min — already what `targets.targetPitchTempC` carries — for pitch). Verified `prepSheetPrint.ts` was already doing this for pitch temp; only the variable name + comment misframed it as "input/actual". Renamed `pitchTempInput` → `bdPitchTarget` and updated the comment to flag the planned-target semantic.

**Lesson for future sessions:** when designing print sheets that depend on data fields, grep for the field first before writing the spec. Don't assume the field name implies its semantic. Brew day fields named `xxxTemp` are a mix of planned setpoints (`pitchTemp`, `fermTemp`) and actual measurements (`postboilL` is volume but the temperature pattern in this blob is consistently planned) — name alone doesn't disambiguate. Read the surrounding usage or ask Ben.

## Compile

`npx tsc --noEmit`: clean across every change.

## Files touched

New: `src/components/recipe/prepSheetPrint.ts`, `src/components/recipe/brewDaySheetPrint.ts`, `brewlab/scripts/gen-fake-monthly-report-data.mjs`, `fake-monthly-report-data.json` (project root, gitignored).

Edited: `src/types/index.ts` (+ `extraAdditions`, `+ brewer`), `src/lib/supabase.ts` (`rowToRecipe` reads + `recipeToRow` writes, both fields), `src/store/index.ts` (seed `extraAdditions: ''` + `brewer: ''` in `createRecipeFromTemplate`), `src/pages/Desktop.tsx` (seed in BeerXML import), `src/components/recipe/NewRecipeModal.tsx` (seed in blank-recipe path), `src/components/recipe/RecipeTab.tsx` (Brewer input + Extra additions textarea + prep sheet handler + ActionStack wiring), `src/components/recipe/ActionStack.tsx` (Print Prep Sheet button), `src/components/recipe/BrewDayTab.tsx` (Print Brew Day Sheet button + handler), `src/components/tax/TaxMasterPage.tsx` (Monthly Report print path: `printMonthlyReport` + `groupRowsByMonth` + Happoshu highlight + NO PACKAGE DATE rename + signature narrow), `.gitignore` (fixture + backup patterns).

---

# SESSION_LOG entry — 2026-05-09 (late, follow-up 4) — Numeric display formatting policy + `fmtNum` helper

End-of-port polish batch. Single shared formatter for all numeric display, plus three policy decisions baked into the helper's docstring so future sessions don't have to re-litigate.

## Helper

`src/lib/format.ts:fmtNum(n, opts?)`. Default behaviour: cap at 3 decimal places, strip trailing zeros (`9.2000001 → "9.2"`, `5000.000 → "5000"`, `0.123456 → "0.123"`). Force exact precision via `{ dp: N }` for column-aligned tables and regulatory display where stripping would clobber alignment. `null`/`undefined`/`NaN` returns `'—'` by default; override with `fallback`.

**Suffix is verbatim** (caller controls separator). I started with auto-spacing logic ("kg" → "5 kg", "%" → "5%") but the BrewDay cached strings need `' %'` with a space and the percent-prefix special case made the API ambiguous. Verbatim is explicit: pass `' kg'` for "5.4 kg", `'%'` for "5.4%", `' °C'` for "5.4 °C". Caught early; everything else followed cleanly.

## Three policy decisions (locked in)

These live in the `fmtNum` docstring + this entry so future sessions don't redebate them.

1. **ABV is always 1 dp app-wide.** `fmtNum(v, { dp: 1, suffix: '%' })`. Applied at: `RecipeTab` totals strip, `RecipePreview` stat tile, `AnalysisTab` est+meas, `PackagingTab` final readings, `EditIngredientModal` stats panel, `AddIngredientModal` stats panel, `StyleSummaryPanel` range bar, `StyleGuideModal` comparison row, `HistoryTab.fmtAbv`. HTML reference was inconsistent (some sites 1 dp, others 2); React picks 1 across the board.

2. **Column-aligned displays force precision through the helper, don't strip.** Routes through `fmtNum({ dp: N })` so null/NaN handling is centralized but visible output is identical to the prior `.toFixed(N)`. Applied to: `IngredientCard` IBU/pct columns (1 dp), `HarvestedYeastView` running balance / got / used columns (1 dp), `BreweryOverviewPanel` pivot cells (1 dp), `StyleSummaryPanel` + `StyleGuideModal` range bars (1–2 dp), all `BrewDayTab` calc card values (1–2 dp), `WaterTab` ion / mineral / pH columns (0–2 dp), `PackagingTab` `fmt1` helper, `FermTab` daily-log readings + DH-pred values, `MashProfileModal.f1`. The BrewDay cached strings (cross-device read mirror in `bl_bd_<id>` blob) likewise route through the helper at the same precision, so caches and live UI stay in lockstep.

3. **Regulatory / persistence / inputs / charts are exempt.** Untouched: `lib/tax.ts` (29 toFixed sites — pre-storage canonical strings written into `tax_records`), all `tax/*` files (NTA / TaxMaster / TaxSummary regulatory display), all `tariff/*` files (TRQ / Neekyuu / annual planner / tariffPrint), `lib/units.ts` and `lib/utils.ts:fmtAmt` (unit-driven helpers — their semantics are the spec), `libraryImport`/`libraryExport`/`recipeImport` (BeerXML / BSMX canonicalisation), `FermChart` canvas axis labels (chart-render code), input-bound mirrors `GrainPctModal` / `HopIbuModal amtStr/ibuStr` / `EditIngredientModal:81` slurry input / `DryHopModal` planned-g / `DhSplitModal` validation toast text and totals (precision must match the input field as the user types so values don't flicker mid-edit).

## Consolidated four hand-rolled strip-zeros sites

- `LibrariesPage.tsx:640` — `n.toFixed(1).replace(/\.0$/, '')` → `fmtNum(parseFloat(v), { fallback: v })`
- `CurrentStockTable.tsx:277` — same shape, same fix
- `LibraryEntryModal.tsx:266–268` (local `fmtKg`) — deleted; `fmtNum(onHandKg, { fallback: '0' })` at the call site
- `HistoryTab.tsx:86–87` (local `fmtNum`) — deleted; call sites now do `r.ibu > 0 ? fmtNum(r.ibu, { dp: 0 }) : '—'` inline (preserves the `> 0` guard the local helper had — the shared helper returns `'0'` for zero, but for IBU/EBC display zero means "not computed" so we keep the dash). `fmtAbv` rewritten to use `fmtNum({ dp: 1, suffix: '%' })`.

## Files touched

New: `src/lib/format.ts`.

Edited (~22):
- `pages/Desktop.tsx`
- `recipe/RecipeTab.tsx`, `RecipePreview.tsx`, `IngredientCard.tsx`, `StyleSummaryPanel.tsx`, `StyleGuideModal.tsx`, `BrewDayTab.tsx`, `WaterTab.tsx`, `PackagingTab.tsx`, `FermTab.tsx`, `MashProfileModal.tsx`, `AnalysisTab.tsx`, `EditIngredientModal.tsx`, `AddIngredientModal.tsx`, `HopIbuModal.tsx`, `BreweryOverviewPanel.tsx`, `HistoryTab.tsx`
- `inventory/CurrentStockTable.tsx`, `HarvestedYeastView.tsx`, `HarvestYeastModal.tsx`, `UseHarvestedYeastModal.tsx`
- `libraries/LibrariesPage.tsx`, `LibraryEntryModal.tsx`
- `orders/AddOrderModal.tsx`

## Compile

`npx tsc -b --force` after wiping both `tsconfig.*.tsbuildinfo` files: clean.

## Unexpected discoveries flagged

- **BrewDayTab caches display strings into the `bl_bd_<id>` blob** (lines 215–225) so tablet/mobile read the same numbers without recomputing. Stayed as `dp: 1`/`dp: 2` forced — these strings are the cross-device source of truth for non-active recipes, must match the live UI exactly. Caches and live UI now both route through `fmtNum`, so they can't drift.
- **PackagingTab caches a single computed value** (`'cs-liters-bt-saved'`) into `bl_cold_<id>` for Tax Master read. Stored as a number, not a formatted string; not affected by this batch.
- **`AddIngredientModal` has 21 `.toFixed` sites** — by far the densest. Most are display (stats panel + yeast harvest labels + cells/Billion math); five are input-bound writes (`setExtra`, `setAtten`, `setSlurryL`) that stay as `.toFixed`.
- **`HistoryTab`'s old local `fmtNum` returned `'—'` for `n <= 0`**, not just for null/NaN. The shared helper returns the actual zero string. For IBU/EBC where 0 means "not computed yet", I preserved the `> 0` guard at the call site; existing semantics intact.

---

# SESSION_LOG entry — 2026-05-09 (late, follow-up 3) — Toast/undo retrofit + per-recipe blob coverage

End-of-port polish batch. Replaced `window.alert` / `window.confirm` placeholders across ~30 files with the existing toast/undo system, added undo coverage to destructive actions on the per-recipe blobs, and dropped redundant confirm gates on every action that already toasts with undo.

## What was already there

The toast/undo infrastructure was already shipped before this session — `src/lib/toast.ts`, the `pushToast` / `dismissToast` / `popUndoById` / `popMostRecentUndo` actions in `store/index.ts`, the bottom-right `ToastContainer` mounted in `App.tsx`, the persistent topbar `UndoButton`, and the global Ctrl+Z keydown handler. The React system is strictly richer than HTML's `showUndoToast` / `undoPush` (HTML had only ephemeral status toasts plus a single global state-snapshot stack; React has per-action closures, per-toast Undo buttons, `undoHistory` decoupled from toast lifetime, and Ctrl+Z that doesn't snapshot the whole world). Plan therefore: zero new infrastructure, pure retrofit.

## Carve-outs (kept as `window.confirm` per Ben's call)

- **`Desktop.tsx:590` — single-recipe delete.** Cascade hits 6+ blob tables; the 8 s undo window isn't enough margin for a misclick.
- **`LibrariesPage.tsx:294` — bulk library delete.** Bulk ops with large N deserve the explicit gate.
- **Plus a self-flagged extension: `Desktop.tsx:490` — bulk recipe delete.** The same two reasons (cascade + bulk-with-large-N) apply doubly. Wasn't in Ben's explicit carve-out list but I retained the confirm conservatively. Flagged for an explicit override next session if Ben wants it dropped.

## Scope cut (per Ben's call)

- **MashProfileModal `handleSave` undo — SKIP.** Save is an update, not destruction. Undo on every save would be noise. (Modal's `handleReset` and library-level `handleSaveAsProfile` are unaffected — Reset got toast+undo on form-state restore, library save got an alert→toast conversion.)

## Untouched (intentional friction — ConnectionPanel double-confirm, sync-time prompt, three NTA gates)

- `ConnectionPanel.tsx:47–48, 51` — Reset All Data double-confirm + final notice (wipes Supabase across all devices).
- `store/index.ts:1671` — pending ferm log deletion sync prompt (not a UI action — sync-time decision flow).
- `TaxTab.tsx:94, 108, 110` — three NTA tax-record gates (overwrite manually-edited fields / blanks / overwrite filed record). Legal/compliance friction stays.

## Per-recipe blob coverage added

The 7 per-recipe blobs from `supabase.ts:PER_RECIPE_KEY_PREFIXES` (excluding the local-only `bl_checklist_` and the row-keyed `bl_ferm_log_`):

| # | Blob | Destructive surface | Result |
|---|---|---|---|
| 1 | `bl_recipe_ings_` | RecipeTab delete/duplicate | already toast+undo (kept) |
| 2 | `bl_bd_` | none — same component reads & writes | no coverage needed |
| 3 | `bl_ferm_meta_` | DryHopModal slot delete | **new toast+undo** in `FermTab.handleDhDelete` |
| 4 | `bl_cold_` | none | no coverage needed |
| 5 | `bl_water_chem_` | WaterTab Clear | **new toast+undo** capturing the full `WaterChemData` |
| 6 | `bl_recipe_profiles_` | profile dropdowns (selection swap, not destruction) | no coverage needed |
| 7 | `bl_mash_` | MashProfileModal Reset | **new toast+undo** restoring `ratio` / `steps` / `notes` form state |

Plus `bl_ferm_log_` row delete in `FermTab.handleDeleteEntry` got new toast+undo (HTML had no undo there). Touched but **not** new behaviour: Desktop bulk recipe delete already had a toast+undo before this batch — confirm gate retained per the carve-out reasoning above.

## Other notable changes

- **`store.setNtaRegister` action added** so the NTA submission removal undo can restore the full register at the original indices. The existing `addNtaSubmission` / `deleteNtaSubmission` work index-based; this gives the closure a clean restore path.
- **Recipe-tab validation alerts** (`Select an ingredient first.`, `No grains in recipe.`, etc.) → `pushToast({ variant: 'info' })`. Errors (`Carrageenan not found in misc library.`) → `variant: 'error'`.
- **Helper modules** (`lib/print.ts`, `tariff/tariffPrint.ts`, `orders/orderXlsx.ts`) reach the toast via `useStore.getState().pushToast(...)` — these are pure functions, not components.
- **Unexpected discovery — `RecipeTab.tsx:461`** had a stub `alert('Scale Recipe not yet ported.')` for the unported Scale Recipe modal; converted to a `pushToast` info. The feature itself is still unported — flagged in the File-menu placeholder list.

## Files touched (29)

Pages / containers: `pages/Desktop.tsx`, `App.tsx` (no changes — already wired).

Recipe area: `RecipeTab.tsx`, `WaterTab.tsx`, `MashProfileModal.tsx`, `DryHopModal.tsx`, `FermTab.tsx`, `FermEntryModal.tsx`, `DhSplitModal.tsx`, `AddIngredientModal.tsx`, `AnalysisTab.tsx`, `NewRecipeModal.tsx`.

Planner / Notes / Libraries / Inventory: `planner/AddBrewModal.tsx`, `planner/YearlyModal.tsx`, `notes/NotesPage.tsx`, `libraries/LibrariesPage.tsx`, `inventory/HarvestedYeastView.tsx`, `inventory/HarvestYeastModal.tsx`, `inventory/UseHarvestedYeastModal.tsx`, `inventory/InventoryPage.tsx`, `inventory/InventoryCorrectionModal.tsx`, `inventory/LedgerEntryModal.tsx`, `inventory/LedgerExportModal.tsx`, `inventory/RecordUsageModal.tsx`.

Settings: `MashProfilesPanel.tsx`, `WaterProfilesPanel.tsx`, `EquipmentProfilesPanel.tsx`, `PitchProfilesPanel.tsx`, `StylesPanel.tsx`, `TanksPanel.tsx`.

Tax / Tariff: `tax/TaxTab.tsx`, `tax/TaxMasterPage.tsx`, `tax/NtaPage.tsx`, `tariff/ReservationsTab.tsx`, `tariff/TariffReductionPage.tsx`, `tariff/tariffPrint.ts`.

Orders / helpers: `orders/AddOrderModal.tsx`, `orders/OrderPlannerPage.tsx`, `orders/orderXlsx.ts`, `lib/print.ts`.

Store: `store/index.ts` — added `setNtaRegister` action.

## Compile

`npx tsc -b --force` after wiping both `tsconfig.*.tsbuildinfo` files: clean. Both `tsconfig.app.json` and `tsconfig.node.json` rebuilt with zero diagnostics.

---

# SESSION_LOG entry — 2026-05-09 (late, follow-up 2) — `malted` column migration + React wire-up

Short follow-up after applying `migrations/2026-05-04_add_malted_column.sql` to Supabase. The column was previously deliberately excluded from the `recipe_ingredients` row payload because writing it unconditionally produced PGRST204 on databases that hadn't yet run the migration. With the column present, per-row `Ingredient.malted` overrides now round-trip across devices instead of having to be re-derived from `MaltLib.malted` at recipe-edit time.

**`lib/supabase.ts` changes**

- `ingToRow` (~line 1004): added `malted: ing.malted === undefined ? null : ing.malted,` to the row payload. The `undefined → NULL` mapping lets the column's `DEFAULT true` apply for ingredients pulled from the library (the typical case — `Ingredient.malted` is only set explicitly when the user toggles the per-row checkbox in `EditIngredientModal`). Explicit `true` and `false` round-trip directly. Replaced the long deliberate-exclusion comment block above the function body with a short rationale block pointing at the same callers (`pullIngredientTotals`, `ntaNormalise`) and noting the read-side semantics for legacy rows.
- `rowToIng` (~line 1015): unchanged — already had the right shape (`null/undefined → undefined`, explicit `Boolean(...)` otherwise). Verified before editing.

**Why undefined → NULL, not undefined → true**

NULL on insert lets the column's `DEFAULT true` materialise the row at the new default. Writing literal `true` would mask future schema changes (if the default ever shifts to false for some unmalted-by-default convention, NULL-on-write rows would track the new default; literal-true rows wouldn't). The migration's header comment specified this exact form for that reason.

**Compile**

`npx tsc -b --force` after wiping both `tsconfig.*.tsbuildinfo` files: clean.

---

# SESSION_LOG entry — 2026-05-09 (late, follow-up) — Audit + four-bug batch (LIB_HEADERS.misc, dead Save Recipe, mash profile cross-component invalidation)

A short follow-up session. Re-audited `START_HERE.md`'s pending lists against the live source after the morning's sync-layer rebuild, then shipped four small bugs identified by the audit.

## Audit findings

Ten sync keys flagged as "missing from sbSet" in `START_HERE.md` are all wired — confirmed in `lib/supabase.ts`: `bl_mash_<id>` and `bl_recipe_profiles_<id>` get dedicated JSONB blob branches; `bl_tariff_<year>` matches via the new `SETTINGS_KEY_PREFIXES`; `bl_nta_register / bl_nta_basis_current / bl_nta_basis_default / bl_templates / bl_equipment / bl_yearly / bl_suppliers` are all in `SETTINGS_KEYS`. The "13 stale TS errors" claim is also stale — `npx tsc -b --force` after deleting both `node_modules/.tmp/tsconfig.*.tsbuildinfo` files exits clean with zero diagnostics. Three pre-existing bugs were confirmed still present: LIB_HEADERS/FIELDS misc length mismatch, `BrewDayTab.mashProfile` `useMemo([recipeId])` stale dep, and `WaterTab` passing literal `null` to `calcBrewDayTargets`. The "Dead Save button on recipe meta-bar" turned out to be loose terminology — the meta-bar uses live `updateRecipe` on every input and has no Save at all; the actual dead Save was the File-menu "Save Recipe" item with `onClick={closeMenus}`.

## Bug 1 — `LIB_HEADERS.misc` Price column

`LIB_FIELDS.misc` has six entries (`name, misc_type, use, happoshu_trigger, price, notes`); `LIB_HEADERS.misc` had only five (`Name, Type, Use, Happoshu, Notes`). `LibrariesPage.tsx`'s table renderer zips them positionally, so the Notes header sat above the Price column and the Notes column had no header. Inserted `'Price ¥/kg'` between `'Happoshu'` and `'Notes'` to match the malts/hops convention. Removed the now-stale comment in `LibrariesPage.tsx` that documented the mismatch.

## Bug 2 — Dead "Save Recipe" File menu item

`Desktop.tsx:652` — `<div className="menu-dd-item" onClick={closeMenus}>Save Recipe</div>`. Recipe edits autosave via live `updateRecipe` on every input, so the menu item was a no-op (just dismissed the dropdown). Removed the div + the redundant `menu-dd-sep` immediately below it (would have left two consecutive separators). The remaining single divider sits between the Import group and the Export group — a sensible boundary.

## Bugs 3+4 — Mash profile cross-component invalidation

`MashProfileModal` writes `bl_mash_<id>` directly via `lsSet`. The readers (`BrewDayTab` + `WaterTab`) cached the value from localStorage on mount and didn't refresh — `BrewDayTab` via `useMemo([recipeId])` (no LS subscription); `WaterTab` via a `useState` lazy initializer (only runs once) AND it was passing literal `null` for `mashProfile` instead of threading the actual value through.

### Pattern audit before fix

Checked three mechanisms before designing the fix:
- **Existing Zustand slice for `bl_mash_<id>`** — none. The store has `mashProfiles` (the global library) and `RecipeDeleteSnapshot.mash` (used only by capture/restore), but no reactive per-recipe map.
- **Window event / pub-sub on `lsSet`** — none. `storage.ts:31–34` is just `lsLocal + sbDispatch`.
- **Same-pattern solution elsewhere** — yes, `recipeProfilesByRecipe` (`store/index.ts:206, 1224–1254`). The other per-recipe blobs (brew_day / ferm_meta / cold_side / water_chem) don't have this problem because the same component reads and writes them — no cross-component invalidation needed. The mash blob is unique because the writer (`MashProfileModal`) is decoupled from its readers.

### Fix — added `mashByRecipe` Zustand slice

`store/index.ts`:
- New `mashByRecipe: Record<string, MashProfile | null>` field on `BrewLabState`. `undefined` = not yet loaded; `null` = loaded, no saved profile.
- `getMash(recipeId)` — lazy-cache getter mirroring `getRecipeProfiles`. Returns cached value, or reads from LS and seeds the cache via `setTimeout` (avoids set-during-render).
- `setMash(recipeId, profile)` — `lsSet` + `set({ mashByRecipe: { ...current, [recipeId]: profile } })`. Every subscriber re-renders.
- Hard-delete path: pluck `[id]` from `mashByRecipe` alongside the other `*ByRecipe` maps.
- Hydrate reset: clear `mashByRecipe: {}` so post-hydrate access re-reads from the freshly-hydrated localStorage.
- Snapshot capture: prefer the cached map value, fall back to LS read (matches the `recipeProfiles` capture pattern).
- Snapshot restore: seed `mashNext` so post-restore consumers see the value without a remount.
- Tightened `RecipeDeleteSnapshot.mash` from `unknown` → `MashProfile | null`.

`MashProfileModal.tsx`:
- Pull `getMash` and `setMash` from the store. Drop the `lsGet/lsSet` import.
- `initial` `useMemo` reads via `getMash(recipeId)` (also seeds the cache for any subscriber that opens after the modal).
- `handleSave` calls `setMash(recipeId, buildProfileBlob())` instead of `lsSet`.

`BrewDayTab.tsx`:
- Replaced the `useMemo([recipeId])` + `lsGet` with a Zustand subscription: `useStore(s => s.mashByRecipe[recipeId])` + a `useEffect` that calls `getMash(recipeId)` when the cache slot is `undefined`. `mashProfile = mashSaved ?? DEFAULT_MASH_PROFILE` — both `undefined` (not yet loaded) and `null` (loaded with no saved profile) fall through. Existing `targets` `useMemo` already lists `mashProfile` as a dep, so it refires on save automatically. Dropped the now-unused `lsGet` and `MashProfile` imports.

`WaterTab.tsx`:
- Subscribed to `mashByRecipe[recipeId]` (same pattern as BrewDayTab) and threaded the actual `mashProfile` (with `?? DEFAULT_MASH_PROFILE` fallback) into `calcBrewDayTargets` instead of the literal `null`.
- Moved the volume prefill out of the `useState` lazy initializer and into a `useEffect` keyed on `[mashProfile, recipe, ingredients, maltLib, hopLib, yeastLib, equipProfiles, settings.grainAbsorb, settings.coolingShrinkage]`. The effect respects `dirtyRef.current` (prefill stops once the user touches anything) and only writes empty slots, so an incoming mash-profile save updates the prefilled volumes for an unedited tab but never overwrites a value the user has typed. The 400ms debounced `setWaterChem` save is unchanged — `dirtyRef` keeps prefill non-persistent.

## Compile

`npx tsc -b --force` after wiping `tsconfig.*.tsbuildinfo`: clean. Both `tsconfig.app.json` and `tsconfig.node.json` rebuilt with zero diagnostics.

---

# SESSION_LOG entry — 2026-05-09 (late) — Libraries redesign, Import Recipe (BeerXML), water-chem precedence, Misc/WaterChem split, Recipe edit UI polish

A long session focused on the Libraries tab (two design rounds), the File menu's first real wiring (Import Recipe), an architectural change to the water-chem filter, the cosmetic Water Chemistry / Misc display split that piggybacks on it, and a multi-pass alignment polish on the Recipe Edit page. One CLAUDE.md update for the filter precedence change.

---

## Libraries tab redesign

A two-round BeerSmith-style overhaul of the Libraries tab. Same data model, very different interaction surface.

### Round 1 — selection model + density + detail pane

The HTML reference uses per-row Edit/Duplicate/Delete buttons + a leftmost master/per-row checkbox column. Replaced both with a click-to-select / right-click-for-actions pattern plus a fixed-height detail pane below the table.

- **Action column dropped.** No more per-row Edit/Duplicate/Delete stacked buttons. Action moved to right-click context menu.
- **Checkbox columns dropped.** Selection is now click-based — file-explorer semantics: click replaces, shift+click range, ctrl/cmd+click toggle. Anchor by index in this round (changed to ID-based in round 2).
- **Double-click → Edit modal** wired (existing modal, no internal change).
- **Right-click context menu** — inline JSX reusing the Recipe-tab `ctx-menu` / `ctx-item` / `ctx-sep` / `danger` CSS classes; outside-mousedown + Escape close, deferred attach so the right-click that opens the menu doesn't immediately close it. Two variants:
  - Single-row: Edit / Duplicate / sep / Delete.
  - Bulk (right-click on a row in a multi-selection): Delete N items only in round 1; expanded in round 2.
- **Density bump.** Added Libraries-scoped CSS variables to `:root` (`--lib-fs-row`, `--lib-fs-header`, `--lib-fs-detail-title`, etc.) — none of the existing CSS exports general typography tokens, so this is a scoped namespace. Row height target ~32–38 px naturally; matches the Libraries-tab BeerSmith density.
- **Detail pane.** New 240 px panel below the table; renders nothing when 0 selected, `"N items selected"` when >1, and full field grid + Notes block when single. Field list driven off `LIB_FIELD_DEFS[section]` so every section type renders its own schema automatically. Read-only; edits go through the Edit modal.
- **Bulk toolbar (Bulk Edit / Delete / Clear)** kept as-is per Ben's choice — both paths (toolbar + right-click menu) reach the same actions.
- **Touch verification.** Tablet.tsx and Mobile.tsx don't import LibrariesPage at all → desktop-only pattern is safe; right-click + ctrl/shift+click need no fallbacks.

### Round 2 — polish

Five follow-ups after Ben eyeballed round 1:

- **Detail pane title bar darkened.** Added `background: var(--panel)` + edge-to-edge padding so the title row reads as a BeerSmith-style gray section band over the table rows. `border-top: var(--border2)` for stronger table↔pane separation.
- **Notes block rendered for all four sections.** Earlier Notes lookup keyed off `LIB_FIELD_DEFS.find(d => d.key === 'notes')`, which returned undefined for every section — none of the four `LIB_FIELD_DEFS` entries include `notes`. The modal's comment ("notes lives outside fieldDefs in HTML — handled separately") explains why. Switched the detail pane to read `entry.notes` directly off the row, matching the modal's approach. **Did not extend `LIB_FIELD_DEFS`** per scope — uniform behavior across malts/hops/yeast/misc.
- **Trailing zeros trimmed in detail pane.** Added a numeric branch in `formatValue` that runs `Number(raw).toString()` for `def.type === 'number'` — `'9.2000000'` → `'9.2'`, `'5000.0000'` → `'5000'`. Detail-pane scope only; table cells unchanged.
- **Sortable column headers + ID-based anchor.** Replaced `anchorIdxRef: useRef<number>` with `anchorIdRef: useRef<string | null>` (ID-based) so reordering rows can't strand the anchor. Recipe sidebar's `FolderTree` already uses this pattern. Sort state `{ field, dir }` in component state, never persisted. Numeric whitelist hardcoded — `aa, beta, ebc, price, atten, temp_min, temp_max, dbfg, max_pct, moisture, diastatic_power, protein, yield_pct, potential`. **Lot # treated as text** per Ben's choice (real-world lot numbers like "UL 9/25" would NaN-cluster under numeric sort). ▲/▼ indicator next to the active sort header. `#` column not sortable. Section switch resets sort.
- **Bulk right-click menu expanded.** Added Bulk Edit + Duplicate alongside the existing Delete. New `bulkDuplicate(ids)` helper — clones selected entries with `(copy)` suffix, bumps `libNextId[section]` once for the whole batch, single toast with undo.

### Bulk Edit dropdown bug — `LIB_BULK_FIELD_DEFS` schema fix

**Symptom.** In the Libraries Bulk Edit modal, Supplier rendered as a plain text input even though the single Edit Entry modal renders it correctly as a dropdown of saved suppliers.

**Two-part bug.**
1. `LIB_BULK_FIELD_DEFS` (in `libraryShared.ts`) declared supplier as `'text'` for malts/hops/misc — Bulk Edit's schema literally asked for plain text.
2. Bulk Edit's inline `BulkRow` only rendered `text`, `number`, `select` — silently no-op'd for `supplier-select` and `checkbox`.

**Fix.** Extracted the single Edit modal's `renderInput` + `SupplierSelect` into a new shared module `libraryFieldInput.tsx` (`renderLibFieldInput(def, value, onChange, { disabled? })`). Both modals now call the same function — divergence-proof. Added a `disabled` parameter for Bulk Edit's "disabled until checkbox ticked" UX. State shape on Bulk Edit widened from `Record<string, string>` to `Record<string, LibFieldValue>` so checkbox-typed bulk fields would also work (none today; forward-safe). `LIB_BULK_FIELD_DEFS.malts.supplier`, `.hops.supplier`, `.misc.supplier` flipped to `'supplier-select'`. `yeast.lab` left as `'text'` — lab isn't a supplier.

---

## File menu — Import Recipe (BeerXML)

First real wiring of a placeholder File menu item. Port of HTML's `handleRecipeXML` (line 17232) + `confirmRecipeImport` (17323), with a few intentional divergences.

**Critical scope finding upfront.** The HTML does NOT have BSMX recipe import. `importBSMX` (HTML 17058) is library-only and explicitly rejects recipe exports ("Make sure you exported from an Ingredients view in BeerSmith, not a recipe."). Confirmed by greppingg every variant of "BSMX recipe" / "F_R_NAME" / "Recipe.bsmx" / etc. in the HTML — nothing. So BSMX recipe import is net-new build, not a port. Ben opted to defer to a separate task; today's PR is BeerXML only. `.bsmx` files trigger an explanatory toast.

**New file: `src/components/recipe/recipeImport.ts`.** Pure parser — same shape as `libraryImport.ts`. Exports `parseRecipeXML(text): ParsedRecipe[]`. Walks every `<RECIPE>` node:

- NAME → `Recipe.beerName`. **`Recipe.name` (the tax serial 仕込記号) left empty** so the brewer's tax identifier isn't accidentally seeded with a foreign string. (HTML stores `<NAME>` in `name` only — it predates the React `name`/`beerName` split.)
- `<STYLE><NAME>` → `Recipe.style`. Style key matched case-insensitively against `BJCP_2021` names; falls back to `<CATEGORY_NUMBER><STYLE_LETTER>` (e.g. `'21A'`) when name match fails. Empty string when neither matches.
- BATCH_SIZE, BOIL_TIME, EFFICIENCY (default 75 % per HTML), OG, FG (both → °P via inline SG-to-Plato), NOTES.
- Fermentables → `type: 'grain'`, amt as kg, EBC = SRM × 1.97, malted heuristic `!/(adjunct|sugar|fruit|juice)/i.test(TYPE)`. Hops → grams + Tinseth-ish IBU for boil hops, `use` lowercased to match React convention (`'boil'`, `'whirlpool'`, `'dry hop'`, `'first wort'`). Yeasts → ml + atten% in `extra`. Misc → MISCS MISC with fallback to flat MISC nodes (matches HTML 17288–17290).
- **Mash schedule** parsed from `<MASH><MASH_STEPS><MASH_STEP>` into a `MashProfile` blob. Decoction maps to Infusion (not in React's `MashStepType` union). Persisted via `lsSet('bl_mash_<id>', profile)` so it picks up the existing `bl_mash_` Supabase prefix. **Net-new vs HTML import** which doesn't read MASH at all.

**Desktop.tsx wiring.** Hidden `<input type="file" accept=".xml,.beerxml,.bsmx">` triggered by the menu item. `onChange` reads, parses, sets `pendingImports` → triggers a preview modal (`RecipeImportPreview`). Single-recipe variant shows full ingredient summary + mash schedule + notes; multi-recipe variant collapses to one line per recipe. Confirm allocates IDs in-loop via `newRecipeId([...current, ...allocatedSoFar])`, calls `addRecipe` + `setIngredients(newId, ings.map((ing, idx) => ({ ...ing, id: \`${newId}_${idx}\` })))` per CLAUDE.md ingredient-ID rule. Opens the **first** imported recipe per Ben's spec (HTML opens the last).

**Defaults Ben confirmed:** `<NAME>` to beerName only / use lowercased / FG imported / first opens / inline conversions stay inline / no new types / mash imported / preview shown / 75 % default efficiency.

---

## Misc display split — Water Chemistry / Misc

Cosmetic-only: split the MISC ingredient section into "WATER CHEMISTRY · N" and "MISC · N" everywhere misc is rendered. The classifier filter is the same one the tax engine already uses (`isWaterChem` in `lib/waterChem.ts`) — display split and tax exclusion always agree.

**Audit.** Three render sites use `isWaterChem`:
- `RecipeTab.tsx` — Recipe edit Ingredients sub-tab. Single `<IngredientCard label="MISC">` split into two cards, both `type="misc"` so they share `bl_recipe_cols_misc` column-visibility prefs. Only the first visible section gets `extraTopGap`.
- `RecipePreview.tsx` — Overview page. `grouped` useMemo gains a `waterChem` array; render order Grains → Hops → Yeast → Water Chemistry → Misc; each `length > 0` gated.
- `Desktop.tsx` `SingleRecipePreview` — BeerXML import preview. Same split pattern applied.

**BrewDayTab does NOT render misc** — its only `ingredients` references are calc inputs, not list rendering. Confirmed by grep. Other recipe sub-tabs (Ferm, Packaging, Water, History, Analysis, Checklist, Tax) also don't list misc as a UI block.

**Pre-existing bug flagged but not fixed.** `LIB_FIELDS.misc` (6 fields) and `LIB_HEADERS.misc` (5 headers) length mismatch — same shape as the malt-column-shift bug fixed 9 May. Out of scope this round; deferred.

---

## Water-chem filter precedence — architectural change

**Symptom.** False positives like "Kaffir Lime" set to `use='Boil'` were being classified as water-chemistry — the regex matched "lime", and the OR condition didn't care about the explicit `use`. These items were silently excluded from tax misc totals AND grouped under WATER CHEMISTRY in the display.

**Old logic (matches HTML reference):** `isWaterChem(ing) = use === 'water chemistry' OR WATER_CHEM_KW.test(name)`. Either condition wins.

**New logic (React diverges):** explicit `use` field is decisive when set; regex is fallback for legacy entries with no use selected.

```ts
const use = (ing.use || '').trim().toLowerCase();
if (use === 'water chemistry') return true;       // (1) explicit yes
if (use !== '')                return false;       // (2) explicit other use wins over regex
return WATER_CHEM_KW.test(ing.name || '');         // (3) no use → fall through
```

The regex itself is unchanged. Only the combining logic.

**Scope.** All six `isWaterChem` callsites inherit automatically (display split: 3 sites; tax engine via `iterTaxIngredients`: `lib/tax.ts`, `lib/nta.ts`, generator itself). No callsite edits.

**snap_* unaffected.** Verified `recordToTaxMaster` (`store/index.ts:1363`) → `buildSnapshot(coldSide, prev)` (`lib/tax.ts:416`) reads exclusively from `ColdSideData` and the existing `TaxRecord` — does not call `isWaterChem` or `iterTaxIngredients`. Already-filed tax records preserve their captured `malt`/`wheat`/`oats`/`other` values. Only **live** recompute and **displays** shift for affected recipes.

**Behavior diff (live values only):**

| Item | Before | After |
|---|---|---|
| `'Kaffir Lime'`, `use='Boil'` | water-chem (excluded) | NOT water-chem (counted in tax misc) |
| `'Calcium Chloride'`, `use=''` | water-chem | water-chem (regex fallback, unchanged) |
| `'Calcium Chloride'`, `use='Mash'` | water-chem (regex still wins) | NOT water-chem (explicit Mash wins) |
| `'Calcium Chloride'`, `use='Water Chemistry'` | water-chem | water-chem (unchanged) |
| `'Whirlfloc'`, `use='Boil'` | NOT water-chem | NOT water-chem (unchanged) |

**CLAUDE.md updated.** "Water Chemistry — Tax Exclusion Rules" section reworked to distinguish HTML reference (still both-filters-together) from React (explicit-use precedence). Includes a "Why diverged" paragraph citing Kaffir Lime, plus a `snap_*` unaffected note. Architectural decision → CLAUDE.md change is per project convention.

---

## Recipe Overview title swap

The Overview page (`RecipePreview.tsx`) was rendering `recipe.name` (tax identifier 仕込記号) in the large display slot and `recipe.beerName` (brand name) as the small subhead. Per CLAUDE.md "Beer Name vs Recipe Name" — beerName is the brand, name is the internal tax identifier. The brand should be the visually dominant title.

**Fix:**
```jsx
<div className="rp-name">{recipe.beerName || recipe.name}</div>
{recipe.beerName && recipe.name && <div className="rp-beer-name">{recipe.name}</div>}
```

Falls back to `name` in the large slot when beerName is empty (with subhead hidden so it doesn't repeat the same value). CSS class names (`.rp-name`, `.rp-beer-name`) kept for diff minimality — `.rp-name` now renders beerName when present, which is semantically backward but functionally fine. Deferred renaming to the typography pass.

---

## Sidebar popover card — replaces sidebar-click navigation

A short-lived "navigate to Recipes/Overview on sidebar click" change was applied earlier this session, then reverted in favor of a floating popover.

**v1 (reverted).** `setPreview` wrapper added `setActiveTab('recipes')` + `setSidebarTab('overview')` on recipe single-click so the user could click any recipe from any tab and land on its Overview view. Worked but felt like a navigation steal — clicking a recipe in the sidebar from Brew Day tab would yank the user away.

**v2 (current).** Floating preview card overlays the current tab. Single-click → popover; double-click → permanent tab; "Open Recipe →" → close popover + open as tab. Dismissal: outside-click, Escape, re-click same row (toggle), click another recipe (replace).

- New file `RecipePreviewPopover.tsx` — thin floating-positioned wrapper around the existing `<RecipePreview>`, reuses everything (title swap, stats, ingredient lists with Water Chemistry / Misc split, "Open Recipe →" CTA). Fixed position, 660 px wide, anchored at sidebar's right edge + 12 measured at open time via `getBoundingClientRect`.
- New state `popoverRecipeId` + `popoverPos` in `Desktop.tsx`. `useLayoutEffect` measures the sidebar's `[data-recipe-sidebar]` element on open. Outside-mousedown + Escape close handlers, deferred attach (matches existing recipeCtxMenu pattern), sidebar exempt from outside-close (the wrapper handles toggle/replace explicitly).
- `setPreview` wrapper in Desktop.tsx: recipe single-click → toggle popover; folder click → close popover + update `preview` (folder-preview pane on Recipes tab still works).
- `FolderTree` gains optional `popoverId` prop; row's "selected" visual ORs `(preview-match) || (popoverId-match)` so the open popover's target row stays highlighted.
- Both rendered sidebar instances (Recipes tab + Ingredients sub-tab) inherit automatically since they share `renderRecipeBrowserSidebar`'s closure.

---

## Recipe Edit page (Ingredients sub-tab) — alignment polish

A long iteration on layout, with three meta-bar centering flips before settling.

### Pass 1 — initial layout adjustments

- Title centered (with metadata clustered next to or below).
- Top metric strip gap 40 → 16.
- Bottom row: `2fr 1fr 1fr 1fr` (Style ~40 %); `gap: 24`; `rowStyle` switched to `space-between` for label-left / value-right inside Totals/Process/Measured.
- StyleSummaryPanel: dropped the "STYLE" header, dropdown promoted to top with ⊞ inline.
- Ingredient row density: minHeight 32 → 26, padding `'4px 8px'` → `'2px 8px'`.

### Pass 2 — tighter

- Title centered (kept).
- Top metric strip gap 16 → 8.
- Ingredient rows minHeight 26 → 22, padding 2px → 1px.
- Bottom row gap 24 → 32; columns `1.5fr 1fr 1fr 1fr` (Style narrower).

### Pass 3 — first revert (ill-advised, then un-reverted)

User asked to revert title centering; I dropped the centered cluster, restored left-title / right-pills layout. User then realized centering was actually the desired state — restored centering wrapper + abs-positioned glass + `justifyContent: 'center'`.

### Pass 4 — horizontal layout, rightward shift, narrower amount→name gap

- Cards container `padding: '12px 16px'` → `'12px 16px 12px 64px'` — extra left padding shifts ingredient block rightward.
- Amount cell gains `textAlign: 'right'` so "200 kg" sits flush against the name (~40 px of internal cell whitespace eliminated; row gap stays at 12).

### Pass 5 — final left/right edge alignment

The user marked up a screenshot showing one shared left edge for: title / subtitle / sub-tabs row / metric strip labels / section headers / amount column. Plus right-edge constraints: beer glass aligns with Checklist tab (last); ingredient data block aligns with Brew History tab (second-to-last).

- **Meta-bar centering reverted again** (third flip). Title flush left, pills right via `marginLeft: 'auto'`, glass inline at end of pills (no abs-positioned wrapper). On Ingredients sub-tab, `paddingLeft: 236` + `paddingRight: 20` overrides — 236 = sidebar (220) + content padding (16); 20 matches the glass's right margin. Other recipe sub-tabs (Brew Day / Ferm / etc.) use the default 20 px from CSS class.
- **Sub-tabs row** — `justifyContent: 'flex-start'`, `paddingLeft: 236` on Ingredients, `paddingRight: 20`. Each `.sub-tab` div gains inline `flex: 1, justifyContent: 'center'` so the 10 tabs share the row width equally. Side effect: tabs stretch on every recipe sub-tab, not just Ingredients (visually consistent, no harm).
- **Top metric strip** — `topStripInnerStyle.justifyContent` `'center'` → `'flex-start'`, dropped `margin: '0 auto'`, kept `padding: '10px 16px'`.
- **Cards container** — `table-wrap` `justifyContent` `'center'` → `'flex-start'`; padding `'12px 10% 12px 16px'` (16 left to align with metric strip; 10 % right ≈ one tab-column short of the row's right edge ≈ Brew History tab).

### Pass 6 — MEASURED panel removed

**Safety check passed.** `measOg` and `postboilL` are inputs on `BrewDayTab.tsx:475, 486`. `AnalysisTab.tsx:120-126` recomputes the derived efficiency from those source fields. The MEASURED panel here was a redundant read-only display; nothing's lost. Total cost (the only field without another dedicated display) is implicit in each ingredient row's cost column.

**Removed:** `<MeasuredPanel>` JSX from bottom row; orphan `MeasuredPanel` function; `bdBlob` / `measOgPlato` / `postboilL` / `measEffPct` derivations (~30 lines of localStorage reads + `useMemo` chains); unused `platoToSg` and `calcActualEfficiency` imports.

**Bottom row** — `gridTemplateColumns: '1.5fr 1fr 1fr 1fr'` → `'1.5fr 1fr 1fr'` (Style still widest at ~43 %); padding `'10px 12px 12px'` → `'10px 10% 12px 16px'` matching cards container's edges; 32 px gap preserved.

**Net visual result.** All six elements share x = 236 (sidebar 220 + 16 content padding). Beer glass and Checklist tab end at the same right edge (both at `paddingRight: 20`). Cards data block and Brew History tab end approximately at 90 % of row width.

**Caveats.** The right-edge "Brew History ↔ data block" alignment is approximate, not pixel-perfect — depends on ActionStack width relative to leftCol. Sub-tabs' `flex: 1` applies on every recipe sub-tab, not just Ingredients. Total cost has no dedicated display anywhere now (cost column on individual rows still works via column-visibility menu).

---

## Carried forward to next session

- Verify all in-flight CC work landed cleanly (sidebar popover, recipe edit final alignment + MEASURED removal) by eyeballing live.
- `LIB_FIELDS.misc` / `LIB_HEADERS.misc` length mismatch — pre-existing, deferred.
- Numeric formatting + typography passes — explicitly deferred end-of-port polish.
- File menu's other 9 placeholder items.

---

# SESSION_LOG entry — 2026-05-09 (evening) — PWA polish, Recipe tab redesign, BSMX audit, Mash + Library fixes

PWA polish, Recipe tab redesign across 4 passes, BSMX audit, Brew Day MASH bug fix, library price column fix. Six code commits + audit-only investigation.

---

## iPad PWA polish

Three commits-worth of polish bundled under `a6ffa76`:

**Safe-area inset.** iOS PWA in standalone mode rendered the status bar over the BREWLAB top nav. Cause: `viewport-fit=cover` was set in the meta tag, but `#root` had no safe-area padding. Added `padding: env(safe-area-inset-*)` for top/L/R + `box-sizing: border-box` so `height: 100%` stays in viewport. Initially included `padding-bottom` too, but on iPad that left a ~21 px gap above the home indicator (the tablet has no bottom-fixed UI). Removed bottom inset.

**Manifest + service worker subpath cleanup.** `index.html` `<link rel="manifest">`, `main.tsx` SW registration, `manifest.json` `start_url`/`scope`/icon paths, and `sw.js` cache list were all hardcoded to `/brewlab/` from the GitHub Pages era. After morning's `vite.config.ts` `base` fix to `/`, these were 404'ing on Vercel. Updated all paths to root.

**Theme color.** `manifest.json` `theme_color` was `#0a84ff` (vivid blue) — Chrome's desktop PWA title bar was rendering bright blue instead of matching the dark app. Updated to `#2c2c2e` (`var(--panel)`, what `.menu-bar` actually uses). Synced `<meta name="theme-color">` in `index.html` to the same value.

**Caveat for follow-up:** after this lands, desktop PWA needs to be uninstalled and reinstalled — Chrome caches the manifest by URL and the URL itself changed (`/brewlab/manifest.json` → `/manifest.json`). Closing/reopening the window isn't enough.

---

## Recipe tab redesign — 4 passes

A multi-pass redesign of the recipe tab layout, ending with a flat visual language matching the recipe-preview pane.

### Pass 1 (`fbcd9c6`) — top strip + PROCESS panel + TOTALS DH/WP per-litre

The 6-pill strip above the ingredient cards (BATCH INTO FV / BATCH INTO WP / EXPECTED LOSS / BOIL / BH EFF / WP TEMP) was redundant — the BATCH-related ones are display values that don't need pill chrome, and the process-related ones (Boil, BH Eff, WP Temp) are inputs that are awkwardly stuffed into the strip.

Replaced with a 5-stat metric strip in the recipe-preview style: BATCH (editable input) / GRAIN / HOPS / IBU / ABV. The 5 process/volume fields moved into a new PROCESS panel in the bottom row, alongside STYLE / TOTALS / MEASURED (now 4 columns).

TOTALS panel changes: dropped Total Grains and Total Hops (now in top strip), added DH G/L and WP G/L. New pure helpers `calcDryHopGperL(ingredients, batchL)` and `calcWhirlpoolGperL(ingredients, batchIntoWpL)` in `lib/calculations.ts`. Distinct from existing private `totalDryHopGrams` (which counts ferm-meta logged actuals for DH pH prediction); these read planned recipe amounts.

Verified mobile/tablet pages don't import `RecipeTab` or any of its panels — separate layouts, no follow-up needed.

### Pass 2 (`5202f53`) — dense ingredient list

Replaced the card-bordered ingredient sections with flat sections: dot + small-caps gray label + inline count + thin divider, then dense rows (~32 px target, padding `4px 8px`). Dropped the column-header row (`# AMOUNT NAME USE TIME IBU/% COST`) entirely.

**Per-section column visibility menu.** Right-click on the section header opens a popover with a checkbox per column. Persists to `bl_recipe_cols_<type>` (local-only via direct localStorage; same pattern as inventory's `bl_inv_cols_<sec>`). Defaults: amount/name/use always shown; time/ibu shown for hops/misc; pct shown for grains; **cost and color/aa hidden by default** — user re-enables on demand.

Misc section gets `extraTopGap` prop (12 px) for visual separation from yeast/hops/grains above it.

**Decision held:** amount remains read-only display. Inline editing was removed 2026-05-04 because accidental edits on tax-relevant amounts were too easy. Edits go through the double-click Edit modal. The pass-2 prompt suggested "editable input, same behavior as today" — flagged the contradiction and preserved current read-only behavior.

### Pass 3 (`75a3b10`) — visual unification

Flattened card chrome across the recipe page to match the recipe-preview pane's flat language:

- **Bottom 4 panels** (STYLE / TOTALS / PROCESS / MEASURED): dropped `panel` background, border, border-radius. Headers go from amber Bebas Neue to muted gray small-caps (font weight 700, letterSpacing 0.08em) — matching ingredient section labels.
- **Recipe meta bar** (TAX BATCH # / BREW DATE / VERSION / BREW #): meta-pill divs flattened — no bg, no border-radius, padding 0. Tax Batch # input gets amber text color to keep tax-relevance prominence.
- **Top metric strip**: dropped panel-2 background. Kept thin top/bottom 1px borders.
- **Sidebars** (left recipe browser + right ActionStack): unified to main bg (`var(--bg)`). Kept 1px vertical dividers between sidebars and content.
- **Section header divider** removed from `IngredientCard.headerStyle`.

GC'd orphaned CSS classes: `.ing-card`, `.ing-card-header`, `.ing-card-dot`, `.ing-card-label`, `.ing-card-count`, `.ing-card table thead th` (all confirmed unused outside `theme.css` after pass 2's IngredientCard rewrite).

### Pass 4 (`b09724e`) — polish

Four targeted fixes after the unification:

- **Bottom panels were running together** — values right-aligned to the column edge sat flush against the next column's label. Switched `rowStyle` from `justify-content: space-between` to flex-start with `gap: 20`. Labels and values cluster left, whitespace fills the right of each column.
- **Ingredient amounts unbolded** — `cellAmountStyle.fontWeight` 600 → 400. Matches the rest of the table number styling.
- **Top metric strip grouped centrally** — was `justify-content: space-around` distributing across full width; switched to `center` with `gap: 40`, dropped `maxWidth: 1000`. Reads like the recipe-preview metric bar.
- **DryHopModal fonts +2 across the board** — the modal was using fontSize 8/9/10/12 (mostly 8s for labels, 10s for body). Bumped via 4 sequential `replace_all` in reverse order (12→14, then 10→12, 9→11, 8→10) to avoid compound rewrites. Final state: 14 for header / close button, 12 for body + inputs + hop names, 11 for slot header + add buttons + empty-state, 10 for section labels + column heads + footer status.

---

## BSMX importer audit

User suspected prices weren't importing correctly from BeerSmith. Reference test file: `hop1.bsmx` with one Wakatu entry, `F_H_PRICE = 141.7476156` (¥/oz; should convert to ~5000 ¥/kg).

Audited React `importBSMX` (`src/components/libraries/libraryImport.ts:198`) against HTML reference (`brewlab-desktop.html:17058–17220`). All three suspected areas check out:

- **Price conversion**: `F_G_PRICE` and `F_H_PRICE` both `Math.round(pricePerOz * 35.274)` ✓; `F_Y_PRICE` correctly NOT converted (¥/package, not ¥/kg).
- **Notes preservation**: all four sections preserve `F_*_NOTES` via `el.textContent.trim()`.
- **Core fields**: name, AA, beta, origin (hops); equivalents for grains/yeast/misc — all present and matching HTML.

**Result: no diff needed.** The importer is a verbatim port. The Wakatu entry would persist as `price: 5000`. If the user is seeing wrong/empty prices in the UI, the bug is downstream — flagged three places to look (library row rendering, recipe cost calc, Supabase round-trip).

The downstream investigation later turned up the malt-column-shift bug (see Library price fix below). The audit was correct: importer was fine; renderer was reading the wrong field.

---

## Brew Day MASH panel divergence fix (`3863570`)

**Symptom.** bob2 recipe with 250 kg grain. Mash Profile modal showed correct values (Mash 750 L, Sparge 570 L, Total 1320.5 L, Strike 74.6°C). Brew Day's MASH panel showed wrong values (Mash 1320.5 L, Sparge 0, Strike 71.7°C, Water Ratio 5.28 L/kg, "No mash profile saved").

**Root cause.** Two-state divergence:
- `MashProfileModal` initializes form state from `lsGet('bl_mash_<recipeId>') ?? DEFAULT_PROFILE`. The default has `ratio: 3.0` and standard steps. Modal computes its display via `calcBrewDayTargets` against this in-memory ratio. Persistence happens **only on Save click** (`lsSet`).
- `BrewDayTab` reads `lsGet('bl_mash_<recipeId>')` directly with no fallback, and passes the result (often null when the user hasn't explicitly saved) to `calcBrewDayTargets`. The calc's mashRatio fallback then takes the **water-balance** branch: `mashRatioLkg = (preBoilVolL + grainAbsorbTotL) / totalGrainKg` (`calculations.ts:528–534`). For batchL=1050, grain=250, this evaluates to ~5.28 L/kg — total water, not mash water. Cascade: mashWaterL = 1320 (the TOTAL), spargeVolL ≈ 0, strikeTempC computed against the wrong mashWaterL.

Numerical verification matched the user's reported wrong values exactly (within rounding).

**Fix.** Extracted `DEFAULT_MASH_PROFILE` from `MashProfileModal.tsx` to `lib/calculations.ts` as a named export. `BrewDayTab` applies it as a fallback: `lsGet(...) ?? DEFAULT_MASH_PROFILE`. Both views now compute against the same baseline (ratio 3.0, std steps) before the user explicitly saves.

**Out of scope, flagged.** `WaterTab.tsx:122–124` explicitly passes `mashProfile: null` for water-chem calcs — same divergence applies, but might be intentional (water-balance ratio could be what mash-pH calc wants there). And `BrewDayTab.tsx:99–101` `useMemo([recipeId])` won't refetch when the modal saves while BrewDayTab is mounted — likely masked by tab remount, but a real edge case.

---

## Library price display fix (`fe4766f`)

Direct follow-up from the BSMX audit. User reported malt prices empty for imported entries.

**Issue A — malt price empty.** Length mismatch in `libraryShared.ts`: `LIB_HEADERS.malts` had 7 columns, but `LIB_FIELDS.malts` had 9 entries (`'name', 'maltster', 'supplier', 'malt_type', 'malted', 'tariff', 'ebc', 'price', 'notes'`). The two are zipped positionally at render time (`LibrariesPage.tsx:471` iterates `fields`). For malts, that meant:

| Header (col idx) | Reads field | Visible result |
|---|---|---|
| EBC | `malted` (boolean) | ✓ or — |
| Price ¥/kg | `tariff` (boolean) | ✓ or — *(empty for all BSMX imports)* |
| Notes | `ebc` (number) | EBC shown in notes column |

`malted` and `tariff` are checkbox fields meant for the Add/Edit modal (`LIB_FIELD_DEFS.malts`); they shouldn't be table columns. Fix: remove from `LIB_FIELDS.malts` (modal coverage unchanged). Existing data in Supabase was correct all along — just being read from the wrong field name.

**Issue B — yeast library missing price column.** Added `'Price ¥/pkg'` to `LIB_HEADERS.yeast` and `'price'` to `LIB_FIELDS.yeast`, plus a price field to `LIB_FIELD_DEFS.yeast` so the Add/Edit modal can edit it. Bulk-edit modal already had it (`LIB_BULK_FIELD_DEFS.yeast`).

Hops/misc were already correct (lengths match) and untouched.

---

# SESSION_LOG entry — 2026-05-09

Infrastructure-only session. No app feature work. Got BrewLab from local-only to live on a public URL with working sync.

---

## GitHub migration

Pushed the repo to **github.com/nestafett2/brewlab** (personal account). The original `nomodachi` work account remains suspended; appeal not yet filed and now low priority — code is safe on the personal account, so the appeal is optional follow-up rather than blocking anything.

Removed `.github/workflows/deploy-pages.yml` — GitHub Pages was the original deploy target on the work account. With Vercel taking over hosting and the work account dormant, the workflow had no job to do.

---

## Vercel deploy

BrewLab is live at **https://brewlab-red.vercel.app**, auto-redeploys on every push to `main`.

**The vite.config gotcha.** First deploy 404'd every asset. Cause: `brewlab/vite.config.ts` had `base: '/brewlab/'`, set when the deploy target was `nomodachi.github.io/brewlab/` (a subpath). Vercel serves at root, so the bundle's asset URLs need `base: '/'`. One-line fix.

Worth flagging for future-me: if anyone ever flips back to a subpath host (GitHub Pages on a different account, or a custom domain with a `/brewlab/` prefix), the `base` will need to flip back. Easy to forget; Vite's behaviour is silent — assets just 404, no build-time warning.

---

## Supabase configured live

Credentials entered into the deployed app via Settings → Connection. Sync verified by checking the live app pulls the same recipes/libraries as local dev (both pointed at the same Supabase project).

**Architectural decision held.** Credentials stay **per-user via in-app Settings**, NOT in Vercel env vars. This was the right call to preserve: BrewLab's shareability model is single-brewery-per-DB, each brewery bringing their own Supabase. If the deployed app baked a single set of credentials into env vars, every visitor would land on Nomodachi's database. Per-user in-app config keeps that model intact — Ben can share the URL with another brewery and they configure their own backend.

---

## OneDrive risk dismissed

Standing handoff item: "the repo is inside a OneDrive-synced folder, which can corrupt `.git/` over time." Investigated today. **Not a real risk.**

The project path is `C:\Users\nesta\OneDrive\Desktop\Apps\Brewing App\brewlab`, which **looks** like an active OneDrive path — but OneDrive Backup is **OFF** for the Desktop folder. Verified two ways:
1. Right-click context menu on Desktop shows no OneDrive sync items / cloud icons.
2. OneDrive Settings → Manage backup shows Desktop = "Not backed up".

The path is vestigial from a previous Backup configuration that was disabled at some point. Files are not actively syncing to the cloud. The `.git/` corruption concern was correct in principle but predicated on a sync that isn't actually running.

Removed from the pending list. **Do not re-raise** — flagged here so future-me doesn't redo the investigation when the path looks suspicious again.

---

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

---

## 10 May 2026 — Long polishing session

Profile locking architecture (Equipment + Mash + Pitch via shared computeLockedProfileIds helper, lock trigger = measOg > 0, value-fields-lock-metadata-editable rule). Triggered by a snapshot-vs-reference grep of brew_day that revealed live re-resolution of equipment profiles on every render — tax-safe but historical-display retroactivity issue. Water profile locking deferred indefinitely (different architecture).

File menu wiring brought down from 9 placeholders to 1: Export Recipe (BeerXML), Export All Data (backup, denylist-based, versioned format), Import Backup (two-stage modal, credential-scrub-on-restore for sync safety) all shipped. Save as New Version / Version… / Lock Recipe / Export for Sharing all deleted from menu. Export Selected remains as the last placeholder.

Templates "From Template" BJCP filter shipped (NewRecipeModal dropdown + free-text search, only styles actually present).

BEER_BUFFER_PH_PER_MEQ_L moved from hardcoded constant in calculations.ts into Settings → Advanced → Calculation Constants. SAFE_PRE_BOIL_PH_FLOOR confirmed already removed (floor-cap concept gone).

Yeast harvest "From Brew" picker bug fixed — post-2026-05-07-migration cleanup. formatPair helper hoisted to lib/yeastDisplay.ts. SCHEMA.md updated.

Cleanups: stale TODOs at AddIngredientModal.tsx:89 + BrewDayTab.tsx:11 removed; GitHub appeal-optional doc references scrubbed (account suspended permanently, not appealing); START_HERE Brew Day card flatten + 15.8L offset references removed (both done in prior sessions).
