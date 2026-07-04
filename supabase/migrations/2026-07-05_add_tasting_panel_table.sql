-- Remember to run this migration in Supabase before testing.
create table if not exists tasting_panel (
  recipe_id text primary key references recipes(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

create or replace function update_tasting_panel_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger tasting_panel_updated_at
  before update on tasting_panel
  for each row execute procedure update_tasting_panel_updated_at();
