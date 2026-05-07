-- ============================================================================
-- BrewLab — Optional migration: add `malted` column to recipe_ingredients
-- ============================================================================
--
-- This migration is OPTIONAL. The `malted` flag is currently local-only
-- (see lib/supabase.ts:ingToRow). The flag distinguishes malted vs unmalted
-- grain so the Tax tab and NTA Submitter can bucket malt / wheat / oats /
-- other correctly per JNTA rules.
--
-- The flag is driven from `MaltLib.malted` at recipe-edit time, so the
-- per-row Ingredient.malted value is recoverable from the library on any
-- device. Cross-device sync of the cached value is therefore not required
-- for correctness — only for performance / explicit override.
--
-- Run this migration ONLY if:
--   - You want unmalted grain rows to round-trip the explicit flag value
--     across devices (rather than re-derive from MaltLib at load time).
--
-- After running, re-enable the write in lib/supabase.ts:ingToRow by adding
--   `malted:     ing.malted === undefined ? null : ing.malted,`
-- to the row payload. (See the comment block in that function.)
--
-- Run this from the Supabase SQL editor:

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS malted boolean DEFAULT true;

-- Backfill: every existing row defaults to TRUE per the column DEFAULT.
-- For users with explicitly-unmalted grain rows in their localStorage cache,
-- the value will be re-written on the next recipe save once the React code
-- re-enables the write.
