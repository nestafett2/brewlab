/**
 * Profile lock detection — derived state, not stored.
 *
 * A profile (equipment / mash / pitch) is locked when at least one recipe
 * (a) selected it via `bl_recipe_profiles_<recipeId>.{equip|mash|pitch}` and
 * (b) has a brew_day blob whose `measOg` parses to > 0 (post-boil OG was
 * recorded — strong "this brew happened" signal). Drafts and tab-exploration
 * typing don't lock.
 *
 * Storage shape:
 *   - Recipe selection: `bl_recipe_profiles_<id>` → { equip, water, pitch, mash }
 *   - Brew day data:   `bl_bd_<id>` → BrewDayData with measOg as string
 *
 * Returned Map<profileId, count> drives the UI: lock icon shown when present,
 * count surfaced in the tooltip ("used in N saved brews").
 *
 * Water profiles intentionally excluded — their values flow through the
 * per-recipe `bl_water_chem_<id>` blob, not the profile itself, so the
 * retroactive-shift concern is different. Add when needed.
 */

import { lsGet } from './storage';
import type { Recipe, RecipeProfileSelections, BrewDayData } from '../types';

export type LockableProfileKind = 'equip' | 'mash' | 'pitch';

export function computeLockedProfileIds(
  recipes: Recipe[],
  recipeProfilesCache: Record<string, RecipeProfileSelections>,
  kind: LockableProfileKind,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of recipes) {
    const sel = recipeProfilesCache[r.id]
      ?? lsGet<RecipeProfileSelections>(`bl_recipe_profiles_${r.id}`, {});
    const profileId = sel?.[kind];
    if (!profileId) continue;
    const bd = lsGet<BrewDayData | null>(`bl_bd_${r.id}`, null);
    if (!bd) continue;
    const og = parseFloat(bd.measOg ?? '');
    if (!isFinite(og) || og <= 0) continue;
    counts.set(profileId, (counts.get(profileId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Build a non-colliding clone name. Trailing ` v<digits>` increments;
 * absent, ` v2` is appended. Re-increments until the name is unique
 * within `existingNames` (case-insensitive trim compare).
 *
 * Examples:
 *   "Brewhouse"      + []                       → "Brewhouse v2"
 *   "Brewhouse v1"   + ["Brewhouse v1"]         → "Brewhouse v2"
 *   "Brewhouse v3"   + ["Brewhouse v3","v4"]    → "Brewhouse v4" (no clash on v4 since input names compared as-is)
 *   "Brewhouse"      + ["Brewhouse v2"]         → "Brewhouse v3"
 */
export function nextCloneName(name: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map(n => n.trim().toLowerCase()));
  const m = name.match(/^(.*?)(?:\s+v(\d+))?\s*$/);
  const base = (m?.[1] ?? name).trim();
  let n = m?.[2] ? parseInt(m[2], 10) + 1 : 2;
  let candidate = `${base} v${n}`;
  while (taken.has(candidate.trim().toLowerCase())) {
    n += 1;
    candidate = `${base} v${n}`;
  }
  return candidate;
}
