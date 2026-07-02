# BrewLab — SCHEMA.md

All data structures, Supabase table definitions, localStorage keys, and critical relationships. Use this as the authoritative reference when rebuilding — these are the structures the working app uses.

---

## SUPABASE TABLES

> **All tables have `created_at` and `updated_at` columns managed automatically by the database.** Application code should not write to them — Supabase populates `created_at` on insert and updates `updated_at` via trigger on every change.

### `recipes`
Primary recipe table. One row per batch. Desktop writes, tablet/mobile read only.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | e.g. `r1`, `r2`, `r13` |
| `lineage_id` | text | Links versions of the same recipe |
| `name` | text | Internal tax identifier (仕込記号) — NOT the brand name |
| `beer_name` | text | Label/brand name shown to users |
| `style` | text | BJCP style string e.g. "Hazy IPA" |
| `style_key` | text | BJCP key e.g. "21C" |
| `folder_id` | text | References bl_folder_list in settings |
| `batch_size_l` | numeric | Batch size in litres |
| `classification` | text | **CHECK constraint** — must be exactly `'Beer'` or `'Happoshu'` |
| `brew_date` | date | Planned/actual brew date |
| `brew_num` | text | Batch number e.g. "384" |
| `version` | text | Recipe version string |
| `version_note` | text | Free-form notes on this version |
| `locked` | bool | Locked recipes cannot be edited |
| `rating` | int | 1–5 stars |
| `brew_again` | text | One of `'yes'`, `'no'`, `'maybe'`, or null. Distinct from `cold_side.brewAgain`; the recipes column only accepts these three string values. |
| `cost` | numeric | Total recipe cost |
| `abv` | numeric | Calculated ABV % |
| `ibu` | numeric | Calculated IBU |
| `ebc` | numeric | Calculated EBC colour |
| `og_plato` | numeric | Target OG in °Plato |
| `fg_plato` | numeric | Target FG in °Plato |
| `bd_fv` | text | Assigned fermenter ID e.g. "fv2" |
| `notes` | text | Recipe notes |

**Critical rules:**
- `classification` has a database CHECK constraint. Inserting anything other than `'Beer'` or `'Happoshu'` will fail.
- `name` (仕込記号) and `beer_name` are separate fields. Tax submissions use `name`. Users see `beer_name`. Always display `beer_name || name`.
- `id` format is short strings like `r1`, `r2` — not UUIDs.

---

### `recipe_ingredients`
One row per ingredient per recipe. Desktop writes, tablet/mobile read only.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | Format: `recipeId_index` e.g. `r1_0`, `r1_1` |
| `recipe_id` | text FK | → recipes.id |
| `type` | text | `'grain'`, `'hop'`, `'yeast'`, `'misc'`, `'water'`. No DB CHECK constraint — values are enforced by app code. `'water'` rows are water adjustments (the HTML's Water Adjustments tab stores them here); they are deliberately excluded from NTA tax misc totals — see CLAUDE.md "Water Chemistry — Tax Exclusion Rules". |
| `name` | text | Ingredient name |
| `amount` | numeric | Amount |
| `unit` | text | `'kg'`, `'g'`, `'ml'`, `'l'` |
| `use` | text | `'mash'`, `'boil'`, `'whirlpool'`, `'dry hop'`, `'first wort'`, `'flameout'` |
| `time` | int | Minutes (boil/whirlpool time) |
| `extra` | text | AA% for hops, attenuation% for yeast, EBC for grains |
| `ibu` | numeric | Calculated IBU contribution — stored back after calc |
| `pct` | numeric | Grain bill percentage (grain rows) — calculated, stored back |
| `cost` | numeric | Cost for this row (library price × amount) |
| `sort_order` | int | Display order |

**Critical rules:**
- `id` MUST be `recipeId + '_' + index` (e.g. `r1_0`, `r1_1`). Using sequential integers causes PK collisions in Supabase when multiple recipes share ids like `1`, `2`, `3`.
- Always fetch with `&order=sort_order&limit=1000000`. PostgREST default limit is 1000 rows — silently truncates large datasets.
- Water chemistry ingredients (salts, acids) are `type='misc'` but must NEVER appear in NTA tax misc ingredient lists.
- **`libId` is local-only.** The in-memory and localStorage ingredient object carries a `libId` field linking back to the library entry (used for hydrating prices, AA%, etc. from the library), but this is intentionally NOT a column on `recipe_ingredients` — never push it to Supabase. Confirmed missing from the live database (4 May 2026); inserting `lib_id` produces `Could not find the 'lib_id' column of 'recipe_ingredients' in the schema cache`.

---

### `ferm_log`
One row per fermentation reading. All three devices INSERT rows.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | Always `crypto.randomUUID()` — NEVER `Date.now()` |
| `recipe_id` | text FK | → recipes.id |
| `entry_date` | text | ISO date string |
| `plato` | numeric | Gravity in °Plato |
| `ph` | numeric | pH reading |
| `temp` | numeric | Temperature °C |
| `notes` | text | Entry notes |

**Critical rules:**
- `id` must always be `crypto.randomUUID()`. `Date.now()` causes collisions when multiple entries are created quickly.
- Tablet and mobile use **single-row INSERT only** — never delete+reinsert the whole log.
- Always fetch with `&order=entry_date.asc&limit=1000000`.

---

### `brew_day` (JSONB blob)
One row per recipe. All three devices write via upsert.

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | text **PK** | → recipes.id |
| `data` | jsonb | All brew day fields |
| `updated_at` | timestamptz | Last write timestamp |

**Critical:** `recipe_id` is the PK, not `id`. Delete queries must use `?recipe_id=not.is.null`.

Data blob contains: mash readings (temps, volumes, pH), sparge data, pre-boil gravity/volume, OG reading, FV selection, volume into FV (mm and litres), pitch temp, hop checklist state, brew day notes.

---

### `ferm_meta` (JSONB blob)
One row per recipe. All three devices write via upsert.

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | text **PK** | → recipes.id |
| `data` | jsonb | All ferm meta fields |
| `updated_at` | timestamptz | Last write timestamp |

**Critical:** `recipe_id` is the PK. `packaged: true/false` lives here — this flag drives Complete & Archive across all devices.

Data blob contains: dry hop entries (date, amount, strain per addition), fermentation notes, other additions, yeast harvest details, tasting notes, packaged flag.

---

### `cold_side` (JSONB blob)
One row per recipe. All three devices write via upsert.

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | text **PK** | → recipes.id |
| `data` | jsonb | All packaging fields |
| `updated_at` | timestamptz | Last write timestamp |

**Critical:** `recipe_id` is the PK. Delete queries must use `?recipe_id=not.is.null`.

Data blob contains: keg rows (size, count), can size/count, flowmeter reading, transfer date, bright tank vessel, carbonation (planned/actual), total packaged (calculated), process notes, tasting notes, changes notes, analysis notes, ABV actual.

---

### `water_chem` (JSONB blob)
One row per recipe. Desktop writes via upsert. Tablet/mobile read-only (no UI).

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | text **PK** | → recipes.id |
| `data` | jsonb | All water-chemistry fields |
| `updated_at` | timestamptz | Last write timestamp |

**Critical:** `recipe_id` is the PK. Delete queries must use `?recipe_id=not.is.null`.

Data blob mirrors HTML `wcSave` output verbatim:

- `sourceProfileId` — id from `bl_water_profiles`
- `targetProfileId` — preset key (`pale` / `hazy` / `lager` / `stout` / `wheat` / `custom`) or empty for manual
- `mashVol`, `spargeVol` — water volumes (L)
- `targetPh`, `acidType` (`'lactic'` / `'phosphoric'`), `acidPct`, `acidMashMl`, `acidSpargeMl`
- `targets` — `{ ca, mg, na, so4, cl, hco3 }` per-ion target ppm
- `minerals` — `{ gypsum, cacl2, epsom, mgcl2, nacl, nahco3 }` each `{ mash, sparge }` grams

**Note:** the HTML reference originally stored `bl_water_chem_<id>` in localStorage only — it was missing from the HTML's sbSet routing table. The React rebuild routes it through `sbDispatch` to this table, matching the brew_day / ferm_meta / cold_side pattern.

---

### `settings`
Key-value store. `id` = localStorage key name, `data` = JSON value.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | localStorage key name |
| `data` | jsonb | The value |

**Critical:** `bl_brew_settings` must NEVER be overwritten during hydration — it contains Supabase credentials.

Important rows:

| Row `id` | Contents |
|---|---|
| `bl_brew_settings` | `{ sbUrl, sbAnonKey, units, ibuMethod, ... }` |
| `bl_lib_malts` | Malt library array |
| `bl_lib_hops` | Hop library array |
| `bl_lib_yeast` | Yeast library array |
| `bl_lib_misc` | Misc ingredient library array |
| `bl_tank_calib` | `{ fvId: { threshold, coneVol, lPerMm, name } }` |
| `bl_folder_list` | `[{ id, name, parentId }]` |
| `bl_planner_brews` | Production planner entries array |
| `bl_brewery_notes` | `[{ id, text, created_at }]` |
| `bl_inv_stock` | Inventory stock levels |
| `bl_equip_profiles` | Equipment profiles array |
| `bl_water_profiles` | Water profiles array |
| `bl_mash_profiles` | Mash profiles array |
| `bl_pitch_profiles` | Pitch profiles array |
| `bl_custom_styles` | Custom BJCP styles array |
| `bl_tab_visibility` | Which top-level tabs are visible |
| `bl_suppliers` | Supplier names array |

---

### `tax_records`
Working NTA tax records. Desktop only — tablet/mobile never touch.

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | text **PK** | → recipes.id |
| `brew_date` | date | |
| `brew_num` | text | |
| `recipe_name` | text | Internal tax identifier (仕込記号) |
| `beer_name` | text | Brand/display name |
| `classification` | text | `'Beer'` or `'Happoshu'` (CHECK constraint, snapshotted at submit) |
| `malt_kg`, `wheat_kg`, `oats_kg`, `other_kg`, `hops_kg`, `yeast_kg`, `water_l`, `spent_grain_kg`, `kettle_waste_l` | numeric | Ingredient inputs |
| `fv_num` | text | FV identifier |
| `fv_mm`, `into_fv_l`, `start_plato`, `finish_plato`, `abv` | numeric | Fermentation |
| `tank_num` | text | BT identifier |
| `bt_mm`, `into_bt_l` | numeric | Conditioning |
| `keg_qty` | text | Legacy field |
| `keg_total`, `can_size_ml`, `cans`, `can_total`, `total_packaged` | numeric | Legacy packaging |
| `snap_cans`, `snap_can_size_ml`, `snap_sell_can_l`, `snap_can_waste_manual`, `snap_flowmeter_l`, `snap_flowmeter_waste_l`, `snap_total_can_waste_l` | numeric | **Snap — cans** |
| `snap_keg_rows` | jsonb | Array of keg-size rows snapshotted at submit |
| `snap_sell_keg_l`, `snap_kegs_15`, `snap_kegs_10`, `snap_keg_waste_l` | numeric | **Snap — kegs** |
| `snap_into_bt_l`, `snap_yeast_harvest_l`, `snap_sell_total_l`, `snap_fv_bt_waste_l`, `snap_fv_bt_pct`, `snap_ut_waste_l`, `snap_total_waste_pkg_l`, `snap_total_waste_l`, `snap_pct_can_waste`, `snap_pct_pkg_waste`, `snap_pct_total` | numeric | **Snap — totals/percentages** |
| `snap_pkg_date` | date | Packaging date snapshot |
| `snap_transfer_into` | text | |
| `snap_bt_mm` | numeric | |
| `snap_transfer_yes` | bool | |
| `notes` | text | |

**Critical rules:**
- **PK is `recipe_id`**, not `id`. Delete queries must use `?recipe_id=not.is.null`.
- All `snap_*` fields are populated once at "Record to Tax Master" time and **never recalculated** afterwards (legal compliance).
- localStorage app format uses dashed keys (`'brew-num'`, `'snap-fv-bt-waste'`, etc.). The Supabase columns use snake_case. The two are joined by `sbBuildTaxRow` (write) / `sbUnpackTaxRow` (read).
- Tax tables are desktop-WRITE-only. Tablet/mobile NEVER touch them.

---

### `tax_master`
Committed NTA declarations. Same column list as `tax_records`. Desktop only. Treat as immutable once filed.

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | text **PK** | → recipes.id |
| All other columns | — | Identical to `tax_records` (shared `sbBuildTaxRow` builder) |

**Critical:** PK is `recipe_id`. Once a row is in `tax_master` it represents a filed declaration — do not overwrite from live data.

---

### `harvested_yeast`
One row per harvest or usage event.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `crypto.randomUUID()` |
| `strain` | text | Yeast strain — also the localStorage object key |
| `entry_type` | text | `'harvest'` or `'usage'` |
| `entry_date` | date/text | ISO date |
| `amount_l` | numeric | Litres (`got` for harvests, `used` for usages) |
| `recipe_id` | text FK | → recipes.id (nullable) |
| `beer_name` | text | Display name. For harvests = source brew's beer name; for usages = destination brew's beer name |
| `tax_batch` | text | NTA tax serial (仕込記号). For harvests = source brew's serial; for usages = destination brew's serial. Added by migration `2026-05-07_add_tax_batch_to_harvested_yeast.sql` to split out the brew-number from `beer_name`, which previously held the serial. |
| `generation` | int | Yeast generation # |
| `container` | text | Container/storage info |
| `note` | text | Free-form note |

**Critical rules:**
- localStorage `bl_harvested_yeast` is an **object keyed by strain**: `{ [strain]: { generation: number, entries: Entry[] } }`. Each `entries[]` item has `{ id, type, date, harvestDate, got, used, beer, taxBatch, harvestedFrom, harvestedFromTaxBatch, generation, container, note, recipeId }`. **Not** a flat array.
- Field semantics post-migration (2026-05-07):
  - `beer` / `taxBatch` — destination brew on usage rows (where this yeast was pitched). Joined with `", "` when a row has been pulled into multiple brews; the two are kept index-aligned so the view can zip them into "TAX — Beer" pairs.
  - `harvestedFrom` / `harvestedFromTaxBatch` — source brew on harvest rows (the brew the yeast came out of). `harvestedFrom` holds the **beer name** post-migration; legacy harvest rows that pre-date this split still hold the tax serial under `harvestedFrom` and lack `harvestedFromTaxBatch`. Display formatter (`lib/yeastDisplay.ts:formatPair`) falls back to whichever single value exists.
- Desktop dispatch uses delete-all + reinsert (not individual upserts).
- Always fetch with `&order=entry_date&limit=1000000`.

---

## LOCALSTORAGE KEY SCHEMA

Must match across all three files or sync breaks.

| Key | Type | Syncs to Supabase | Notes |
|---|---|---|---|
| `bl_recipe_list` | Array | `recipes` table | All recipes |
| `bl_recipe_ings_<id>` | Array | `recipe_ingredients` | Ingredients for one recipe |
| `bl_bd_<id>` | Object | `brew_day` blob | Brew day data for one recipe |
| `bl_ferm_log_<id>` | Array | `ferm_log` table | Ferm readings for one recipe |
| `bl_ferm_meta_<id>` | Object | `ferm_meta` blob | Includes packaged flag |
| `bl_cold_<id>` | Object | `cold_side` blob | Packaging data |
| `bl_brew_settings` | Object | `settings` | Credentials — never overwrite on hydrate |
| `bl_lib_malts` | Array | `settings` | Malt library |
| `bl_lib_hops` | Array | `settings` | Hop library |
| `bl_lib_yeast` | Array | `settings` | Yeast library |
| `bl_lib_misc` | Array | `settings` | Misc library |
| `bl_tank_calib` | Object | `settings` | FV calibration |
| `bl_folder_list` | Array | `settings` | Folder tree |
| `bl_planner_brews` | Array | `settings` | Planner entries |
| `bl_brewery_notes` | Array | `settings` | Shared notes |
| `bl_inv_stock` | Object | `settings` | Stock levels |
| `bl_equip_profiles` | Array | `settings` | Equipment profiles |
| `bl_water_profiles` | Array | `settings` | Water profiles |
| `bl_mash_profiles` | Array | `settings` | Mash profiles |
| `bl_pitch_profiles` | Array | `settings` | Pitch profiles |
| `bl_custom_styles` | Array | `settings` | Custom BJCP styles |
| `bl_suppliers` | Array | `settings` | Supplier list |
| `bl_tab_visibility` | Object | `settings` | Which tabs are shown |
| `bl_orders` | Array | Local only | Ingredient orders |
| `bl_ledger` | Object | Local only | Inventory ledger |
| `bl_checklist_<id>` | Object | Local only | Checklist state per recipe |
| `bl_inv_actuals` | Object | Local only | Reconciliation actuals |
| `bl_mob_pin` | String | Local only | Mobile PIN |
| `bl_mob_session` | Object | Local only | Mobile PIN session |
| `bl_tablet_pin` | String | Local only | Tablet PIN |
| `bl_tablet_session` | Object | Local only | Tablet PIN session |
| `bl_last_sync` | String | Local only | ISO timestamp of last sync |

---

## KEY OBJECT SHAPES

### Recipe object (in bl_recipe_list)
```js
{
  id: 'r1',
  name: '453 Sansho Lager',        // tax identifier (仕込記号)
  beerName: 'Sansho Lager',         // display name
  style: 'Japanese Rice Lager',
  styleKey: '34C',
  folder: 'f1',
  batchL: 730,
  classification: 'Beer',           // exactly 'Beer' or 'Happoshu'
  brewDate: '2026-03-21',
  brewNum: '384',
  version: 'v1',
  locked: false,
  rating: 4,
  abv: 5.2,
  ibu: 18.5,
  ebc: 4.2,
  ogPlato: 12.4,
  fgPlato: 2.8,
  lineageId: 'lin_abc123',
  notes: ''
}
```

### Ingredient object (in bl_recipe_ings_<id>)
```js
{
  id: 'r1_0',                // recipeId + '_' + index — CRITICAL
  type: 'grain',             // 'grain', 'hop', 'yeast', 'misc', 'water'
  name: 'Premium Pilsner Malt',
  amt: 150,                  // always stored in base unit (kg, g, ml)
  unit: 'kg',
  use: 'mash',
  time: null,
  extra: '3.0',             // EBC for grain, AA% for hop, atten% for yeast
  ibu: null,
  pct: 45.5,               // grain bill percentage
  libId: '42',             // library entry ID for matching
  cost: 0
}
```

### Ferm log entry
```js
{
  id: 'uuid-here',          // crypto.randomUUID() — NEVER Date.now()
  date: '2026-03-25',
  plato: 4.2,
  ph: 4.1,
  temp: 18.5,
  notes: 'Looking good'
}
```

### Planner brew entry
```js
{
  id: 'brew_abc123',
  name: '384 Sansho Lager',
  recipeId: 'r1',
  vessel: 'fv2',
  start: '2026-03-21',
  end: '2026-04-10',
  color: '#ff9f0a',
  actions: [
    { type: 'dryHop', day: 7, date: '2026-03-28', label: 'Dry Hop', emoji: '🌿' }
  ],
  fullyRecorded: false
}
```

### Brewery note
```js
{
  id: 'uuid-here',
  text: 'Check FV3 pressure today',
  created_at: '2026-03-30T09:15:00.000Z'
}
```

### Tank calibration entry
```js
calib['fv2'] = {
  name: 'FV2',
  threshold: 120,     // mm at which cylindrical section begins
  coneVol: 45,        // litres in cone below threshold
  lPerMm: 3.2         // litres per mm above threshold
}
```

---

## INGREDIENT LIBRARY ENTRY SHAPES

### Malt
```js
{
  id: '1',
  name: 'Premium Pilsner Malt (Rahr)',
  yield_pct: 80,
  ebc: 3.0,
  moisture: 4.5,
  dbfg: 1.5,
  supplier: 'Onishii',
  price: 85
}
```

### Hop
```js
{
  id: '5',
  name: 'Talus - Royal 5/25',
  alpha: 10.5,
  hop_type: 'Pellet',    // 'Pellet' or 'Whole'
  supplier: 'BET',
  price: 2800
}
```

### Yeast
```js
{
  id: '2',
  name: 'WY1056 American Ale',
  atten: 75,            // attenuation %
  supplier: 'BET',
  price: 1200
}
```

### Misc
```js
{
  id: '8',
  name: 'Whirlfloc',
  unit: 'g',
  use: 'boil',
  supplier: 'BET',
  price: 50
}
```

---

## ACTIVE BREW DEFINITION

A brew is "active" (shown on tablet/mobile active lists) when:
1. `brew_date` is in the past (≤ today), AND
2. `ferm_meta.packaged` is NOT `true`

A brew with a past brew date but no ferm log entries = **Fermenting** (not "Brew Day").

Archiving is done only from the desktop Checklist tab. Sets `ferm_meta.packaged = true`.

---

## CLASSIFICATION RULE

Beer vs Happoshu is stored once on the recipe object and synced everywhere via one function. It is never independently calculated on different pages or tabs. The stored value must always be exactly `'Beer'` or `'Happoshu'` — the Supabase CHECK constraint will reject anything else.
