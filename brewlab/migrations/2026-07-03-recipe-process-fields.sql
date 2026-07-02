-- ============================================================================
-- BrewLab — Add bh_eff / boil_time / whirlpool_temp columns to recipes
-- ============================================================================
--
-- bhEff, boilTime, and whirlpoolTemp were local-only: recipeToRow never
-- wrote them and rowToRecipe hardcoded defaults (67.60, 45, 85) on every
-- hydrate, silently overwriting whatever the brewer had set. This adds the
-- Supabase columns so the three fields round-trip across devices.
--
-- Run this from the Supabase SQL editor.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS bh_eff        numeric,
  ADD COLUMN IF NOT EXISTS boil_time     integer,
  ADD COLUMN IF NOT EXISTS whirlpool_temp integer;
