-- Add OEM/Collab/Own Brand origin classification to recipes
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS recipe_origin text CHECK (recipe_origin IN ('own', 'collab', 'oem')),
  ADD COLUMN IF NOT EXISTS oem_for text;
