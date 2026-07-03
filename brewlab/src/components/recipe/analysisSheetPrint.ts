/**
 * Print Analysis Sheet — clean black-on-white A4-portrait brew summary.
 * Replaces AnalysisTab's old outerHTML-clone print path (which printed the
 * dark-themed on-screen layout with inline styles) with a purpose-built
 * print document, same pattern as brewDaySheetPrint.ts.
 *
 * Pure builder. Routes through src/lib/print.ts::printHtml. All values fall
 * back to EM_DASH gracefully — no crashes on missing tax record, cold-side
 * blob, or library entries.
 */
import type {
  Recipe,
  Ingredient,
  TaxRecord,
  ColdSideData,
  BrewDayData,
  FermLogEntry,
  FermMeta,
  BrewSettings,
  MaltLib,
  HopLib,
  YeastLib,
  MiscLib,
} from '../../types';
import { printHtml, escapeHtml } from '../../lib/print';
import { fmtNum } from '../../lib/format';
import { platoToSg } from '../../lib/calculations';

export interface AnalysisSheetInputs {
  recipe: Recipe;
  ingredients: Ingredient[];
  taxRecord: TaxRecord;
  coldSide: ColdSideData;
  brewDay: BrewDayData;
  fermLog: FermLogEntry[];
  fermMeta: FermMeta;
  settings: BrewSettings;
  maltLib: MaltLib[];
  hopLib: HopLib[];
  yeastLib: YeastLib[];
  miscLib: MiscLib[];
  brewerName: string;        // settings.breweryName or ''
  measBhEff: string;         // pre-computed, e.g. '71.3%' or '—'
  attenReal: string;         // pre-computed, e.g. '77' or '—'
  attenPlan: string;         // pre-computed, e.g. '80' or '—'
}

// ─── Format helpers ─────────────────────────────────────────────────

const EM_DASH = '—';
const isNum = (n: unknown): n is number => typeof n === 'number' && isFinite(n);
const num = (v: unknown): number => {
  if (isNum(v)) return v;
  const n = parseFloat(String(v ?? ''));
  return isFinite(n) ? n : NaN;
};
const orDash = (v: unknown): string => {
  if (v == null) return EM_DASH;
  const s = String(v).trim();
  return s === '' ? EM_DASH : s;
};
const fmtY = (v: number): string =>
  v > 0 ? '¥' + Math.round(v).toLocaleString('ja-JP') : EM_DASH;

const chip = (text: string): string =>
  `<span class="bds-target">${escapeHtml(text)}</span>`;

// Same library-key map AnalysisTab.tsx uses (renderAnalysisPage line 11161).
const LIB_KEY: Record<string, 'malts' | 'hops' | 'yeast' | 'misc'> = {
  grain: 'malts', hop: 'hops', yeast: 'yeast', misc: 'misc',
};

// ─── Cost calculation — replicated from AnalysisTab.tsx lines ~144–185 ──

interface CostBreakdown {
  ingCost: number;
  maltShipping: number;
  hopShipping: number;
  taxAmt: number;
  totalAdded: number;
  grandTotal: number;
  perLiter: number;
  taxRate: number;
}

function computeCosts(inputs: AnalysisSheetInputs): CostBreakdown {
  const { ingredients, settings, maltLib, hopLib, yeastLib, miscLib, taxRecord } = inputs;
  const shipMaltRate = settings.shipMalt ?? 0;
  const shipHopsRate = settings.shipHops ?? 0;
  const taxRate = settings.orderTax ?? 0;
  const libByType = { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib };

  let ingCost = 0;
  for (const i of ingredients) {
    let c = num(i.cost) || 0;
    if (c === 0) {
      const dataKey = LIB_KEY[i.type];
      if (dataKey) {
        const lib = libByType[dataKey] as Array<{ name: string; price?: number | string }>;
        const libE = lib.find(e => (e.name || '').toLowerCase() === (i.name || '').toLowerCase());
        const libPrice = num(libE?.price) || 0;
        if (libPrice > 0) {
          const amtKg = num(i.amt) * (i.unit === 'g' ? 0.001 : 1);
          c = i.type === 'yeast' ? libPrice : libPrice * amtKg;
        }
      }
    }
    ingCost += c;
  }

  const totalGrainKg = ingredients.filter(i => i.type === 'grain').reduce((s, i) => {
    const kg = num(i.amt) * (i.unit === 'g' ? 0.001 : 1);
    return s + kg;
  }, 0);
  const totalHopKg = ingredients.filter(i => i.type === 'hop').reduce((s, i) => {
    const kg = num(i.amt) * (i.unit === 'g' ? 0.001 : i.unit === 'kg' ? 1 : 0);
    return s + kg;
  }, 0);

  const maltShipping = totalGrainKg * shipMaltRate;
  const hopShipping = totalHopKg * shipHopsRate;
  const taxAmt = taxRate > 0 ? (ingCost + maltShipping + hopShipping) * (taxRate / 100) : 0;
  const totalAdded = maltShipping + hopShipping + taxAmt;
  const grandTotal = ingCost + totalAdded;
  const sellableLiters = num(taxRecord['snap-sell-total']) || num(taxRecord['total-packaged']) || 0;
  const perLiter = sellableLiters > 0 ? grandTotal / sellableLiters : 0;

  return { ingCost, maltShipping, hopShipping, taxAmt, totalAdded, grandTotal, perLiter, taxRate };
}

// ─── Section builders ───────────────────────────────────────────────

function buildHeader(inputs: AnalysisSheetInputs, costs: CostBreakdown): string {
  const { recipe, taxRecord, coldSide, brewerName } = inputs;
  const beerName = recipe.beerName || recipe.name || 'Recipe';
  const recName = recipe.name || taxRecord['recipe-name'] || EM_DASH;
  const style = recipe.style || EM_DASH;
  const brewNum = orDash(taxRecord['brew-num']);
  const brewDate = orDash(taxRecord['date']);
  const pkgDate = orDash(taxRecord['snap-pkg-date'] || coldSide['cs-keg-date'] || coldSide['cs-can-date']);
  const classification = orDash(taxRecord['classification']);
  const abvMeas = taxRecord['abv'] != null && String(taxRecord['abv']).trim() !== ''
    ? `${taxRecord['abv']}%` : EM_DASH;
  const batchL = isNum(recipe.batchL) && recipe.batchL > 0 ? `${recipe.batchL}L` : EM_DASH;
  const sellableL = orDash(taxRecord['total-packaged']);
  const ibu = isNum(recipe.ibu) && recipe.ibu > 0 ? fmtNum(recipe.ibu, { dp: 0 }) : EM_DASH;

  const ogSg = isNum(recipe.ogPlato) && recipe.ogPlato > 0 ? platoToSg(recipe.ogPlato) : 0;
  const ibuSgVal = ogSg > 1 && isNum(recipe.ibu) && recipe.ibu > 0
    ? recipe.ibu / ((ogSg - 1) * 1000)
    : 0;
  const ibuSg = ibuSgVal > 0 ? fmtNum(ibuSgVal) : EM_DASH;

  return `
    <div class="as-header">
      <div>
        <div class="as-beer-name">${escapeHtml(beerName)}</div>
        <div class="as-beer-sub">Recipe: ${escapeHtml(recName)}</div>
      </div>
      <div class="as-meta-grid">
        <div class="as-meta-cell"><label>Style</label>${escapeHtml(style)}</div>
        <div class="as-meta-cell"><label>Recipe #</label>${escapeHtml(recName)}</div>
        <div class="as-meta-cell"><label>Tax Batch #</label>${escapeHtml(brewNum)}</div>
      </div>
    </div>
    <div class="as-stats-row">
      <div class="as-stats-group">
        <span class="as-stat"><label>Brew Date</label> ${escapeHtml(brewDate)}</span>
        <span class="as-stat"><label>Package Date</label> ${escapeHtml(pkgDate)}</span>
        <span class="as-stat"><label>Brewer</label> ${escapeHtml(brewerName || EM_DASH)}</span>
        <span class="as-stat"><label>Classification</label> ${escapeHtml(classification)}</span>
      </div>
      <div class="as-stats-group">
        <span class="as-stat"><label>ABV Measured</label> ${chip(abvMeas)}</span>
        <span class="as-stat"><label>Batch Size</label> ${chip(batchL)}</span>
        <span class="as-stat"><label>Sellable Liters</label> ${chip(sellableL)}</span>
        <span class="as-stat"><label>IBU</label> ${chip(ibu)}</span>
        <span class="as-stat"><label>IBU/SG</label> ${chip(ibuSg)}</span>
        <span class="as-stat"><label>Price</label> ${chip(fmtY(costs.grandTotal))}</span>
        <span class="as-stat"><label>Per Litre</label> ${chip(fmtY(costs.perLiter))}</span>
      </div>
    </div>
  `;
}

function buildFermAndPackaging(inputs: AnalysisSheetInputs): string {
  const { recipe, ingredients, taxRecord, coldSide } = inputs;

  const yeastIng = ingredients.find(i => i.type === 'yeast');
  const yeastName = yeastIng?.name || EM_DASH;
  const yeastGen = orDash(coldSide['cs-yeast-gen']);

  const measOG = orDash(taxRecord['start-brix']);
  const estOG = isNum(recipe.ogPlato) && recipe.ogPlato > 0 ? fmtNum(recipe.ogPlato, { dp: 1 }) : EM_DASH;
  const measFG = orDash(taxRecord['finish-brix']);
  const estFG = isNum(recipe.fgPlato) && recipe.fgPlato >= 0 ? fmtNum(recipe.fgPlato, { dp: 1 }) : EM_DASH;
  const measABV = taxRecord['abv'] != null && String(taxRecord['abv']).trim() !== ''
    ? `${taxRecord['abv']}%` : EM_DASH;
  const estABV = isNum(recipe.abv) && recipe.abv > 0 ? fmtNum(recipe.abv, { dp: 1, suffix: '%' }) : EM_DASH;
  const estBhEff = isNum(recipe.bhEff) && recipe.bhEff > 0 ? fmtNum(recipe.bhEff, { dp: 1, suffix: '%' }) : EM_DASH;

  const fermRows = [
    ['Plato', measOG, estOG],
    ['Final Plato', measFG, estFG],
    ['ABV', measABV, estABV],
    ['Efficiency', inputs.measBhEff, estBhEff],
    ['Attenuation', inputs.attenReal, inputs.attenPlan],
  ];
  const fermRowsHtml = fermRows.map(([label, real, plan]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td class="r">${escapeHtml(real)}</td>
      <td class="r">${escapeHtml(plan)}</td>
    </tr>
  `).join('');

  const kegRows = coldSide['cs-keg-rows'] || [];
  const kegRowsHtml = kegRows.length > 0
    ? kegRows.map(r => {
        const sizeN = num(r.size) || 0;
        const qtyN = num(r.qty) || 0;
        const litres = sizeN * qtyN;
        return `
          <tr>
            <td>${escapeHtml(r.size)}L Kegs</td>
            <td class="r">${escapeHtml(r.qty || EM_DASH)}</td>
            <td class="r">${litres > 0 ? fmtNum(litres, { dp: 1 }) : EM_DASH}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="3" class="muted">No kegs recorded.</td></tr>`;

  const canSize = coldSide['cs-can-size'] || '350';
  const cansN = num(coldSide['cs-cans']);
  const sizeN = num(canSize);
  const canL = isFinite(cansN) && isFinite(sizeN) ? fmtNum(cansN * sizeN / 1000, { dp: 1 }) : EM_DASH;
  const cans = orDash(coldSide['cs-cans']);

  const pkgWaste = orDash(taxRecord['snap-total-waste-pkg']);
  const pitchPh = orDash(inputs.brewDay.pitchPh);
  const finalPh = orDash(coldSide['cs-ph']);

  return `
    <section class="as-section">
      <div class="as-two-col">
        <div style="flex:1">
          <div class="as-section-title">YEAST &amp; FERMENTATION</div>
          <div class="as-row"><label>Yeast</label> ${escapeHtml(yeastName)} &nbsp; <label>Generation</label> ${escapeHtml(yeastGen)}</div>
          <table class="as-table">
            <thead><tr><th></th><th class="r">Real</th><th class="r">Plan</th></tr></thead>
            <tbody>${fermRowsHtml}</tbody>
          </table>
          <div class="as-row"><label>Pitch pH</label> ${escapeHtml(pitchPh)} &nbsp; <label>Final pH</label> ${escapeHtml(finalPh)}</div>
        </div>
        <div style="flex:1">
          <div class="as-section-title">PACKAGING</div>
          <table class="as-table">
            <thead><tr><th>Type</th><th class="r">Amount</th><th class="r">Liters</th></tr></thead>
            <tbody>
              ${kegRowsHtml}
              <tr>
                <td>Cans (${escapeHtml(String(canSize))}ml)</td>
                <td class="r">${escapeHtml(cans)}</td>
                <td class="r">${escapeHtml(canL)}</td>
              </tr>
              <tr>
                <td class="muted">Packaging waste</td>
                <td colspan="2" class="r muted">${escapeHtml(pkgWaste)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function buildCostBreakdown(costs: CostBreakdown): string {
  return `
    <section class="as-section">
      <div class="as-section-title">COST BREAKDOWN</div>
      <div style="display:flex; gap:0;">
        <table class="as-table" style="flex:1">
          <tbody>
            <tr><td>Ingredients</td><td class="r">${fmtY(costs.ingCost)}</td></tr>
            <tr><td>Malt Shipping</td><td class="r">${fmtY(costs.maltShipping)}</td></tr>
            <tr><td>Hop Shipping</td><td class="r">${fmtY(costs.hopShipping)}</td></tr>
            <tr><td>Tax (${costs.taxRate || 10}%)</td><td class="r">${fmtY(costs.taxAmt)}</td></tr>
          </tbody>
        </table>
        <table class="as-table" style="flex:1">
          <tbody>
            <tr><td>Total Added</td><td class="r">${fmtY(costs.totalAdded)}</td></tr>
            <tr><td class="as-cost-total">Total</td><td class="r as-cost-total">${fmtY(costs.grandTotal)}</td></tr>
            <tr><td class="as-cost-total">Per Litre</td><td class="r as-cost-total">${fmtY(costs.perLiter)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function buildProcessNotes(inputs: AnalysisSheetInputs): string {
  const { brewDay, fermLog, fermMeta, coldSide } = inputs;

  const notes: Array<{ source: string; text: string }> = [];
  if (brewDay.mashReadings?.notes) notes.push({ source: 'Mash Readings', text: brewDay.mashReadings.notes });
  if (brewDay.notes) notes.push({ source: 'Brew Day', text: brewDay.notes });
  for (const entry of fermLog) {
    if (entry.notes) notes.push({ source: `Fermentation (${entry.date || 'no date'})`, text: entry.notes });
  }
  for (const n of [1, 2, 3] as const) {
    const note = fermMeta[`dh${n}-notes` as keyof FermMeta] as string | undefined;
    if (note) notes.push({ source: `Dry Hop ${n}`, text: note });
  }
  if (coldSide['cs-process-notes']) notes.push({ source: 'Packaging — Process Notes', text: coldSide['cs-process-notes'] });

  const rowsHtml = notes.length > 0
    ? notes.map(n => `
        <div class="as-notes-row">
          <div class="as-notes-source">${escapeHtml(n.source)}</div>
          <div class="as-notes-text">${escapeHtml(n.text)}</div>
        </div>
      `).join('')
    : `<div class="as-notes-text muted">No process notes recorded.</div>`;

  return `
    <section class="as-section">
      <div class="as-section-title">PROCESS NOTES</div>
      ${rowsHtml}
    </section>
  `;
}

function buildFreeNotes(title: string, text: string): string {
  return `
    <section class="as-section">
      <div class="as-section-title">${escapeHtml(title.toUpperCase())}</div>
      <div class="as-notes-text" style="white-space:pre-wrap;">${escapeHtml(text)}</div>
    </section>
  `;
}

// ─── Print stylesheet ───────────────────────────────────────────────

const EXTRA_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #111; }

  .as-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 1px solid #333; }
  .as-beer-name { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
  .as-beer-sub { font-size: 11px; color: #666; }
  .as-meta-grid { display: flex; gap: 18px; }
  .as-meta-cell { font-size: 11px; text-align: right; }
  .as-meta-cell label { display: block; color: #888; font-size: 9px; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 2px; }

  .as-stats-row { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0 6px; border-bottom: 1px solid #ddd; font-size: 11px; flex-wrap: wrap; }
  .as-stats-group { display: flex; flex-wrap: wrap; gap: 12px; }
  .as-stat label { color: #888; font-size: 10px; letter-spacing: 0.4px; margin-right: 4px; text-transform: uppercase; }

  .as-section { border-bottom: 1px solid #eee; padding: 8px 0; page-break-inside: avoid; }
  .as-section:last-of-type { border-bottom: none; }
  .as-section-title { font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #444; margin-bottom: 4px; }

  .as-two-col { display: flex; gap: 16px; }

  .as-row { font-size: 11px; padding: 3px 0; }
  .as-row label { color: #888; font-size: 10px; letter-spacing: 0.4px; margin-right: 4px; }

  .as-table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 4px 0; }
  .as-table th { border: none; border-bottom: 1px solid #999; padding: 4px 6px; text-align: left; font-weight: 500; font-size: 10px; color: #444; }
  .as-table td { border: none; border-bottom: 1px solid #eee; padding: 3px 6px; }
  .as-table th.r, .as-table td.r { text-align: right; font-variant-numeric: tabular-nums; }
  .as-table td.muted, .muted { color: #888; font-style: italic; }

  .as-cost-total { font-size: 14px; font-weight: 700; }

  .as-notes-row { display: grid; grid-template-columns: 120px 1fr; border-bottom: 1px solid #eee; }
  .as-notes-source { font-size: 9px; color: #888; padding: 5px 8px; font-variant: small-caps; }
  .as-notes-text { font-size: 11px; padding: 5px 8px; white-space: pre-wrap; }

  @media print { .as-section { page-break-inside: avoid; } }
`;

// ─── Public entry point ─────────────────────────────────────────────

export function printAnalysisSheet(inputs: AnalysisSheetInputs): void {
  const costs = computeCosts(inputs);
  const sections = [
    buildHeader(inputs, costs),
    buildCostBreakdown(costs),
    buildFermAndPackaging(inputs),
    buildProcessNotes(inputs),
  ];
  if (inputs.coldSide['cs-tasting-notes']) sections.push(buildFreeNotes('Tasting Notes', inputs.coldSide['cs-tasting-notes']!));
  if (inputs.coldSide['cs-changes-notes']) sections.push(buildFreeNotes('Changes for Next Time', inputs.coldSide['cs-changes-notes']!));
  if (inputs.coldSide['cs-analysis-notes']) sections.push(buildFreeNotes('Analysis Notes', inputs.coldSide['cs-analysis-notes']!));

  const beerName = inputs.recipe.beerName || inputs.recipe.name || 'Recipe';
  printHtml(sections.join('\n'), {
    title: `${beerName} — Brew Analysis`,
    pageSize: 'A4',
    landscape: false,
    extraStyles: EXTRA_STYLES,
  });
}
