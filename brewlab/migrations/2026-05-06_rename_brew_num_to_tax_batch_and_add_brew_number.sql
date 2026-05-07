-- ============================================================================
-- BrewLab — Migration: rename `recipes.brew_num` → `recipes.tax_batch`,
-- and add a new per-lineage `recipes.brew_number` counter column.
-- ============================================================================
--
-- Naming rationale:
--   • `brew_num` was always the brewery-wide manual NTA tax serial (free
--     text values like "384", brewery-wide UNIQUE). The original name
--     read confusingly close to "brew number" / "batch number" — which
--     have unrelated meanings in brewery jargon (per-lineage sequential
--     counters, not tax serials). Renaming to `tax_batch` makes the
--     semantic explicit.
--   • `brew_number` is the new per-lineage sequential counter
--     (HTML's `r.batchNumber`, never previously ported). Auto-incremented
--     by the new "+ New Brew" action: max(brew_number) over the lineage,
--     plus one. NO unique constraint — two different lineages can both
--     have brew_number=1.
--
-- Code-side gate (lib/supabase.ts):
--   • Pre-migration: recipeToRow OMITS the `brew_number` column from the
--     payload (commented gate). Without this, supabase-js returns
--     PGRST204 ("column does not exist") and the upsert fails.
--   • Post-migration: re-enable the `brew_number` write by uncommenting
--     the line in recipeToRow. Until that flip, brew_number is local-only
--     in localStorage; cross-device sync of the field is degraded but
--     local writes still succeed.
--   • The brew_num → tax_batch rename has NO gate — the same code-side
--     change to write `tax_batch` instead of `brew_num` lands together
--     with the migration. Apply the migration BEFORE deploying the new
--     code (or accept temporary upsert failures during the gap).
--
-- Data preservation:
--   • The RENAME COLUMN preserves all existing data, the UNIQUE
--     constraint, and any indexes. Postgres updates the schema in place;
--     no row rewrite needed.
--   • `brew_number` defaults to NULL on existing rows — equivalent to
--     "unnumbered" / "first brew of this lineage" in the new semantics.
--     The brewer can backfill manually if desired.
--
-- Idempotent: safe to re-run.
--
-- Apply from the Supabase SQL editor:

-- ── 1. Rename brew_num → tax_batch ─────────────────────────────────────
-- IF EXISTS guard handles re-runs after the rename has already happened.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'brew_num'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'tax_batch'
  ) THEN
    ALTER TABLE recipes RENAME COLUMN brew_num TO tax_batch;
  END IF;
END $$;

-- The UNIQUE constraint on the column was named `recipes_brew_num_key`
-- by Postgres convention; renaming the column does NOT rename the
-- constraint. Rename the constraint too so future schema dumps are
-- consistent. Idempotent via the EXISTS guard.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recipes_brew_num_key'
  ) THEN
    ALTER TABLE recipes
      RENAME CONSTRAINT recipes_brew_num_key TO recipes_tax_batch_key;
  END IF;
END $$;

-- ── 2. Add brew_number (per-lineage sequential counter) ───────────────
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS brew_number int;

-- Optional index — at brewery scale the per-lineage max-find is cheap
-- without it, but doesn't hurt.
CREATE INDEX IF NOT EXISTS recipes_brew_number_idx
  ON recipes (brew_number);

-- ── 3. (Reminder) flip the code-side gate ──────────────────────────────
-- After this migration runs cleanly, uncomment the brew_number write in
-- lib/supabase.ts:recipeToRow. See the gate comment in that file.
