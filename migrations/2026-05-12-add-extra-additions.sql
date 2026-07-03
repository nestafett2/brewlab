-- Retroactive migration — column already applied to Supabase on 2026-05-12.
-- Do not re-run.
alter table recipes
  add column if not exists extra_additions text not null default '';
