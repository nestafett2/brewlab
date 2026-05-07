# BrewLab — SYNC.md

Everything about how data moves between localStorage, Supabase, and across devices. Read this carefully before touching any data layer in the rebuild — most of the bugs in the original app came from getting this wrong.

---

## THE GOLDEN RULE

**Reads always come from localStorage. Writes go to localStorage first, then Supabase in the background.**

Never read from Supabase mid-session. Supabase is the backup and the cross-device sync mechanism — not the live data source during use.

---

## THE THREE FUNCTIONS

### `lsGet(key, default)`
Reads from localStorage. Returns default if key doesn't exist.
```js
function lsGet(k, d) {
  try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; }
  catch(e) { return d; }
}
```

### `lsLocal(key, value)`
Writes to localStorage ONLY. Does NOT push to Supabase.
```js
function lsLocal(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
}
```

### `lsSet(key, value)`
Writes to localStorage AND dispatches to Supabase.
```js
function lsSet(k, v) {
  lsLocal(k, v);
  sbDispatch(k, v); // pushes to Supabase in background
}
```

**When to use which:**
- `lsSet` — any user data change that should sync (recipes, ferm logs, settings, etc.)
- `lsLocal` — UI state that doesn't need to sync (active tab, scroll position, etc.)
- `lsLocal` — when hydrating FROM Supabase (to avoid re-dispatching back and causing loops)

---

## WRITE FLOW

```
User edits data
  → lsSet(key, value)
    → lsLocal() writes localStorage immediately (synchronous)
    → sbDispatch() fires (asynchronous, background)
      → determines which Supabase table based on key
      → upserts to Supabase
      → if it fails, silently continues (data safe in localStorage)
```

The UI never waits for Supabase. The user sees instant updates from localStorage.

---

## READ / HYDRATE FLOW

```
App opens OR user hits sync button
  → sbHydrate() called
    → fetch all tables from Supabase
    → for each row received:
        lsLocal(key, value)  ← NOT lsSet! Avoids re-dispatch loop.
    → app re-renders from localStorage
```

**Never use lsSet() during hydration.** Using lsSet triggers sbDispatch, which pushes back to Supabase, which can cause race conditions and data loops.

---

## sbDispatch ROUTING TABLE

`sbDispatch(key, value)` determines which Supabase table to write to:

| localStorage key pattern | Supabase table | Write method | Notes |
|---|---|---|---|
| `bl_recipe_list` | `recipes` | upsert all | Syncs entire recipe array |
| `bl_recipe_ings_*` | `recipe_ingredients` | delete all for recipe_id + insert | Full replace per recipe |
| `bl_ferm_log_*` | `ferm_log` | upsert per entry | Desktop only — tablet/mobile use single INSERT |
| `bl_bd_*` | `brew_day` | upsert blob | recipe_id as PK |
| `bl_ferm_meta_*` | `ferm_meta` | upsert blob | recipe_id as PK |
| `bl_cold_*` | `cold_side` | upsert blob | recipe_id as PK |
| `bl_water_chem_*` | `water_chem` | upsert blob | recipe_id as PK. HTML didn't sync this — added in React port. |
| `bl_brew_settings` | `settings` | upsert `{id, data}` | |
| `bl_lib_*` | `settings` | upsert `{id, data}` | |
| `bl_tank_calib` | `settings` | upsert `{id, data}` | |
| `bl_folder_list` | `settings` | upsert `{id, data}` | |
| `bl_planner_brews` | `settings` | upsert `{id, data}` | |
| `bl_brewery_notes` | `settings` | upsert `{id, data}` | |
| `bl_inv_stock` | `settings` | upsert `{id, data}` | |
| `bl_equip_profiles` | `settings` | upsert `{id, data}` | |
| `bl_water_profiles` | `settings` | upsert `{id, data}` | |
| `bl_mash_profiles` | `settings` | upsert `{id, data}` | |
| `bl_pitch_profiles` | `settings` | upsert `{id, data}` | |
| `bl_custom_styles` | `settings` | upsert `{id, data}` | |
| `bl_suppliers` | `settings` | upsert `{id, data}` | |
| `bl_tab_visibility` | `settings` | upsert `{id, data}` | |

Keys NOT dispatched to Supabase (local only):
- `bl_orders`, `bl_ledger`, `bl_checklist_*`, `bl_inv_actuals`
- `bl_mob_pin`, `bl_mob_session`, `bl_tablet_pin`, `bl_tablet_session`
- `bl_last_sync`, UI state keys

---

## SUPABASE API PATTERNS

### Connection config
```js
function sbCfg() {
  const s = lsGet('bl_brew_settings', {});
  if (!s.sbUrl || !s.sbAnonKey) return null;
  return { url: s.sbUrl.replace(/\/$/, ''), key: s.sbAnonKey };
}
```

### Read headers
```js
{ 'apikey': key, 'Authorization': 'Bearer ' + key }
```

### Write / upsert headers (merge on PK)
```js
{
  'apikey': key,
  'Authorization': 'Bearer ' + key,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates'
}
```

### Single INSERT (ferm_log entries — tablet/mobile)
```js
{
  'apikey': key,
  'Authorization': 'Bearer ' + key,
  'Content-Type': 'application/json'
  // No 'Prefer' header — plain insert, fails on duplicate
}
```

---

## CRITICAL: ROW LIMIT

PostgREST has a default limit of 1000 rows per fetch. This silently truncates results with no error. **Always add `&limit=1000000`** to any fetch that can return multiple rows:

```
/recipe_ingredients?select=*&order=sort_order&limit=1000000
/ferm_log?select=*&order=entry_date.asc&limit=1000000
```

This was a real production bug — at ~45 recipes with ~22 ingredients each, ingredient fetches silently truncated and overwrote localStorage with incomplete data.

---

## CRITICAL: PK COLUMNS DIFFER BY TABLE

When deleting rows, the filter column depends on the table:

**Tables with `id` as PK — use `?id=not.is.null`:**
- `recipes`
- `recipe_ingredients`
- `ferm_log`
- `settings`
- `harvested_yeast`
- `tax_records`
- `tax_master`

**Tables with `recipe_id` as PK — use `?recipe_id=not.is.null`:**
- `brew_day`
- `ferm_meta`
- `cold_side`
- `water_chem`

Using the wrong filter column causes deletes to silently skip all rows.

---

## CRITICAL: INGREDIENT ID FORMAT

```js
// CORRECT — globally unique across all recipes
id: recipeId + '_' + index   // e.g. 'r1_0', 'r1_1', 'r2_0'

// WRONG — causes PK collisions in Supabase
id: index   // e.g. 1, 2, 3 — recipe r1 and r2 both have id=1
```

When recipe r1 has ingredient id=1 and recipe r2 has ingredient id=1, the second INSERT silently fails or overwrites the first in Supabase, depending on how the upsert is written.

---

## DEVICE WRITE PERMISSIONS

| Table | Desktop | Tablet | Mobile |
|---|---|---|---|
| `recipes` | ✓ WRITE | ✗ read only | ✗ read only |
| `recipe_ingredients` | ✓ WRITE | ✗ read only | ✗ read only |
| `ferm_log` | ✓ WRITE | ✓ INSERT only | ✓ INSERT only |
| `brew_day` | ✓ WRITE | ✓ upsert | ✓ upsert |
| `ferm_meta` | ✓ WRITE | ✓ upsert | ✓ upsert |
| `cold_side` | ✓ WRITE | ✓ upsert | ✓ upsert |
| `settings` | ✓ WRITE | ✗ read only | ✓ bl_brewery_notes only |
| `tax_records` | ✓ WRITE | ✗ NEVER | ✗ NEVER |
| `tax_master` | ✓ WRITE | ✗ NEVER | ✗ NEVER |
| `harvested_yeast` | ✓ WRITE | ✓ delete+reinsert | ✗ NEVER |

---

## DELETION SYNC PROBLEM (NOT YET SOLVED)

**Current behaviour:** Deletions on one device do not propagate to others.

Example:
1. Recipe deleted on desktop → removed from Supabase ✓
2. Tablet still has recipe in localStorage
3. Tablet syncs → pushes recipe back to Supabase
4. Recipe reappears everywhere

**Planned fix for rebuild:**
- Add `deleted_at` timestamp column to `recipes` and `ferm_log`
- Instead of deleting a row, stamp it: `deleted_at = now()`
- On sync, any row where `deleted_at` is newer than the device's last sync → remove locally
- "Last timestamp wins" — whether edit or deletion
- Ingredients cascade-delete by `recipe_id` — no per-row tombstone needed
- JSONB blob tables (`brew_day`, `ferm_meta`, `cold_side`, `water_chem`) naturally disappear when recipe is gone

**Sync warning (to implement with fix):**
Before applying any incoming deletion, show a confirmation:
> "This sync will remove X recipes and Y ferm log entries from this device. Continue?"
Trigger on ANY incoming deletion, not just bulk ones.

---

## CROSS-DEVICE SYNC ORDER PROBLEM

**Current behaviour:** If tablet enters ferm data and desktop opens before syncing, desktop shows stale localStorage data.

**Workaround:** Always hit the sync button (↻) when opening any device after another device has been used.

**Planned fix for rebuild:** On app startup, always hydrate from Supabase before rendering. Show a brief loading state. Fall back to localStorage if Supabase is unreachable (offline mode).

---

## SETTINGS TABLE — PROTECTED KEY

`bl_brew_settings` stores Supabase credentials. During hydration, this key must NEVER be overwritten:

```js
// During sbHydrate(), skip this key:
if (row.id === 'bl_brew_settings') continue;
```

If credentials get overwritten by a hydration, the app loses its Supabase connection.

---

## RESET ALL DATA

Desktop: Settings → Connection → Reset All Data button
- Deletes all rows from Supabase (uses correct PK filters per table)
- Clears all `bl_` keys from localStorage
- Reloads page

Tablet/Mobile: Settings → Reset This Device
- Clears all `bl_` keys from localStorage only
- Does NOT touch Supabase
- Reloads page

**Correct order for full reset:**
1. Reset on desktop first (wipes Supabase + desktop local)
2. Reset on tablet (wipes tablet local)
3. Reset on mobile (wipes mobile local)
4. Re-enter Supabase credentials on each device → sync → clean slate

---

## HARVESTED YEAST — SPECIAL CASE

Tablet uses a delete-all + reinsert pattern (not individual upserts):
```js
// Delete all existing rows for this data
DELETE /harvested_yeast?id=not.is.null

// Then insert all rows fresh
POST /harvested_yeast [array of rows]
```

Desktop uses standard upsert. Mobile never touches this table.

---

## FERM LOG — TABLET/MOBILE PATTERN

Tablet and mobile use single-row INSERT (not upsert, not delete+reinsert):
```js
POST /ferm_log
body: { id: crypto.randomUUID(), recipe_id: ..., ... }
```

Desktop uses full upsert of the entire log array for a recipe.

Both approaches are correct — they just reflect the different write patterns of each device.

---

## KNOWN PITFALLS ENCOUNTERED IN ORIGINAL BUILD

1. **Using lsSet during hydration** → caused re-dispatch loops pushing data back to Supabase
2. **Sequential ingredient IDs** → caused PK collisions, only last recipe's ingredients survived
3. **Missing &limit=1000000** → silently truncated at 1000 rows, broke at ~45 recipes
4. **Using ?id=not.is.null on blob tables** → deletes silently skipped, Reset button didn't work
5. **Date.now() for ferm_log IDs** → caused collisions when multiple entries created quickly
6. **Desktop open while deleting from Supabase dashboard** → desktop immediately re-synced and refilled the tables
7. **Overwriting bl_brew_settings during hydration** → lost Supabase credentials
