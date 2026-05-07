-- ============================================================================
-- BrewLab — Migration: add `recipe_profiles` table for per-recipe profile
-- selection sync (Equipment / Water / Pitch / Mash).
-- ============================================================================
--
-- Until this migration is applied, per-recipe profile selections work in
-- single-device mode: the dropdowns persist to localStorage and the
-- BrewDay / WaterTab calcs read them locally, but selecting "Main System"
-- Equipment on desktop won't propagate to the iPad.
--
-- After this migration, the lib/supabase.ts dispatch route for
-- `bl_recipe_profiles_<recipeId>` upserts into this table, and sbHydrate
-- pulls every row back on app load. Selections sync across devices the
-- same way brew_day / ferm_meta / cold_side / water_chem already do.
--
-- Schema mirrors those four tables exactly (recipe_id PK, JSONB data,
-- auto-managed timestamps).
--
-- Apply from the Supabase SQL editor:

CREATE TABLE IF NOT EXISTS recipe_profiles (
  recipe_id   text PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every change (matches brew_day / ferm_meta /
-- cold_side / water_chem behaviour). Reuses the same trigger function the
-- other tables already use; if your project named it differently, replace
-- `set_updated_at` with the equivalent function name.
CREATE TRIGGER recipe_profiles_set_updated_at
  BEFORE UPDATE ON recipe_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ── Data shape inside `data` column ─────────────────────────────────────
-- {
--   "equip": "<equipment-profile-id>" | undefined,
--   "water": "<water-profile-id>"     | undefined,
--   "pitch": "<pitch-profile-id>"     | undefined,
--   "mash":  "<mash-profile-id>"      | undefined
-- }
-- Each id matches a row in the corresponding profile list stored in the
-- `settings` table (bl_equip_profiles / bl_water_profiles / bl_pitch_profiles
-- / bl_mash_profiles). React reads selections via the
-- recipeProfilesByRecipe store slice and sync is wired through
-- setRecipeProfileKind (store/index.ts) → lsSet → sbDispatch.
