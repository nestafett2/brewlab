# BrewLab — Feature Inventory

Per-device feature lists. The HTML reference apps are the authoritative spec — read `brewlab-desktop.html`, `brewlab-tablet.html`, or `brewlab-mobile.html` before building any feature. This file is a fast index of what each interface contains.

---

## Feature Inventory — Desktop

### Navigation
Menu bar: File | View | Libraries | Notes | Settings | Help

**File menu:** Import Recipe (BeerXML), Save Recipe, Scale Recipe, Export Recipe (BeerXML), Export Selected, Save as New Version, Save as Template, Version, Lock Recipe, Export All Data, Import Backup, Export for Sharing

**View menu:** Toggle top-level tabs (Planner, Inventory, Order Planner, Submitter, Tax Master, Tariff Reduction). State in `bl_tab_visibility`.

**Libraries menu:** Jump to Libraries tab sections. Import/Export BeerXML.

**Notes menu:** Opens Notes tab.

**Settings menu:** Quick-jump to settings sub-sections.

### Tab Bar
RECIPES (always visible) | LIBRARIES | SETTINGS | NOTES | PLANNER | INVENTORY | ORDER PLANNER | SUBMITTER | TAX MASTER | TARIFF REDUCTION

### Recipe Browser (left sidebar)
- Folder tree with drag-and-drop, unlimited depth
- Views: Folder / By Style / Overview
- Recipe items: beer name, style, date, star rating
- Right-click context menu: rename, duplicate, move, delete, new batch
- Overview mode: Brewery Overview (active ferments, upcoming brews, upcoming actions, deliveries, brew dates)

### Recipe Editor (right panel)
Sub-tabs: Recipe | Brew Day | Ferm | Packaging | Tax | Tax Summary | Analysis | Water | History | Checklist

#### Recipe Tab
- Meta bar: Beer Name, Recipe Name (仕込記号), Style, Brew #, Brew Date, Version, FV
- Stat bar: OG / FG / IBU / ABV / EBC — live calculated
- Ingredient tables (Grains / Hops / Yeast / Misc) — drag to reorder, inline edit
- Quick-add modals from library per type
- Happoshu trigger flag on misc ingredients (e.g. Carrageenan)
- Auto Beer/Happoshu classification
- Notes, equipment/mash/pitch/water profile selectors
- Grain % modal, Hop IBU breakdown modal, Substitute modal, Scale modal
- Lock/unlock, star rating (1-5), Brew Again toggle
- BeerXML export

#### Brew Day Tab
- Mash: profile display, readings table (up to 5: temp + pH each), strike/sparge volumes, sparge temp
- Boil: pre-boil volume/gravity, boil time, boil-off rate, expected post-boil volume
- Pitch: OG reading, volume into FV (mm → litres via tank calibration), pitch temp, FV selector
- Mark complete checkboxes per section, hop checklist, notes

#### Fermentation Tab
- Last reading tiles (°Plato, pH, Temp)
- Fermentation chart (°Plato primary, pH secondary, temp faint)
- Dry hop cards DH1/DH2/DH3 (strain, date, amount, DH split modal)
- Ferm log table (all readings), add ferm reading modal
- Ferm notes, other additions, yeast harvest section
- Harvested yeast inventory with generation tracking

#### Packaging / Cold Side Tab
- Transfer date, bright tank vessel
- Keg rows (size L, count), cans (size ml, count)
- Flowmeter reading, carbonation planned/actual
- Total packaged auto-calculated, waste/yield calculation, actual ABV
- Process notes, tasting notes, changes notes, analysis notes
- Tasting notes modal, Brew Again selector, analysis print

#### Tax Tab (NTA Working Record)
- Brew date, number, classification (Beer/Happoshu)
- Malt kg used (from recipe), ferm dates, conditioning dates
- Total packaged volume (from cold side)
- snap-* fields — snapshotted at "Record to Tax Master" time, NEVER recalculated
- Update from Recipe button, print, Excel export
- Live `malt`/`wheat`/`oats`/`other`/`hops`/`spent-grain` totals are recomputed from `bl_recipe_ings_<id>` every time the tab opens — see **Water Chemistry — Tax Exclusion Rules** in CLAUDE.md for the exact misc-row filter (use field + name regex + `type='water'` skip). Skipping this filter pollutes the `other` bucket with salts and breaks NTA filings.

#### Tax Summary Tab
Per-recipe NTA summary. Excel export.

#### Analysis Tab
Aggregated notes from all stages. Editable analysis notes. Print.

#### Water Chemistry Tab
- Source water profile selector
- Target ions: Ca, Mg, Na, SO4, Cl, HCO3
- Mineral solver (gypsum, CaCl2, epsom, baking soda, chalk)
- Acid additions (phosphoric, lactic — mash and sparge)
- Mash pH estimator
- Water volumes auto-filled from recipe
- Water summary card shown on Recipe tab
- CRITICAL: salts/acids NEVER appear in NTA tax misc ingredient lists

#### History Tab
All batches with same lineageId. Batch cards (brew date, OG, FG, ABV, packaged vol). Click → read-only batch detail.

#### Checklist Tab
Per-stage checkboxes (NTA Submitted, Brew Day, Ferm, Packaging, Tax, Tax Summary, Analysis, Inventory). Progress bar. Complete & Archive checkbox at bottom → sets ferm_meta.packaged = true.

### Tax Master Page
Three sub-tabs: Brew & Fermentation / Conditioning / Total Tax Page
Date range filter, classification filter, monthly summaries, print per tab, Excel export (three-tab workbook), monthly report modal.

### Recipe Submitter (NTA Declaration) Page
Beer name dropdown, per-1000L normalisation, colour-coded comparison grid (declared vs actual), print CC1-5610-6 form.

### Tariff Reduction Page
Three sub-tabs: Annual Planner / Reservations / Needyuu Hyo. Fiscal year selector, print and Excel export per tab.

### Production Planner Page
- Gantt chart (FV section + BT section), 21-day window, ±7/14 day nav
- Click date/vessel → add brew, FV conflict detection modal
- Colour swatches, actions (dry hop/transfer/packaging with emoji + date)
- Link brew to recipe (recipe picker), upcoming actions list, calendar view

### Inventory Page
Malts / Hops / Yeast / Misc / Harvested Yeast / Ledger sections.
Stock levels, usage history, in-stock filter, reconciliation, correction modal, full ledger, export, Google Sheets sync, yearly view, column picker.

### Order Planner Page
Forecast table (ingredients × planned brews, running balance). Delivery columns interleaved in date order (green header, +qty, updates balance). Type filter, Excel export.

**Log Order Modal (3 columns):**
- Left — FOR THESE BREWS: upcoming brews, checkboxes (default none checked), refreshes suggestions on change
- Middle — SUGGESTED: short ingredients grouped by supplier, checkboxes unchecked, All/None buttons
- Right — MY ORDER: staged items grouped by supplier, LOG ORDER/CONFIRM/PRINT, collapsible Add Manually

**Orders Panel:** Grouped by delivery date oldest first, collapsible date headers, click to edit.

### Libraries Page
Malts / Hops / Yeast / Misc. Full CRUD, BeerXML import/export, happoshu trigger flag on Misc, supplier field on each entry.

### Notes Page
Two-panel: textarea + Add Note left, timestamped list right (newest first). Delete per note. Syncs via bl_brewery_notes. Same notes on tablet and mobile.

### Settings Page
Units / Bitterness / Advanced / Styles / Tanks / Equipment Profiles / Water Profiles / Mash Profiles / Pitch Profiles / Suppliers / Connection.
Connection: URL + key, Test, Push, Pull.
Reset All Data: two confirmation dialogs → wipes all Supabase tables + local storage → reloads.

---

## Feature Inventory — Tablet

Brew-floor companion. Reads recipes from Supabase. Writes brew day/ferm/packaging.

### Navigation
Collapsible left sidebar: Home / Recipes / Inventory / Settings. Brew lists: Active / Upcoming / Archived. Open brew: Recipe / Brew Day / Ferm / Packaging / Tasting tabs.

### Home Tabs
Overview (active brew cards with progress bar, upcoming next 14 days) / Calendar (month view, tap day filters list) / Planner (Gantt, 21-day, ±7/14)

### Brew Detail
- Recipe: stat bar, grain bill, hop schedule, yeast, notes. Read only.
- Brew Day: mash readings table, FV mm calculator, pitch temp, hop checklist. Custom numeric keypad.
- Ferm: reading tiles, DH cards, ferm log, notes. Blue FAB → add reading.
- Packaging: kegs, cans, flowmeter, waste breakdown, notes.
- Tasting: tasting cards with stars.

### Other
Custom numeric keypad bottom-sheet (prevents iOS keyboard pushing layout). Brewery Notes FAB (blue pencil, bottom-left). Inventory Reconcile tab. Reset This Device in Settings. PIN lock (4-digit, 8-hour sessions).

---

## Feature Inventory — Mobile

Lighter brew-floor companion. Bottom tab bar navigation.

### Bottom Tabs
Home (calendar, amber FAB → Planner modal) / Brews (active + upcoming) / Recipes (folder browser) / Inventory (by type, search, in-stock filter, reconciliation) / Settings (Supabase config, light/dark, PIN, Reset This Device)

### Brew Detail
Same tabs as tablet: Recipe / Brew Day / Ferm / Packaging / Tasting. Ferm: View Chart button (landscape canvas overlay). All numeric inputs use custom keypad modal.

### Other
Brewery Notes FAB (bottom-left, all screens). PIN lock (4-digit, 8-hour sessions). Light/dark mode toggle. First launch: credentials screen if no Supabase config.

---

## HTML App Features Added Late (Already in HTML, Need to be in Rebuild)

These were added during HTML-app development and are easy to miss when scanning the older feature lists:

### Brewery Notes (all three devices)
- Desktop: Notes menu item opens page-notes tab. Two-panel: textarea + Add Note left, timestamped list right (newest first). Delete with confirmation. DOM methods only — no innerHTML with embedded quotes.
- Tablet/Mobile: Blue pencil FAB (bottom-left, fixed) → bottom sheet with notes list.
- Stored in `bl_brewery_notes` array: `[{ id: uuid, text: string, created_at: ISO string }]`
- Syncs via settings table in Supabase

### Order Planner Overhaul
- Log Order modal is 3 columns: FOR THESE BREWS → SUGGESTED → MY ORDER
- Suggested list grouped by supplier with amber headers
- Beer filter: none checked by default (you choose which brews to calculate for)
- Checking/unchecking a brew instantly refreshes the suggested list
- My Order grouped by supplier
- Orders panel grouped by delivery date oldest first, collapsible headers

### Order Planner Table — Delivery Columns
renderOrderPlanner() interleaves delivery columns between brew columns in date order. Green header with 📦 DELIVERY, shows +qty in green, updates running balance.

### Reset All Data / Reset This Device
- Desktop Settings → Connection → Reset All Data: two confirmations, wipes all Supabase tables + local, reloads
- Tablet/Mobile Settings → Reset This Device: two confirmations, clears local bl_ keys only, reloads
- Correct Supabase delete filters per table (id vs recipe_id — see Schema Quick Reference in CLAUDE.md)
