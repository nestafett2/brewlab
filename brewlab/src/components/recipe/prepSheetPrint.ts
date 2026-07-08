/**
 * Print Prep Sheet — A4-portrait single-page artifact for a brewer's
 * workstation. Sections in mill-first order: header → fermentables →
 * water → hops → yeast → (optional) extra additions.
 *
 * Pure builder — takes a snapshot of recipe + ingredients + calc inputs
 * and routes through src/lib/print.ts::printHtml. No store reads, no
 * DOM reads.
 *
 * Graceful "—" fallbacks throughout. Sections never crash on missing
 * library entries, missing water-chem blob, or no mash profile. The
 * Extra Additions section is fully suppressed (no header) when blank,
 * per spec.
 */
import type {
  Recipe,
  Ingredient,
  MaltLib,
  HopLib,
  YeastLib,
  WaterChemData,
  WaterIon,
  WaterMineral,
  BrewDayData,
  HarvestedYeast,
} from '../../types';
import { printHtml, escapeHtml } from '../../lib/print';
import type { BrewDayTargets } from '../../lib/calculations';

/**
 * Subset of the RecipeTab stats memo the prep sheet needs. We accept
 * just this shape (not the full memo) so the call site can swap
 * implementations without forcing a wider re-import.
 */
export interface PrepSheetStats {
  ogPlato: number;
  fgPlato: number;
  abv: number;
  ibu: number;
  ebc: number;
  grainPcts: Map<string, number>;
  perHop: Map<string, number>;
  totalGrainKg: number;
  totalHopG: number;
}

export interface PrepSheetInputs {
  recipe: Recipe;
  ingredients: Ingredient[];
  stats: PrepSheetStats;
  waterChem: WaterChemData;
  brewDay: BrewDayData;
  targets: BrewDayTargets;
  /** First-step mash temp from the assigned MashProfile, if any. The
   *  Water section's mash cell shows this when present; falls back to
   *  the strike-target temp otherwise. */
  mashStepTempC?: number;
  /** First-step mash duration (min) from the assigned MashProfile, if
   *  any. Surfaced inline with mash temp; suppressed when unknown. */
  mashStepDurationMin?: number;
  tankName: string;       // resolved from recipe.bdFv via tankCalib (or '—')
  brewerName: string;     // settings.breweryName (or '—')
  maltLib: MaltLib[];
  hopLib: HopLib[];
  yeastLib: YeastLib[];
  harvestedYeast: HarvestedYeast;
}

// ─── Format helpers ─────────────────────────────────────────────────

const EM_DASH = '—';
const isNum = (n: unknown): n is number => typeof n === 'number' && isFinite(n);
const num = (v: unknown): number => {
  if (isNum(v)) return v;
  const n = parseFloat(String(v ?? ''));
  return isFinite(n) ? n : NaN;
};
const fmt = (v: unknown, dp = 1, suffix = ''): string => {
  const n = num(v);
  return isFinite(n) ? n.toFixed(dp) + suffix : EM_DASH;
};
const fmtThousands = (n: number): string =>
  isFinite(n) ? n.toLocaleString('en-US') : EM_DASH;

const ebcToSrm = (ebc: number): number => ebc / 1.97;
const srmToLovibond = (srm: number): number => (srm + 0.76) / 1.3546;

// Friendly mineral names for salt-addition lines.
const MINERAL_LABEL: Record<WaterMineral, string> = {
  gypsum: 'Gypsum',
  cacl2:  'CaCl₂',
  epsom:  'Epsom',
  mgcl2:  'MgCl₂',
  nacl:   'NaCl',
  nahco3: 'Baking soda',
};

const ION_LABEL: Record<WaterIon, string> = {
  ca:   'Ca',
  mg:   'Mg',
  na:   'Na',
  so4:  'SO₄',
  cl:   'Cl',
  hco3: 'HCO₃',
};

// ─── Section builders ───────────────────────────────────────────────

function buildHeader(inputs: PrepSheetInputs): string {
  const { recipe, stats, brewerName, tankName } = inputs;
  const beerName = recipe.beerName || recipe.name || 'Recipe';
  const batchL = isNum(recipe.batchL) && recipe.batchL > 0
    ? fmtThousands(Math.round(recipe.batchL)) + ' L'
    : EM_DASH;
  const style = recipe.style || EM_DASH;
  const brewNum = recipe.taxBatch || EM_DASH;
  const date = recipe.brewDate || EM_DASH;

  const srm = stats.ebc > 0 ? Math.round(ebcToSrm(stats.ebc)).toString() : EM_DASH;
  const og = stats.ogPlato > 0 ? fmt(stats.ogPlato, 1, '°P') : EM_DASH;
  const fg = stats.fgPlato > 0 ? fmt(stats.fgPlato, 1, '°P') : EM_DASH;
  const abv = stats.abv > 0 ? fmt(stats.abv, 1, '%') : EM_DASH;
  const ibu = stats.ibu > 0 ? Math.round(stats.ibu).toString() : EM_DASH;

  return `
    <div class="ps-header">
      <div class="ps-header-left">
        <div class="ps-beer-name">${escapeHtml(beerName)}</div>
        <div class="ps-beer-sub">${escapeHtml(beerName)} · ${escapeHtml(batchL)} · ${escapeHtml(style)}</div>
      </div>
      <div class="ps-header-right">
        <div class="ps-brew-label">BREW #</div>
        <div class="ps-brew-num">${escapeHtml(brewNum)}</div>
      </div>
    </div>
    <div class="ps-stats-row">
      <div class="ps-stats-left">
        <span class="ps-stat"><label>Date</label> ${escapeHtml(date)}</span>
        <span class="ps-stat"><label>Brewer</label> ${escapeHtml(brewerName || EM_DASH)}</span>
        <span class="ps-stat"><label>Tank</label> ${escapeHtml(tankName || EM_DASH)}</span>
      </div>
      <div class="ps-stats-right">
        <span class="ps-stat"><label>OG</label> ${escapeHtml(og)}</span>
        <span class="ps-stat"><label>FG</label> ${escapeHtml(fg)}</span>
        <span class="ps-stat"><label>ABV</label> ${escapeHtml(abv)}</span>
        <span class="ps-stat"><label>IBU</label> ${escapeHtml(ibu)}</span>
        <span class="ps-stat"><label>SRM</label> ${escapeHtml(srm)}</span>
      </div>
    </div>
  `;
}

function buildFermentables(inputs: PrepSheetInputs): string {
  const { ingredients, stats, maltLib, targets } = inputs;
  const grains = ingredients.filter(i => i.type === 'grain');

  const totalKg = stats.totalGrainKg;
  const ratio = isNum(targets.mashRatioLkg) && targets.mashRatioLkg > 0
    ? '1:' + targets.mashRatioLkg.toFixed(1)
    : EM_DASH;
  const totalStr = totalKg > 0 ? fmt(totalKg, 2, ' kg') : EM_DASH;

  const rows = grains.map(g => {
    const kg = g.unit === 'g' ? g.amt * 0.001 : g.amt;
    const lib = maltLib.find(e => e.id === g.libId || e.name === g.name);
    const ebc = lib && lib.ebc != null ? num(lib.ebc) : NaN;
    const srm = isFinite(ebc) ? ebcToSrm(ebc) : NaN;
    const lovi = isFinite(srm) ? srmToLovibond(srm) : NaN;
    const pct = (stats.grainPcts.get(g.id) ?? 0) * 100;
    return `
      <tr>
        <td class="r">${escapeHtml(fmt(kg, 2))}</td>
        <td>${escapeHtml(g.name || EM_DASH)}</td>
        <td class="r">${escapeHtml(isFinite(srm) ? Math.round(srm).toString() : EM_DASH)}</td>
        <td class="r">${escapeHtml(pct > 0 ? fmt(pct, 1, '%') : EM_DASH)}</td>
        <td class="r">${escapeHtml(isFinite(lovi) ? fmt(lovi, 1, '°L') : EM_DASH)}</td>
      </tr>`;
  }).join('');

  return `
    <section class="ps-section">
      <div class="ps-section-head">
        <span class="ps-section-title">FERMENTABLES — MILL FIRST</span>
        <span class="ps-section-meta">Total ${escapeHtml(totalStr)} · Grist:liquor ${escapeHtml(ratio)}</span>
      </div>
      <table class="ps-table">
        <thead>
          <tr>
            <th class="r">kg</th>
            <th>Ingredient</th>
            <th class="r">SRM</th>
            <th class="r">%</th>
            <th class="r">Lovibond</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted">No fermentables.</td></tr>'}</tbody>
      </table>
    </section>
  `;
}

function buildWater(inputs: PrepSheetInputs): string {
  const { waterChem, targets, mashStepTempC, mashStepDurationMin } = inputs;

  const strikeVol = isNum(targets.mashWaterL) && targets.mashWaterL > 0
    ? fmt(targets.mashWaterL, 1, ' L')
    : EM_DASH;
  const strikeTemp = isNum(targets.strikeTempC) && targets.strikeTempC > 0
    ? fmt(targets.strikeTempC, 1, ' °C')
    : EM_DASH;
  // Mash cell: temp from the assigned MashProfile's first step when set,
  // strike target otherwise. Duration is suppressed when unknown rather
  // than printed as "—" — the brewer can just see no duration was set.
  const mashTempStr = isNum(mashStepTempC) && mashStepTempC > 0
    ? fmt(mashStepTempC, 1, ' °C')
    : strikeTemp;
  const mashDurMin = isNum(mashStepDurationMin) && mashStepDurationMin > 0
    ? mashStepDurationMin
    : 0;
  const spargeVol = isNum(targets.spargeVolL) && targets.spargeVolL > 0
    ? fmt(targets.spargeVolL, 1, ' L')
    : EM_DASH;

  const ions = (['ca', 'mg', 'na', 'so4', 'cl', 'hco3'] as WaterIon[]).map(k => {
    const v = waterChem.targets?.[k];
    const n = num(v);
    return `${ION_LABEL[k]} ${isFinite(n) ? Math.round(n) : EM_DASH}`;
  }).join(' · ');

  const mineralLines: string[] = [];
  const mins = waterChem.minerals ?? {};
  for (const key of Object.keys(mins) as WaterMineral[]) {
    const m = mins[key];
    if (!m) continue;
    const mash = num(m.mash);
    const sparge = num(m.sparge);
    const parts: string[] = [];
    if (isFinite(mash) && mash > 0)   parts.push(`${fmt(mash, 1)} g mash`);
    if (isFinite(sparge) && sparge > 0) parts.push(`${fmt(sparge, 1)} g sparge`);
    if (parts.length > 0) mineralLines.push(`${MINERAL_LABEL[key]}: ${parts.join(' / ')}`);
  }
  const saltLine = mineralLines.length > 0
    ? mineralLines.join(' · ')
    : '<em class="muted">No salt additions.</em>';

  // Mash temp falls back to the strike target's destination temp. We
  // surface the first-step temp (mashTempTarget) but BrewDayTargets only
  // exposes strikeTempC — derive from the mash profile would require
  // re-plumbing. Show "—" if not available rather than fake it.
  return `
    <section class="ps-section">
      <div class="ps-section-head">
        <span class="ps-section-title">WATER</span>
      </div>
      <div class="ps-water-grid">
        <div class="ps-water-cell">
          <div class="ps-water-label">Strike</div>
          <div class="ps-water-value">${escapeHtml(strikeVol)} @ ${escapeHtml(strikeTemp)}</div>
        </div>
        <div class="ps-water-cell">
          <div class="ps-water-label">Mash</div>
          <div class="ps-water-value">${escapeHtml(mashTempStr)}${mashDurMin > 0 ? ' · ' + mashDurMin + ' min' : ''}</div>
        </div>
        <div class="ps-water-cell">
          <div class="ps-water-label">Sparge</div>
          <div class="ps-water-value">${escapeHtml(spargeVol)}</div>
        </div>
      </div>
      <div class="ps-water-minerals">
        <span class="ps-water-minerals-label">Mineral profile (ppm)</span>
        <span class="ps-water-minerals-value">${escapeHtml(ions)}</span>
      </div>
      <div class="ps-water-salts">${saltLine}</div>
    </section>
  `;
}

function buildHops(inputs: PrepSheetInputs): string {
  const { ingredients, stats, hopLib, brewDay, waterChem } = inputs;
  const hops = ingredients.filter(i => i.type === 'hop');

  const totalKg = stats.totalHopG / 1000;
  const dryHopKg = hops
    .filter(h => (h.use || '').toLowerCase() === 'dry hop')
    .reduce((s, h) => s + (h.unit === 'g' ? h.amt * 0.001 : h.amt), 0);

  const pitchPh = brewDay.pitchPh || waterChem.targetPh || '';
  const totalStr   = totalKg  > 0 ? fmt(totalKg, 3, ' kg')   : EM_DASH;
  const dhStr      = dryHopKg > 0 ? fmt(dryHopKg, 3, ' kg')  : EM_DASH;
  const pitchPhStr = pitchPh ? String(pitchPh) : EM_DASH;

  const rows = hops.map(h => {
    const kg = h.unit === 'kg' ? h.amt : h.amt * 0.001;
    const lib = hopLib.find(e => e.id === h.libId || e.name === h.name);
    const aaRaw = h.extra || (lib ? String(lib.aa ?? '') : '');
    const aa = num(aaRaw);
    const ibu = stats.perHop.get(h.id) ?? 0;
    return `
      <tr>
        <td class="r">${escapeHtml(fmt(kg, 3))}</td>
        <td>${escapeHtml(h.name || EM_DASH)}</td>
        <td>${escapeHtml(h.use || EM_DASH)}</td>
        <td class="r">${escapeHtml(h.time != null ? String(h.time) + ' min' : EM_DASH)}</td>
        <td class="r">${escapeHtml(isFinite(aa) ? fmt(aa, 1, '%') : EM_DASH)}</td>
        <td class="r">${escapeHtml(ibu > 0 ? Math.round(ibu).toString() : EM_DASH)}</td>
      </tr>`;
  }).join('');

  return `
    <section class="ps-section">
      <div class="ps-section-head">
        <span class="ps-section-title">HOPS &amp; BOIL</span>
        <span class="ps-section-meta">Total ${escapeHtml(totalStr)} · Dry hop ${escapeHtml(dhStr)} · Pitch pH ${escapeHtml(pitchPhStr)}</span>
      </div>
      <table class="ps-table">
        <thead>
          <tr>
            <th class="r">kg</th>
            <th>Hop</th>
            <th>Use</th>
            <th class="r">Time</th>
            <th class="r">AA %</th>
            <th class="r">IBU</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="muted">No hops.</td></tr>'}</tbody>
      </table>
    </section>
  `;
}

function buildYeast(inputs: PrepSheetInputs): string {
  const { ingredients, brewDay, targets, harvestedYeast } = inputs;
  const yeastIng = ingredients.find(i => i.type === 'yeast');

  if (!yeastIng) {
    return `
      <section class="ps-section">
        <div class="ps-section-head"><span class="ps-section-title">YEAST</span></div>
        <div class="ps-yeast-row"><em class="muted">No yeast assigned.</em></div>
      </section>
    `;
  }

  const strain = yeastIng.name || EM_DASH;
  const unit = (yeastIng.unit || 'g').toLowerCase();
  const pitchAmt = yeastIng.amt > 0
    ? `${fmt(yeastIng.amt, unit === 'g' || unit === 'ml' ? 0 : 1)} ${yeastIng.unit || ''}`.trim()
    : EM_DASH;

  // Pitch temp resolution: brewDay.pitchTemp is the brewer's planned
  // target (per Ben 2026-05-12 — NOT an actual measurement, despite
  // living on the BrewDayData blob). Falls back to targets.targetPitchTempC
  // (calcBrewDayTargets-derived yeast-lib min) when unset, then EM_DASH.
  const bdPitchTarget = num(brewDay.pitchTemp);
  const pitchTemp = isFinite(bdPitchTarget) && bdPitchTarget > 0
    ? fmt(bdPitchTarget, 1, ' °C')
    : isNum(targets.targetPitchTempC) && targets.targetPitchTempC > 0
    ? fmt(targets.targetPitchTempC, 1, ' °C')
    : EM_DASH;

  // Harvested-supply honesty line. Only attempts the math when the pitch
  // unit is litres (slurry semantics). Other units would need a viable-
  // cells conversion, which is out of scope for the prep sheet.
  let harvestLine = '';
  if (unit === 'l' && yeastIng.amt > 0) {
    const strainKey = Object.keys(harvestedYeast).find(
      k => k.toLowerCase() === strain.toLowerCase(),
    );
    const strainEntry = strainKey ? harvestedYeast[strainKey] : null;
    if (strainEntry?.entries?.length) {
      const got = strainEntry.entries.reduce((s, e) => s + (e.got ?? 0), 0);
      const used = strainEntry.entries.reduce((s, e) => s + (e.used ?? 0), 0);
      const available = Math.max(0, got - used);
      if (available > 0) {
        if (available < yeastIng.amt) {
          const shortPct = Math.round(((yeastIng.amt - available) / yeastIng.amt) * 100);
          harvestLine = `<span class="ps-yeast-short">${fmt(available, 1)} L harvested (short ${shortPct}% — supplement w/ fresh)</span>`;
        } else {
          harvestLine = `<span class="ps-yeast-ok">${fmt(available, 1)} L harvested · sufficient</span>`;
        }
      }
    }
  }

  return `
    <section class="ps-section">
      <div class="ps-section-head"><span class="ps-section-title">YEAST</span></div>
      <div class="ps-yeast-row">
        <span class="ps-stat"><label>Strain</label> ${escapeHtml(strain)}</span>
        <span class="ps-stat"><label>Pitch</label> ${escapeHtml(pitchAmt)}</span>
        <span class="ps-stat"><label>Pitch temp</label> ${escapeHtml(pitchTemp)}</span>
        ${harvestLine}
      </div>
    </section>
  `;
}

function buildExtraAdditions(inputs: PrepSheetInputs): string {
  const txt = (inputs.recipe.extraAdditions || '').trim();
  if (!txt) return '';
  return `
    <section class="ps-section">
      <div class="ps-section-head"><span class="ps-section-title">EXTRA ADDITIONS</span></div>
      <div class="ps-extra-body">${escapeHtml(txt)}</div>
    </section>
  `;
}

// ─── Print stylesheet ───────────────────────────────────────────────

const EXTRA_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #000; }
  .ps-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 1px solid #333; }
  .ps-beer-name { font-size: 18px; font-weight: 600; margin-bottom: 2px; }
  .ps-beer-sub { font-size: 12px; color: #000; }
  .ps-header-right { text-align: right; }
  .ps-brew-label { font-size: 11px; color: #000; letter-spacing: 1px; }
  .ps-brew-num   { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .ps-stats-row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0 14px; border-bottom: 1px solid #888; font-size: 12px; }
  .ps-stats-left, .ps-stats-right { display: flex; flex-wrap: wrap; gap: 14px; }
  .ps-stat label { color: #000; font-size: 11px; letter-spacing: 0.5px; margin-right: 4px; text-transform: uppercase; }
  .ps-section { padding: 12px 0 4px; border-bottom: 1px solid #eee; page-break-inside: avoid; }
  .ps-section:last-of-type { border-bottom: none; }
  .ps-section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .ps-section-title { font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #000; }
  .ps-section-meta  { font-size: 11px; color: #000; }
  .ps-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .ps-table th { border: none; border-bottom: 1px solid #555; padding: 4px 6px; text-align: left; font-weight: 600; font-size: 11px; color: #000; }
  .ps-table td { border: none; padding: 3px 6px; }
  .ps-table th.r, .ps-table td.r { text-align: right; font-variant-numeric: tabular-nums; }
  .ps-table td.muted, .muted { color: #000; font-style: italic; }
  .ps-water-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 8px; }
  .ps-water-cell { border-left: 2px solid #888; padding-left: 8px; }
  .ps-water-label { font-size: 11px; color: #000; text-transform: uppercase; letter-spacing: 1px; }
  .ps-water-value { font-size: 12px; font-variant-numeric: tabular-nums; }
  .ps-water-minerals { font-size: 12px; padding: 4px 0; }
  .ps-water-minerals-label { color: #000; font-size: 11px; margin-right: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .ps-water-minerals-value { font-variant-numeric: tabular-nums; }
  .ps-water-salts { font-size: 12px; padding-top: 2px; color: #000; }
  .ps-yeast-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: baseline; font-size: 12px; padding: 2px 0; }
  .ps-yeast-short { color: #b85020; font-weight: 600; }
  .ps-yeast-ok    { color: #5a8a4a; }
  .ps-extra-body { font-size: 12px; white-space: pre-wrap; padding: 4px 0; }
  @media print { .ps-section { page-break-inside: avoid; } }
`;

// ─── Public entry point ─────────────────────────────────────────────

export function printPrepSheet(inputs: PrepSheetInputs): void {
  const body = [
    buildHeader(inputs),
    buildFermentables(inputs),
    buildWater(inputs),
    buildHops(inputs),
    buildYeast(inputs),
    buildExtraAdditions(inputs),
  ].join('\n');

  const beerName = inputs.recipe.beerName || inputs.recipe.name || 'Recipe';
  printHtml(body, {
    title: `${beerName} — Prep Sheet`,
    pageSize: 'A4',
    landscape: false,
    extraStyles: EXTRA_STYLES,
  });
}
