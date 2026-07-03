/**
 * Water-chemistry exclusion filter — the single canonical guard for tax-build
 * code paths and the misc-display split.
 *
 * Classification rule (React, intentionally diverges from HTML reference):
 *   1. use === 'water chemistry' (case-insensitive, trimmed) → water-chem.
 *   2. Else if use is set to any other non-empty value         → NOT water-chem.
 *      Explicit user choice wins over the name regex; this prevents false
 *      positives on names that incidentally match WATER_CHEM_KW (e.g.
 *      "Kaffir Lime" used at boil) from being silently excluded from tax.
 *   3. Else (use is empty/null)                                → fall through
 *      to WATER_CHEM_KW regex on the name.
 *
 * The third filter — type='water' rows are skipped entirely — lives in
 * `iterTaxIngredients` below, not here.
 *
 * The HTML applies a both-filters-together rule at every tax-build site
 * (pullIngredientTotals 8483, pullTaxDataFromTabs 8635, ntaNormalise 11569).
 * The React port deliberately changes the combining logic; the regex
 * itself is unchanged. See CLAUDE.md "Water Chemistry — Tax Exclusion
 * Rules" for the rationale.
 *
 * Do NOT inline these checks in call sites — always use the helpers here.
 * That is the structural guarantee that display and tax stay in sync.
 */

import type { Ingredient } from '../types';

/**
 * Verbatim copy of the HTML's `waterChemKw` regex
 * (brewlab-desktop.html:8466 / 8610 / 11564). Frozen so callers can't mutate.
 */
export const WATER_CHEM_KW: RegExp =
  /gypsum|calcium.*sulfate|calcium.*chloride|magnesium|lactic.*acid|phosphoric.*acid|hydrochloric.*acid|sulfuric.*acid|chalk|bicarbonate|calcium.*carbonate|epsom|baking.*soda|sodium.*bicarbonate|potassium.*metabisulfite|campden|salts|nacl|cacl|caso4|mgso4|cacl2|table.*salt|sodium.*chloride/i;

/**
 * True if the ingredient is a water-chemistry addition that must be excluded
 * from NTA tax misc totals (and grouped under the WATER CHEMISTRY display
 * section). Explicit `use` field is decisive when set; regex is fallback
 * for legacy entries that have no use selected. See module docstring.
 */
export function isWaterChem(ing: Pick<Ingredient, 'use' | 'name'>): boolean {
  const use = (ing.use || '').trim().toLowerCase();
  if (use === 'water chemistry') return true;       // (1) explicit yes
  if (use !== '')                return false;       // (2) explicit other use wins over regex
  return WATER_CHEM_KW.test(ing.name || '');         // (3) no use → fall through to regex
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
