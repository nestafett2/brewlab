-- ============================================================================
-- BrewLab — Add `yeast_source` and `yeast_gen` columns to recipe_ingredients
-- ============================================================================
--
-- Persists the harvested-yeast link previously held only in local state.
-- Without these columns the FermTab "Log Harvest to Inventory" pre-fill
-- always treats the parent brew as fresh-pitched (Gen 1 → suggest Gen 2)
-- after a cross-device hydrate, even when the recipe was pitched on
-- harvested yeast at a higher generation.
--
-- Both columns are NULL for non-yeast rows. For yeast rows:
--   yeast_source — 'fresh' | 'harvested' (free text; HTML/React only
--                  emit those two values)
--   yeast_gen    — integer generation of the parent yeast (the entry the
--                  recipe is pitched on). Only set when source='harvested'.
--
-- No backfill: existing rows stay NULL. The FermTab harvest pre-fill
-- falls back to "fresh / Gen 2" (the pre-migration behaviour) until the
-- recipe is re-saved.
--
-- Run this from the Supabase SQL editor.

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS yeast_source text NULL;

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS yeast_gen integer NULL;
