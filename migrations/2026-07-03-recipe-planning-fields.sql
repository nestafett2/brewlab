alter table recipes
  add column if not exists recipe_pitch_temp  numeric,
  add column if not exists recipe_ferm_temp   numeric,
  add column if not exists recipe_o2_lpm      numeric,
  add column if not exists recipe_o2_time     numeric,
  add column if not exists target_finish_ph   numeric,
  add column if not exists planned_carb       numeric;
