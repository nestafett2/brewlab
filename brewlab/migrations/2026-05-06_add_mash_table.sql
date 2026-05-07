-- ============================================================================
-- BrewLab — Migration: add `mash` table for per-recipe mash profile sync
-- ============================================================================
--
-- Until this migration is applied, per-recipe mash profile data
-- (bl_mash_<recipeId>) lives in localStorage only. The MashProfileModal
-- writes it via lsSet but the dispatch route silently no-ops because
-- `bl_mash_*` is not in SETTINGS_KEYS, has no prefix route, and there's
-- no Supabase table to land in.
--
-- After this migration, the lib/supabase.ts dispatch route for
-- `bl_mash_<recipeId>` upserts into this table, and sbHydrate pulls
-- every row back on app load. Mash profile data syncs across devices
-- the same way brew_day / ferm_meta / cold_side / water_chem /
-- recipe_profiles already do.
--
-- Schema mirrors those five tables exactly (recipe_id PK, JSONB data,
-- auto-managed timestamps).
--
-- Idempotent: safe to re-run.
--
-- Apply from the Supabase SQL editor:

CREATE TABLE IF NOT EXISTS mash (
  recipe_id   text PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every change (matches brew_day / ferm_meta /
-- cold_side / water_chem / recipe_profiles behaviour). Reuses the same
-- trigger function the other tables already use; if your project named
-- it differently, replace `set_updated_at` with the equivalent function
-- name.
CREATE TRIGGER mash_set_updated_at
  BEFORE UPDATE ON mash
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ── Data shape inside `data` column ─────────────────────────────────────
-- Matches the MashProfile object stored at bl_mash_<recipeId>:
-- {
--   "id": "<mash-profile-id>",
--   "name": "<profile name>",
--   "ratio": 3.0,
--   "mashIn": "<step name>" | "",
--   "mashOut": "<step name>" | "",
--   "steps": [
--     { "type": "Infusion", "temp": 68, "time": 60 },
--     { "type": "Mash Out", "temp": 75, "time": 10 }
--   ],
--   "notes": ""
-- }
-- Source: brewlab/src/components/recipe/MashProfileModal.tsx
-- (buildProfileBlob) and brewlab/src/types/index.ts (MashProfile).
