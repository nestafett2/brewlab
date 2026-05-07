/**
 * Water-chemistry exclusion filter — the single canonical guard for tax-build
 * code paths. CLAUDE.md "Water Chemistry — Tax Exclusion Rules" mandates that
 * three filters always run together at every tax-build point:
 *
 *   1. `(use || '').toLowerCase() === 'water chemistry'`
 *   2. WATER_CHEM_KW regex match on the ingredient name
 *   3. type='water' rows are skipped (never iterated for tax totals)
 *
 * The HTML applies these inline at multiple sites (pullIngredientTotals
 * line 8483, pullTaxDataFromTabs line 8635, ntaNormalise line 11569). The
 * React port routes every site through `iterTaxIngredients` so the three
 * filters can never accidentally drift apart.
 *
 * Do NOT inline these checks in tax/NTA call sites — always use the helpers
 * here. That is the structural guarantee.
 */

import type { Ingredient } from '../types';

/**
 * Verbatim copy of the HTML's `waterChemKw` regex
 * (brewlab-desktop.html:8466 / 8610 / 11564). Frozen so callers can't mutate.
 */
export const WATER_CHEM_KW: RegExp =
  /gypsum|calcium.*sulfate|calcium.*chloride|magnesium|lactic.*acid|phosphoric.*acid|hydrochloric.*acid|sulfuric.*acid|chalk|lime|bicarbonate|calcium.*carbonate|epsom|baking.*soda|sodium.*bicarbonate|potassium.*metabisulfite|campden|salts|nacl|cacl|caso4|mgso4|cacl2|table.*salt|sodium.*chloride/i;

/**
 * True if the ingredient is a water-chemistry addition that must be excluded
 * from NTA tax misc/grain totals. Matches the HTML's two-filter pair
 * (use field + name regex) — both run together.
 */
export function isWaterChem(ing: Pick<Ingredient, 'use' | 'name'>): boolean {
  const use = (ing.use || '').toLowerCase();
  if (use === 'water chemistry') return true;
  if (WATER_CHEM_KW.test(ing.name || '')) return true;
  return false;
}

/**
 * Iterate ingredients in tax-totals contexts. Yields ONLY:
 *   - type='grain' rows (always)
 *   - type='misc'  rows that pass !isWaterChem
 *
 * Skips type='water' rows entirely (filter 3 — water adjustments live in
 * recipe_ingredients alongside misc/grain but must never enter tax totals).
 * Hops/yeast are also skipped — their totals are computed separately by the
 * caller using the full ingredients array.
 */
export function* iterTaxIngredients(ings: Ingredient[]): Generator<Ingredient> {
  for (const ing of ings) {
    if (ing.type === 'grain') {
      yield ing;
      continue;
    }
    if (ing.type === 'misc') {
      if (isWaterChem(ing)) continue;
      yield ing;
      continue;
    }
    // type === 'water' | 'hop' | 'yeast' → skip
  }
}
