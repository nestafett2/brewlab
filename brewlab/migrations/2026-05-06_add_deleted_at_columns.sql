-- ============================================================================
-- BrewLab — Migration: add `deleted_at` soft-delete columns to recipes
-- and ferm_log.
-- ============================================================================
--
-- Required for the sync layer rebuild. Until this migration is applied,
-- deletions on one device do NOT propagate to other devices: the local
-- delete just shrinks the array and the sbDispatch upsert merges the
-- remaining rows back, leaving the deleted row in Supabase forever
-- (HTML's original deletion-sync bug — see CLAUDE.md "Architecture
-- Principles → Deletion sync").
--
-- After this migration:
--   • The store's deleteRecipe action stamps `deleted_at = now()` via
--     sbDispatch instead of pushing a shrunken array.
--   • A new removeFermLogEntry action does the same on ferm_log rows.
--   • sbHydrate's existing read path (which already filters
--     `!r.deleted_at` and computes `deletedRecipeIds` /
--     `deletedFermLogIds`) starts behaving correctly — it was a no-op
--     before because the column didn't exist (undefined → !undefined →
--     true → all rows treated as active).
--
-- Backfill: not needed. NULL means "active" — same semantics as a
-- pre-rebuild row.
--
-- Idempotent: safe to re-run.
--
-- Apply from the Supabase SQL editor:

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE ferm_log
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Optional: indexes on deleted_at speed up the hydration filter
-- (`select * from recipes where deleted_at is null`). At brewery scale
-- (~50 recipes/year, a few thousand ferm_log rows) the filter cost is
-- negligible without indexes, but they don't hurt and are cheap to add.

CREATE INDEX IF NOT EXISTS recipes_deleted_at_idx
  ON recipes (deleted_at);

CREATE INDEX IF NOT EXISTS ferm_log_deleted_at_idx
  ON ferm_log (deleted_at);
