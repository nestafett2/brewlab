/**
 * Shared formatting for brew references — surfaces that show a planner
 * brew need a consistent display: `#X beerName` with a `v1.2` version
 * tag derived from the linked recipe.
 *
 * A `PlannerBrew` carries `recipeId?` — when present and resolvable, we
 * pull `brewNumber` + `beerName` + `version` off the recipe. When
 * absent (freeform planner brew) or unresolvable (recipe deleted), we
 * fall back to `brew.name` alone with `fallbackOnly: true` so callers
 * know to skip the version slot.
 *
 * Used by Brewery Overview today; PlannerUpcoming will adopt this
 * later (currently shows raw `brew.name`).
 */

import type { PlannerBrew, Recipe } from '../types';

export interface BrewLine {
  /** First-line label. With recipe: `#3 Hazy IPA`. Without: `brew.name`. */
  primary: string;
  /** `v1.2` or null — null only when fallbackOnly is true. */
  version: string | null;
  /** True when no recipe context was available. Callers can suppress
   *  the version slot entirely rather than rendering an empty line. */
  fallbackOnly: boolean;
}

export function formatBrewLine(brew: PlannerBrew, recipe?: Recipe | null): BrewLine {
  if (!recipe) {
    return { primary: brew.name, version: null, fallbackOnly: true };
  }
  const display = recipe.beerName || recipe.name || brew.name;
  const hasNum = typeof recipe.brewNumber === 'number' && recipe.brewNumber > 0;
  const primary = hasNum ? `#${recipe.brewNumber} ${display}` : display;
  const version = `v${recipe.version || '1.0'}`;
  return { primary, version, fallbackOnly: false };
}

/** Build the optional 3-line style sub-line: `style · {batchL}L`. Empty
 *  string when style is missing — caller should suppress the line. */
export function formatBrewStyleLine(recipe: Recipe | null | undefined): string {
  if (!recipe) return '';
  const style = (recipe.style || '').trim();
  const batch = recipe.batchL > 0 ? `${recipe.batchL}L` : '';
  if (style && batch) return `${style} · ${batch}`;
  return style || batch;
}
