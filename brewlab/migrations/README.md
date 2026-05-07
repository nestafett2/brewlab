# BrewLab — Supabase Migrations

Apply migrations in date order from the Supabase SQL editor. All migrations are idempotent (`IF NOT EXISTS`), so re-running them is safe.

---

## Phase 0 — verify current Supabase state

Before running any migration, paste this into the Supabase SQL editor to see what's already in place:

```sql
-- Check 1: deleted_at columns on recipes / ferm_log
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('recipes', 'ferm_log')
  AND column_name = 'deleted_at';

-- Check 2: recipe_profiles table exists?
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_profiles'
) AS has_recipe_profiles;

-- Check 3: mash table exists?
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'mash'
) AS has_mash;

-- Check 4: malted column on recipe_ingredients (optional)
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'recipe_ingredients' AND column_name = 'malted'
) AS has_malted_column;
```

Expected output before any migration:
- Check 1: 0 rows (column missing on both)
- Check 2: `has_recipe_profiles = false`
- Check 3: `has_mash = false`
- Check 4: `has_malted_column = false` (probably)

---

## Migrations to run for the sync layer rebuild

Run in this order. All required for the rebuild except where noted.

| # | File | Purpose | Required? |
|---|---|---|---|
| 1 | `2026-05-04_add_recipe_profiles_table.sql` | Per-recipe Equipment/Water/Pitch/Mash profile selections sync. | yes — code already targets this table |
| 2 | `2026-05-06_add_deleted_at_columns.sql` | Adds `deleted_at timestamptz` to `recipes` and `ferm_log`. Enables soft deletes that propagate cross-device. | yes — soft-delete write path will land in Phase 3 |
| 3 | `2026-05-06_add_mash_table.sql` | New `mash` JSONB blob table for `bl_mash_<recipeId>`. | yes — wired in Phase 2 |
| 4 | `2026-05-04_add_malted_column.sql` | Adds `malted bool` to `recipe_ingredients` for explicit per-row sync. | optional — defer; flip the code-side gate in `lib/supabase.ts:ingToRow` only after applying |

---

## After applying

Run the Phase 0 checks again to confirm. Expected:
- Check 1: 2 rows (`recipes.deleted_at`, `ferm_log.deleted_at`, both `timestamp with time zone`)
- Check 2: `has_recipe_profiles = true`
- Check 3: `has_mash = true`

Then ping Claude to continue with Phase 2 + Phase 3 code changes.

---

## Note on the `set_updated_at` trigger function

Migrations 1 and 3 reference `set_updated_at()` — the trigger function that auto-updates the `updated_at` column. This function should already exist (used by `brew_day`, `ferm_meta`, `cold_side`, `water_chem`). If the SQL editor errors with `function set_updated_at() does not exist`, find what the existing trigger is named (run `\df` or check one of the working tables' triggers in the Supabase dashboard) and substitute the correct name in the migration before applying.
