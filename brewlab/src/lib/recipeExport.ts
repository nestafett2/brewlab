/**
 * BeerXML 1.0 recipe export — pure serialization layer. Symmetric to
 * `components/recipe/recipeImport.ts`: every field the importer reads is
 * written here, so export → import is round-trippable for the data this
 * app cares about.
 *
 * Diverges from the HTML reference (`brewlab-desktop.html:5157
 * recipeToXML`) in two intentional ways:
 *
 *   1. SI units (kg, L) instead of HTML's US units (lbs, oz, gal). The
 *      React importer reads `parseFloat(AMOUNT)` as kg for fermentables /
 *      misc and as L for batch/yeast — round-trip requires we write the
 *      same units the importer reads.
 *   2. Writes <MASH><MASH_STEPS> and <FG>, which HTML never wrote. The
 *      React importer reads both, so export must include them or the
 *      round-trip drops the mash schedule and final-gravity target.
 *
 * Water-chemistry handling: BeerXML has no native concept of water
 * adjustments, so both `type='water'` rows and `type='misc'` rows that
 * `isWaterChem` flags are emitted as <MISC> with <USE>Water Chemistry</USE>.
 * On re-import they all come back as `type='misc'` with `use='water
 * chemistry'`, which the tax-exclusion path treats identically to the
 * original `type='water'` rows (see lib/waterChem.ts).
 *
 * Pure module: no DOM IO, no store imports. The Desktop.tsx caller is
 * responsible for resolving the active recipe + ingredients + mash blob
 * and triggering the browser download.
 */

import type { Ingredient, MashProfile, Recipe } from '../types';
import { isWaterChem } from './waterChem';

/** Inverse of recipeImport's `sgToPlato`. Using the simple linear form
 *  (not the more accurate platoToSg) keeps the round-trip exact:
 *  exporter writes SG, importer reads it back to the same °P. */
const platoToSgSimple = (plato: number): number => 1 + (plato * 4) / 1000;

/** SRM is the BeerXML colour unit. Same factor as recipeImport.ts. */
const ebcToSrm = (ebc: number): number => ebc / 1.97;

/** Minimal XML escape for text content + attribute values. Newlines in
 *  NOTES are preserved (BeerXML readers handle them). */
function esc(s: string | number | null | undefined): string {
  const str = s == null ? '' : String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** BJCP key '21A' → ['21', 'A']. Anything that doesn't fit is returned
 *  as ['0', 'A'] so the BeerXML element validates. */
function splitStyleKey(styleKey: string): [string, string] {
  const m = (styleKey || '').match(/^(\d+)([A-Za-z])$/);
  return m ? [m[1], m[2].toUpperCase()] : ['0', 'A'];
}

/** Title-case the React internal hop/misc `use` value for the BeerXML
 *  USE element. The importer regex matches case-insensitively, so this
 *  is purely for human readability + cross-app convention. */
function titleCaseUse(use: string): string {
  const u = (use || '').trim();
  if (!u) return 'Boil';
  return u.replace(/\b\w/g, c => c.toUpperCase());
}

/** Strip number to fixed decimals without trailing zeros, but keep at
 *  least one decimal place — BeerXML readers accept both forms. */
function num(n: number, decimals: number): string {
  if (!isFinite(n)) return '0';
  return n.toFixed(decimals);
}

/**
 * Serialise one recipe as a `<RECIPE>...</RECIPE>` block (no XML prolog,
 * no `<RECIPES>` wrapper). Caller composes the prolog + outer wrapper
 * via `wrapRecipesDocument`.
 *
 * `mashProfile` is optional — pass `null`/`undefined` to omit the
 * <MASH> element entirely (matches the importer's "no <MASH> = no
 * change" semantics).
 */
export function recipeToBeerXML(
  recipe: Recipe,
  ings: Ingredient[],
  mashProfile?: MashProfile | null,
): string {
  const grains = ings.filter(i => i.type === 'grain');
  const hops   = ings.filter(i => i.type === 'hop');
  const yeasts = ings.filter(i => i.type === 'yeast');
  // Both real misc rows and `type='water'` rows surface as <MISC> elements.
  // The importer can only re-create them as `type='misc'` (BeerXML has no
  // 'water' element); the water-chem tag preserves their tax-exclusion
  // semantics on round-trip.
  const miscs = ings.filter(i => i.type === 'misc' || i.type === 'water');

  const batchL   = recipe.batchL || 0;
  const boilL    = batchL * 1.1;
  const og       = recipe.ogPlato > 0 ? platoToSgSimple(recipe.ogPlato) : 0;
  const fg       = recipe.fgPlato > 0 ? platoToSgSimple(recipe.fgPlato) : 0;
  const [catNum, styleLetter] = splitStyleKey(recipe.styleKey);

  let x = '  <RECIPE>\n';
  x += `    <NAME>${esc(recipe.beerName || recipe.name)}</NAME>\n`;
  x += '    <VERSION>1</VERSION>\n';
  x += '    <TYPE>All Grain</TYPE>\n';
  // STYLE — keep it on one line for HTML-reference parity.
  x += `    <STYLE><NAME>${esc(recipe.style || '')}</NAME>` +
       `<VERSION>1</VERSION>` +
       `<CATEGORY></CATEGORY>` +
       `<CATEGORY_NUMBER>${esc(catNum)}</CATEGORY_NUMBER>` +
       `<STYLE_LETTER>${esc(styleLetter)}</STYLE_LETTER>` +
       `<STYLE_GUIDE>BJCP</STYLE_GUIDE>` +
       `<TYPE>Ale</TYPE>` +
       `<OG_MIN>1.000</OG_MIN><OG_MAX>1.150</OG_MAX>` +
       `<FG_MIN>1.000</FG_MIN><FG_MAX>1.030</FG_MAX>` +
       `<IBU_MIN>0</IBU_MIN><IBU_MAX>120</IBU_MAX>` +
       `<COLOR_MIN>0</COLOR_MIN><COLOR_MAX>40</COLOR_MAX>` +
       `</STYLE>\n`;
  x += `    <BREWER>${esc(recipe.beerName || recipe.name)}</BREWER>\n`;
  x += `    <BATCH_SIZE>${num(batchL, 2)}</BATCH_SIZE>\n`;
  x += `    <BOIL_SIZE>${num(boilL, 2)}</BOIL_SIZE>\n`;
  x += `    <BOIL_TIME>${recipe.boilTime || 60}</BOIL_TIME>\n`;
  x += `    <EFFICIENCY>${num(recipe.bhEff || 75, 1)}</EFFICIENCY>\n`;
  if (og > 0) x += `    <OG>${num(og, 4)}</OG>\n`;
  if (fg > 0) x += `    <FG>${num(fg, 4)}</FG>\n`;
  x += `    <NOTES>${esc(recipe.notes || '')}</NOTES>\n`;

  // ── Hops ─────────────────────────────────────────────────────────────
  if (hops.length) {
    x += '    <HOPS>\n';
    for (const h of hops) {
      const grams = (h.amt || 0);
      const aa    = parseFloat(h.extra || '') || 0;
      x += '      <HOP>\n';
      x += `        <NAME>${esc(h.name)}</NAME>\n`;
      x += '        <VERSION>1</VERSION>\n';
      x += `        <ALPHA>${num(aa, 2)}</ALPHA>\n`;
      x += `        <AMOUNT>${num(grams / 1000, 4)}</AMOUNT>\n`;
      x += `        <USE>${esc(titleCaseUse(h.use))}</USE>\n`;
      x += `        <TIME>${h.time ?? 0}</TIME>\n`;
      x += '        <FORM>Pellet</FORM>\n';
      x += '      </HOP>\n';
    }
    x += '    </HOPS>\n';
  }

  // ── Fermentables ─────────────────────────────────────────────────────
  if (grains.length) {
    x += '    <FERMENTABLES>\n';
    for (const g of grains) {
      // The importer's malted-derivation regex matches /(adjunct|sugar|fruit|juice)/i.
      // `g.malted !== false` matches HTML/React semantics (undefined = malted).
      const malted = g.malted !== false;
      const fermType = malted ? 'Grain' : 'Adjunct';
      const ebc      = parseFloat(g.extra || '') || 0;
      x += '      <FERMENTABLE>\n';
      x += `        <NAME>${esc(g.name)}</NAME>\n`;
      x += '        <VERSION>1</VERSION>\n';
      x += `        <TYPE>${fermType}</TYPE>\n`;
      x += `        <AMOUNT>${num(g.amt || 0, 4)}</AMOUNT>\n`;
      x += '        <YIELD>80.0</YIELD>\n';
      x += `        <COLOR>${num(ebcToSrm(ebc), 1)}</COLOR>\n`;
      x += '      </FERMENTABLE>\n';
    }
    x += '    </FERMENTABLES>\n';
  }

  // ── Miscs (incl. water-chem and water-typed rows) ────────────────────
  if (miscs.length) {
    x += '    <MISCS>\n';
    for (const m of miscs) {
      // type='water' rows always go out as Water Chemistry. type='misc'
      // rows defer to isWaterChem (which respects the explicit `use`
      // selector first, name regex only as fallback).
      const wc = m.type === 'water' || isWaterChem(m);
      const useStr = wc ? 'Water Chemistry' : titleCaseUse(m.use);
      // amt is grams in the React store; BeerXML AMOUNT is kg.
      const kg = (m.amt || 0) / 1000;
      x += '      <MISC>\n';
      x += `        <NAME>${esc(m.name)}</NAME>\n`;
      x += '        <VERSION>1</VERSION>\n';
      x += '        <TYPE>Other</TYPE>\n';
      x += `        <USE>${esc(useStr)}</USE>\n`;
      x += `        <TIME>${m.time ?? 0}</TIME>\n`;
      x += `        <AMOUNT>${num(kg, 4)}</AMOUNT>\n`;
      x += '      </MISC>\n';
    }
    x += '    </MISCS>\n';
  }

  // ── Yeasts ───────────────────────────────────────────────────────────
  if (yeasts.length) {
    x += '    <YEASTS>\n';
    for (const y of yeasts) {
      const atten = parseFloat(y.extra || '') || 75;
      const litres = (y.amt || 0) / 1000;       // ml → L (matches importer)
      x += '      <YEAST>\n';
      x += `        <NAME>${esc(y.name)}</NAME>\n`;
      x += '        <VERSION>1</VERSION>\n';
      x += '        <TYPE>Ale</TYPE>\n';
      x += '        <FORM>Liquid</FORM>\n';
      x += `        <AMOUNT>${num(litres, 4)}</AMOUNT>\n`;
      x += `        <ATTENUATION>${num(atten, 1)}</ATTENUATION>\n`;
      x += '      </YEAST>\n';
    }
    x += '    </YEASTS>\n';
  }

  // ── Mash schedule ────────────────────────────────────────────────────
  if (mashProfile && mashProfile.steps && mashProfile.steps.length) {
    x += '    <MASH>\n';
    x += `      <NAME>${esc(mashProfile.name || 'Mash')}</NAME>\n`;
    x += '      <VERSION>1</VERSION>\n';
    x += '      <MASH_STEPS>\n';
    for (const s of mashProfile.steps) {
      x += '        <MASH_STEP>\n';
      x += `          <NAME>${esc(s.type)}</NAME>\n`;
      x += '          <VERSION>1</VERSION>\n';
      x += `          <TYPE>${esc(s.type)}</TYPE>\n`;
      x += `          <STEP_TEMP>${num(s.temp, 1)}</STEP_TEMP>\n`;
      x += `          <STEP_TIME>${s.time}</STEP_TIME>\n`;
      x += '        </MASH_STEP>\n';
    }
    x += '      </MASH_STEPS>\n';
    x += '    </MASH>\n';
  }

  x += '  </RECIPE>\n';
  return x;
}

/** Wrap one or more `<RECIPE>` blocks in a complete BeerXML document. */
export function wrapRecipesDocument(recipeBlocks: string[]): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<RECIPES>\n' +
         recipeBlocks.join('') +
         '</RECIPES>\n';
}

/**
 * Filename derived from beerName + name (tax serial). Examples:
 *   beerName='OKT', name='2401'   → 'OKT-2401.xml'
 *   beerName='', name='2401'      → '2401.xml'
 *   beerName='Citra IPA', name='' → 'Citra_IPA.xml'
 *   both empty                    → 'recipe.xml'
 *
 * Only `[A-Za-z0-9_-]` survive sanitisation; everything else collapses
 * to underscore. Multiple underscores are collapsed; leading/trailing
 * trimmed.
 */
export function buildExportFilename(recipe: Pick<Recipe, 'beerName' | 'name'>): string {
  const parts = [recipe.beerName, recipe.name]
    .map(s => (s || '').trim())
    .filter(Boolean);
  const joined = parts.join('-');
  const safe = joined
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
  return (safe || 'recipe') + '.xml';
}

/**
 * Trigger a browser download of `xml` as `filename`. Uses Blob + an
 * anchor click — same pattern the React app already uses elsewhere.
 * Caller is responsible for revoking the object URL (handled here).
 */
export function downloadXmlFile(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
