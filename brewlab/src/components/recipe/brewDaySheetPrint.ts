/**
 * Print Brew Day Sheet — A4-portrait handwriting sheet. The brewer prints
 * it, clips it to the workstation, and fills it in by hand throughout the
 * brew day. Sections follow chronological brew order: mash → lauter &
 * sparge → boil & whirlpool → knockout & pitch → efficiency → notes.
 *
 * Pure builder. Routes through src/lib/print.ts::printHtml. Targets are
 * pre-printed (light background chip + weight 500) so the brewer can
 * eyeball them against the actuals they write in the underlined blanks.
 *
 * Graceful "—" fallbacks throughout. Sections never crash on missing
 * library entries, missing water-chem blob, or no mash profile assigned.
 */
import type {
  Recipe,
  Ingredient,
  YeastLib,
  HopLib,
  WaterChemData,
  WaterMineral,
  MashProfile,
  BrewDayData,
} from '../../types';
import type { BrewDayTargets } from '../../lib/calculations';
import { printHtml, escapeHtml } from '../../lib/print';
import { fmtNum } from '../../lib/format';
import { fmtAmt } from '../../lib/utils';
import { WATER_CHEM_KW } from '../../lib/waterChem';

// Print-only water-chem check — deliberately NOT lib/waterChem.ts's
// isWaterChem. That helper lets an explicit `use` (e.g. 'mash', 'boil')
// override the name regex, which is correct for tax purposes (trusts the
// brewer's explicit choice) but means an imported water-chem ingredient
// tagged use='mash'/'boil' isn't recognised as water-chem there — so it
// leaked into this sheet's boil additions table instead of the salts
// lines. Here, the name regex always wins over a non-water-chemistry
// `use`, at the cost of a rare false positive (e.g. "Kaffir Lime" tagged
// use='Boil'). Do not use this for tax/classification code — only for
// this print sheet's display grouping.
const isPrintWaterChem = (ing: Ingredient): boolean => {
  const use = (ing.use || '').trim().toLowerCase();
  if (use === 'water chemistry') return true;
  return WATER_CHEM_KW.test(ing.name || '');
};

export interface BrewDaySheetInputs {
  recipe: Recipe;
  ingredients: Ingredient[];
  targets: BrewDayTargets;
  /** Brew Day blob — `BrewDayData.fermTemp` feeds the ferm-temp target
   *  chip in the Knockout & Pitch section. When unset, the print falls
   *  back to a yeast-lib min/max midpoint, then to "—". */
  brewDay: BrewDayData;
  waterChem: WaterChemData;
  mashProfile: MashProfile | null;     // null when no profile assigned
  tankName: string;                     // resolved (or '')
  brewerName: string;                   // settings.breweryName (or '')
  yeastLib: YeastLib[];
  hopLib: HopLib[];
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
const fmtInt = (v: unknown, suffix = ''): string => {
  const n = num(v);
  return isFinite(n) ? Math.round(n).toString() + suffix : EM_DASH;
};

// Wraps a target value in a chip. Always returns the chip span — when the
// underlying value is missing, the chip shows EM_DASH so the brewer can
// see at a glance the target wasn't pre-printable.
const chip = (text: string): string =>
  `<span class="bds-target">${escapeHtml(text)}</span>`;

// Wraps a handwriting blank. Width hint controls the underline length.
const blank = (width = 90): string =>
  `<span class="bds-blank" style="min-width:${width}px"></span>`;

// Friendly mineral names for salt-addition lines (mirrors prepSheetPrint.ts).
const MINERAL_LABEL: Record<WaterMineral, string> = {
  gypsum: 'Gypsum',
  cacl2:  'CaCl₂',
  epsom:  'Epsom',
  mgcl2:  'MgCl₂',
  nacl:   'NaCl',
  nahco3: 'Baking soda',
};

// Ingredient-row water-chem items (type='misc', isPrintWaterChem true)
// don't get routed to Mash vs Sparge salts via `use` — a brewer might tag
// one 'mash' and another 'boil', but that's not reliable enough to sort
// on. Split them by name instead: acids/preservatives are
// typically dosed at boil/sparge for pH; mineral salts typically go into
// the mash/sparge water.
const ACID_KW = /acid|campden|metabisulfite/i;
const waterChemIngSalt = (ing: Ingredient): string =>
  `${escapeHtml(ing.name || '—')} ${fmtAmt(ing.amt, ing.unit)}${ing.unit ? ' ' + escapeHtml(ing.unit) : ''}`;

// ─── Section builders ───────────────────────────────────────────────

function buildHeader(inputs: BrewDaySheetInputs): string {
  const { recipe, brewerName, tankName } = inputs;
  const beerName = recipe.beerName || recipe.name || 'Recipe';
  const batchL = isNum(recipe.batchL) && recipe.batchL > 0
    ? Math.round(recipe.batchL).toLocaleString('en-US') + ' L'
    : EM_DASH;
  const style = recipe.style || EM_DASH;
  const brewNum = recipe.taxBatch || EM_DASH;
  const date = recipe.brewDate || EM_DASH;
  const og = recipe.ogPlato > 0 ? fmt(recipe.ogPlato, 1, '°P') : EM_DASH;
  const fg = recipe.fgPlato > 0 ? fmt(recipe.fgPlato, 1, '°P') : EM_DASH;
  const abv = recipe.abv > 0 ? fmt(recipe.abv, 1, '%') : EM_DASH;

  return `
    <div class="bds-header">
      <div class="bds-header-left">
        <div class="bds-beer-name">${escapeHtml(beerName)} · brew day</div>
        <div class="bds-beer-sub">${escapeHtml(beerName)} · ${escapeHtml(batchL)} · ${escapeHtml(style)}</div>
      </div>
      <div class="bds-header-right">
        <div class="bds-brew-label">BREW #</div>
        <div class="bds-brew-num">${escapeHtml(brewNum)}</div>
      </div>
    </div>
    <div class="bds-stats-row">
      <div class="bds-stats-group">
        <span class="bds-stat"><label>Date</label> ${escapeHtml(date)}</span>
        <span class="bds-stat"><label>Brewer</label> ${escapeHtml(brewerName || EM_DASH)}</span>
        <span class="bds-stat"><label>Tank</label> ${escapeHtml(tankName || EM_DASH)}</span>
      </div>
      <div class="bds-stats-group">
        <span class="bds-stat"><label>Target OG</label> ${chip(og)}</span>
        <span class="bds-stat"><label>FG</label> ${chip(fg)}</span>
        <span class="bds-stat"><label>ABV</label> ${chip(abv)}</span>
      </div>
    </div>
  `;
}

function buildMash(inputs: BrewDaySheetInputs): string {
  const { targets, waterChem, mashProfile, ingredients } = inputs;

  const mins = waterChem.minerals ?? {};
  const mashSalts = (Object.keys(mins) as WaterMineral[])
    .filter(k => { const m = mins[k]; return m && isFinite(num(m.mash)) && num(m.mash) > 0; })
    .map(k => `${MINERAL_LABEL[k]} ${fmt(num(mins[k]!.mash), 1)} g`)
    .join(' · ');
  // Ingredient-row water-chem items that read as mineral salts (not acids)
  // — see ACID_KW comment above.
  const mashSaltIngs = ingredients
    .filter(ing => ing.type === 'misc' && isPrintWaterChem(ing) && !ACID_KW.test(ing.name || ''))
    .map(waterChemIngSalt)
    .join(', ');
  const mashSaltsCombined = [mashSalts, mashSaltIngs].filter(Boolean).join(', ');

  const strikeVol = isNum(targets.mashWaterL) && targets.mashWaterL > 0
    ? fmt(targets.mashWaterL, 0, ' L')
    : EM_DASH;
  const strikeTemp = isNum(targets.strikeTempC) && targets.strikeTempC > 0
    ? fmt(targets.strikeTempC, 1, ' °C')
    : EM_DASH;
  const strikeStr = strikeVol === EM_DASH && strikeTemp === EM_DASH
    ? EM_DASH
    : `${strikeVol} @ ${strikeTemp}`;
  const targetPh = waterChem.targetPh ? String(waterChem.targetPh) : EM_DASH;

  const steps = mashProfile?.steps ?? [];
  const stepsSectionHtml = steps.length === 0
    ? '<div class="bds-row"><span class="muted">No mash profile assigned — fill in by hand.</span></div>'
    : `<div style="display:flex; gap:24px; padding:4px 0 6px;">
        ${steps.map((s, i) => `
          <div style="display:flex; align-items:flex-start; gap:8px;">
            <div style="font-size:12px; padding-top:18px; white-space:nowrap;">
              <span style="color:#000; margin-right:4px;">${i + 1}</span>${escapeHtml(s.type || '—')}
            </div>
            <div style="display:flex; gap:12px;">
              <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <div style="display:flex; gap:12px; font-size:10px; color:#000;">
                  <span style="min-width:60px; text-align:center;">Target</span>
                  <span style="min-width:60px; text-align:center;">Actual</span>
                </div>
                <div style="font-size:10px; color:#000; align-self:flex-start;">°C</div>
                <div style="display:flex; gap:12px; align-items:center;">
                  ${chip(fmt(s.temp, 1, ' °C'))}
                  ${blank(60)}
                </div>
                <div style="font-size:10px; color:#000; align-self:flex-start; margin-top:4px;">min</div>
                <div style="display:flex; gap:12px; align-items:center;">
                  ${chip(fmtInt(s.time, ' min'))}
                  ${blank(60)}
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>`;

  // Mash measurement grid — 4 rows × 6 cols of empty cells. Each cell
  // gets a min-height so handwriting space is consistent. Notes row gets
  // extra height (bds-meas-cell-notes) since it holds free text, not a
  // single reading.
  const measRows = ['Temp', 'pH', 'Gravity', 'Notes'];
  const measCols = ['', '', '', '', '', 'Pre-trans'];
  const gridHead = `<tr><th></th>${measCols.map((c, i) =>
    `<th class="bds-meas-col">${i < 5 ? '' : escapeHtml(c)}</th>`
  ).join('')}</tr>`;
  const gridBody = measRows.map(r => `<tr>
    <td class="bds-meas-rowlabel">${escapeHtml(r)}</td>
    ${measCols.map(() => `<td class="bds-meas-cell${r === 'Notes' ? ' bds-meas-cell-notes' : ''}"></td>`).join('')}
  </tr>`).join('');

  return `
    <section class="bds-section">
      <div class="bds-section-head">
        <span class="bds-section-title">MASH</span>
        <span class="bds-section-meta">
          Strike ${chip(strikeStr)} · Target pH ${chip(targetPh)} · Flowmeter start ${blank(80)} · Flowmeter finish ${blank(80)}
        </span>
      </div>
      ${stepsSectionHtml}
      <div class="bds-subhead">Mash measurements</div>
      <table class="bds-meas-table">
        <thead>${gridHead}</thead>
        <tbody>${gridBody}</tbody>
      </table>
      <div class="bds-inline"><label>Mash salts</label> ${mashSaltsCombined || '<em class="muted">—</em>'}</div>
    </section>
  `;
}

function buildLauterAndSparge(inputs: BrewDaySheetInputs): string {
  const { targets, waterChem, ingredients } = inputs;

  const spargeMins = waterChem.minerals ?? {};
  const spargeSalts = (Object.keys(spargeMins) as WaterMineral[])
    .filter(k => { const m = spargeMins[k]; return m && isFinite(num(m.sparge)) && num(m.sparge) > 0; })
    .map(k => `${MINERAL_LABEL[k]} ${fmt(num(spargeMins[k]!.sparge), 1)} g`)
    .join(' · ');
  // Ingredient-row water-chem items that read as acids/preservatives
  // (boil/sparge pH adjustments) — see ACID_KW comment above.
  const spargeSaltIngs = ingredients
    .filter(ing => ing.type === 'misc' && isPrintWaterChem(ing) && ACID_KW.test(ing.name || ''))
    .map(waterChemIngSalt)
    .join(', ');
  const spargeSaltsCombined = [spargeSalts, spargeSaltIngs].filter(Boolean).join(', ');

  const spargeTarget = isNum(targets.spargeVolL) && targets.spargeVolL > 0
    ? fmt(targets.spargeVolL, 0, ' L')
    : EM_DASH;
  const preBoilVol = isNum(targets.preBoilVolL) && targets.preBoilVolL > 0
    ? fmt(targets.preBoilVolL, 1, ' L')
    : EM_DASH;
  const preBoilP = isNum(targets.preBoilGravityP) && targets.preBoilGravityP > 0
    ? fmt(targets.preBoilGravityP, 2, ' °P')
    : EM_DASH;

  // Sparge tracker — labels per spec. Formulas in parens are for the
  // brewer's reference (they fill in the rows by hand; we don't auto-
  // compute on the printed sheet).
  const spargeSteps: Array<{ n: number; label: string; targetChip?: string }> = [
    { n: 1, label: 'Start sparge' },
    { n: 2, label: 'Finish sparge' },
    { n: 3, label: 'After underlet' },
    { n: 4, label: 'After grain rinse' },
    { n: 5, label: 'Sparge amount', targetChip: spargeTarget },
    { n: 6, label: 'Extra used (= 2 − 1)' },
    { n: 7, label: 'Need sparge (= 4 − 5)' },
    { n: 8, label: 'Finish # (= 3 + 6)' },
  ];

  // Compact 2-column grid — 2 steps per row, step number small + muted.
  const spargeCell = (s: { n: number; label: string }) =>
    `<td style="width:50%"><span class="muted" style="margin-right:6px">${s.n}</span>${escapeHtml(s.label)} ${blank(60)}</td>`;
  const spargeRows: string[] = [];
  for (let i = 0; i < spargeSteps.length; i += 2) {
    spargeRows.push(`<tr>${spargeCell(spargeSteps[i])}${spargeCell(spargeSteps[i + 1])}</tr>`);
  }
  const spargeRowsHtml = spargeRows.join('');

  return `
    <section class="bds-section">
      <div class="bds-section-head">
        <span class="bds-section-title">LAUTER &amp; SPARGE</span>
      </div>
      <div class="bds-lauter-wrap">
        <div class="bds-lauter-left">
          <table class="bds-table">
            <tbody>${spargeRowsHtml}</tbody>
          </table>
          <div class="bds-inline"><label>Sparge salts</label> ${spargeSaltsCombined || '<em class="muted">—</em>'}</div>
        </div>
        <div class="bds-lauter-right">
          <div>First runnings <label>pH</label>${blank(45)} <label>Gravity</label>${blank(45)}</div>
          <div>Last runnings <label>pH</label>${blank(45)} <label>Gravity</label>${blank(45)}</div>
          <div><label>Pre-boil target vol</label>${chip(preBoilVol)} <label>Actual</label>${blank(45)}</div>
          <div><label>Target gravity</label>${chip(preBoilP)} <label>Actual gravity</label>${blank(45)}</div>
        </div>
      </div>
    </section>
  `;
}

function buildBoilAndWhirlpool(inputs: BrewDaySheetInputs): string {
  const { recipe, targets, ingredients, hopLib } = inputs;

  // AA% lookup for hop rows only — case-insensitive/trimmed name match.
  const hopAA = (name: string): string => {
    const libE = hopLib.find(h => (h.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    const aa = libE ? num(libE.aa) : NaN;
    return isFinite(aa) ? fmtNum(aa, { dp: 1 }) + '%' : EM_DASH;
  };

  const boilDuration = isNum(recipe.boilTime) && recipe.boilTime > 0
    ? `${recipe.boilTime} min`
    : EM_DASH;
  const postBoilVol = isNum(targets.postBoilVolL) && targets.postBoilVolL > 0
    ? fmt(targets.postBoilVolL, 1, ' L')
    : EM_DASH;
  // Whirlpool temp reference — recipe carries it. Brewer still writes
  // the actual measurement; the target chip is a reminder.
  const wpTemp = isNum(recipe.whirlpoolTemp) && recipe.whirlpoolTemp > 0
    ? fmt(recipe.whirlpoolTemp, 0, ' °C')
    : EM_DASH;

  // Hot-side additions — hops (boil + whirlpool) and non-dry-hop misc.
  // Water-chem misc rows are excluded — they surface in the Mash/Sparge
  // salts lines instead, not this table.
  // Sort: boil hops (highest time first) → whirlpool hops → misc (no time).
  const additions = ingredients.filter(ing =>
    (ing.type === 'hop' || ing.type === 'misc')
    && (ing.use || '').toLowerCase() !== 'dry hop'
    && !(ing.type === 'misc' && isPrintWaterChem(ing))
  );
  const tier = (ing: Ingredient) => {
    if (ing.type !== 'hop') return 2;
    return (ing.use || '').toLowerCase() === 'whirlpool' ? 1 : 0;
  };
  additions.sort((a, b) => tier(a) - tier(b) || (num(b.time) || 0) - (num(a.time) || 0));

  const additionRows = additions.length > 0
    ? additions.map(ing => {
        const amtStr = ing.type === 'hop'
          ? fmt(ing.unit === 'kg' ? ing.amt : ing.amt / 1000, 3, ' kg')
          : fmt(ing.amt, 1, ` ${ing.unit || ''}`.trimEnd());
        const timeStr = isNum(ing.time) ? `${ing.time} min` : EM_DASH;
        const aaStr = ing.type === 'hop' ? hopAA(ing.name || '') : '';
        return `
          <tr>
            <td style="width:20px">☐</td>
            <td class="r">${amtStr}</td>
            <td>${escapeHtml(ing.name || '—')}</td>
            <td class="r">${aaStr}</td>
            <td>${escapeHtml(ing.use || '—')}</td>
            <td class="r">${timeStr}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="6" class="muted">No boil/whirlpool additions.</td></tr>';

  return `
    <section class="bds-section">
      <div class="bds-section-head">
        <span class="bds-section-title">BOIL &amp; WHIRLPOOL</span>
      </div>
      <div class="bds-two-col">
        <div class="bds-col-left">
          <table class="bds-table">
            <thead>
              <tr>
                <th></th>
                <th class="r">Amount</th>
                <th>Name</th>
                <th class="r">AA%</th>
                <th>Use</th>
                <th class="r">Time</th>
              </tr>
            </thead>
            <tbody>${additionRows}</tbody>
          </table>
        </div>
        <div class="bds-col-right">
          <div class="bds-row">
            <div class="bds-row-cell"><label>Boil duration</label> ${chip(boilDuration)}</div>
            <span class="muted">·</span>
            <div class="bds-row-cell"><label>Post-boil target</label> ${chip(postBoilVol)}</div>
            <div class="bds-row-cell"><label>Actual</label> ${blank(70)}</div>
          </div>
          <div class="bds-row">
            <div class="bds-row-cell"><label>WP temp target</label> ${chip(wpTemp)}</div>
            <div class="bds-row-cell"><label>Actual</label> ${blank(70)}</div>
            <div class="bds-row-cell"><label>WP time</label> ${blank(70)}</div>
            <div class="bds-row-cell"><label>Rest</label> ${blank(70)}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildKnockoutAndPitch(inputs: BrewDaySheetInputs): string {
  const { ingredients, targets, brewDay, waterChem, yeastLib } = inputs;

  // Both BrewDayData.pitchTemp and BrewDayData.fermTemp are PLANNED targets
  // entered by the brewer on the BrewDayTab — not actual measurements (per
  // Ben 2026-05-12). The print sheet uses them as the primary source for
  // the corresponding target chips and falls back to yeast-lib values when
  // unset.
  const yeastIng = ingredients.find(i => i.type === 'yeast');
  const yeastLibEntry = yeastIng
    ? yeastLib.find(y =>
        y.id === yeastIng.libId
        || (y.name || '').toLowerCase() === (yeastIng.name || '').toLowerCase()
      )
    : null;

  // Pitch temp resolution: brewDay.pitchTemp → yeast-lib min (also what
  // targets.targetPitchTempC carries — derived in calcBrewDayTargets) →
  // EM_DASH.
  let pitchTempTarget = EM_DASH;
  const bdPitchRaw = (brewDay.pitchTemp ?? '').trim();
  const bdPitchNum = num(bdPitchRaw);
  if (bdPitchRaw !== '' && isFinite(bdPitchNum)) {
    pitchTempTarget = fmt(bdPitchNum, 1, ' °C');
  } else if (isNum(targets.targetPitchTempC) && targets.targetPitchTempC > 0) {
    pitchTempTarget = fmt(targets.targetPitchTempC, 1, ' °C');
  }

  // Ferm temp resolution: brewDay.fermTemp → yeast-lib midpoint
  // (or temp_min when only that's set) → EM_DASH.
  let fermTempRef = EM_DASH;
  const bdFermTempRaw = (brewDay.fermTemp ?? '').trim();
  const bdFermTempNum = num(bdFermTempRaw);
  if (bdFermTempRaw !== '' && isFinite(bdFermTempNum)) {
    fermTempRef = fmt(bdFermTempNum, 1, ' °C');
  } else if (yeastLibEntry) {
    const tmin = num(yeastLibEntry.temp_min);
    const tmax = num(yeastLibEntry.temp_max);
    if (isFinite(tmin) && isFinite(tmax)) fermTempRef = fmt((tmin + tmax) / 2, 1, ' °C');
    else if (isFinite(tmin)) fermTempRef = fmt(tmin, 1, ' °C');
  }

  const pitchPhTarget = waterChem.targetPh ? String(waterChem.targetPh) : EM_DASH;
  const yeastStrain = yeastIng?.name || EM_DASH;
  const pitchAmt = yeastIng && yeastIng.amt > 0
    ? `${fmt(yeastIng.amt, yeastIng.unit === 'g' || yeastIng.unit === 'ml' ? 0 : 1)} ${yeastIng.unit || ''}`.trim()
    : EM_DASH;

  return `
    <section class="bds-section">
      <div class="bds-section-head bds-section-head-left">
        <span class="bds-section-title">KNOCKOUT &amp; PITCH</span>
        <span class="bds-section-meta">Yeast strain ${chip(yeastStrain)} · Pitch amount ${chip(pitchAmt)}</span>
      </div>
      <div class="bds-row">
        <div class="bds-row-cell"><label>Pitch temp target</label> ${chip(pitchTempTarget)}</div>
        <div class="bds-row-cell"><label>Actual</label> ${blank(70)}</div>
        <span class="muted">·</span>
        <div class="bds-row-cell"><label>Ferm temp target</label> ${chip(fermTempRef)}</div>
      </div>
      <div class="bds-row">
        <div class="bds-row-cell"><label>Pitch pH target</label> ${chip(pitchPhTarget)}</div>
        <div class="bds-row-cell"><label>Actual</label> ${blank(70)}</div>
      </div>
      <div class="bds-row">
        <div class="bds-row-cell"><label>O₂ LPM</label> ${blank(110)}</div>
        <div class="bds-row-cell"><label>O₂ time</label> ${blank(110)}</div>
        <div class="bds-row-cell"><label>CM (tank reading)</label> ${blank(110)}</div>
      </div>
    </section>
  `;
}

function buildNotes(): string {
  // Lined writing surface: a tall box with feint horizontal rules so the
  // brewer's handwriting stays straight. 5 lines × ~22 px = ~110 px tall,
  // fits comfortably in the A4 footer area.
  return `
    <section class="bds-section">
      <div class="bds-section-head">
        <span class="bds-section-title">NOTES</span>
      </div>
      <div class="bds-notes-box"></div>
    </section>
  `;
}

// ─── Print stylesheet ───────────────────────────────────────────────

const EXTRA_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #000; }

  /* Header */
  .bds-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 1px solid #333; }
  .bds-beer-name { font-size: 18px; font-weight: 600; margin-bottom: 2px; }
  .bds-beer-sub { font-size: 12px; color: #000; }
  .bds-header-right { text-align: right; }
  .bds-brew-label { font-size: 11px; color: #000; letter-spacing: 1px; }
  .bds-brew-num   { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .bds-stats-row { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0 6px; border-bottom: 1px solid #888; font-size: 12px; }
  .bds-stats-group { display: flex; flex-wrap: wrap; gap: 14px; }
  .bds-stat label { color: #000; font-size: 11px; letter-spacing: 0.5px; margin-right: 4px; text-transform: uppercase; }

  /* Sections */
  .bds-section { padding: 8px 0 4px; page-break-inside: avoid; border-bottom: 1px solid #eee; }
  .bds-section:last-of-type { border-bottom: none; }
  .bds-section-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }
  /* Modifier — pulls the meta info close to the title instead of flush
     right. Scoped to Knockout & Pitch only; Mash's section head still
     needs space-between to push its meta to the far right. */
  .bds-section-head-left { justify-content: flex-start; gap: 24px; }
  .bds-section-title { font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #000; }
  .bds-section-meta  { font-size: 11px; color: #000; }
  .bds-subhead { font-size: 11px; font-weight: 600; color: #000; margin: 4px 0 2px; letter-spacing: 0.6px; }

  /* Target chip — pre-printed value the brewer reads. Soft amber/cream so
     it reads "this is a target" without overpowering the page. */
  .bds-target {
    display: inline-block;
    background: #FFF4D9;
    border: 1px solid #E8D89E;
    border-radius: 3px;
    padding: 1px 6px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Inline handwriting blank — underline the brewer writes on. */
  .bds-blank {
    display: inline-block;
    border-bottom: 1px solid #555;
    min-width: 90px;
    height: 14px;
    vertical-align: bottom;
  }

  /* Tables — mash steps, sparge tracker, runnings */
  .bds-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
  .bds-table th { border: none; border-bottom: 1px solid #555; padding: 4px 6px; text-align: left; font-weight: 600; font-size: 11px; color: #000; }
  .bds-table td { border: none; border-bottom: 1px solid #eee; padding: 3px; }
  .bds-table th.r, .bds-table td.r { text-align: right; font-variant-numeric: tabular-nums; }
  .bds-table td.muted, .muted { color: #000; font-style: italic; }

  /* Mash measurement grid — handwriting cells, taller rows */
  .bds-meas-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
  .bds-meas-table th { border: 1px solid #888; background: #f7f7f7; font-size: 10px; color: #000; font-weight: 600; padding: 4px; text-align: center;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bds-meas-table .bds-meas-rowlabel { width: 70px; border: 1px solid #888; background: #f7f7f7; font-size: 11px; color: #000; padding: 4px 6px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bds-meas-table .bds-meas-cell { border: 1px solid #888; height: 20px; }
  .bds-meas-table .bds-meas-cell-notes { height: 40px; }
  .bds-meas-table .bds-meas-col { width: auto; font-size: 10px; }

  /* Row-cell layout — used for the multi-cell metric rows in boil /
     knockout / efficiency sections. Each cell is a label + value pair. */
  .bds-row { display: flex; flex-wrap: wrap; gap: 18px; padding: 2px 0; }
  .bds-row-cell { display: flex; align-items: baseline; gap: 6px; font-size: 12px; white-space: nowrap; }
  .bds-row-cell label { color: #000; font-size: 11px; letter-spacing: 0.4px; }

  /* Inline non-row blank (used under the mash table for Flowmeter finish) */
  .bds-inline { padding: 4px 0; font-size: 12px; color: #000; }

  /* Two-column layout — Boil & Whirlpool's additions table + condensed fields */
  .bds-two-col { display: flex; gap: 16px; }
  .bds-col-left { flex: 0 0 60%; }
  .bds-col-right { flex: 0 0 38%; }

  /* Two-column layout — Lauter & Sparge's step grid + runnings/pre-boil */
  .bds-lauter-wrap { display: flex; gap: 12px; }
  .bds-lauter-left { flex: 0 0 54%; }
  .bds-lauter-right { flex: 0 0 43%; font-size: 11px; display: flex; flex-direction: column; gap: 6px; justify-content: flex-start; }
  .bds-lauter-right label { color: #000; font-size: 10px; margin-right: 4px; }

  /* Notes box — lined handwriting surface. Five faint rules so the
     brewer's writing tracks straight even without ruled paper. */
  .bds-notes-box {
    border: 1px solid #555;
    height: 110px;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 21px,
      #eee 21px,
      #eee 22px
    );
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  @media print { .bds-section { page-break-inside: avoid; } }
`;

// ─── Public entry point ─────────────────────────────────────────────

export function printBrewDaySheet(inputs: BrewDaySheetInputs): void {
  const body = [
    buildHeader(inputs),
    buildMash(inputs),
    buildLauterAndSparge(inputs),
    buildBoilAndWhirlpool(inputs),
    buildKnockoutAndPitch(inputs),
    buildNotes(),
  ].join('\n');

  const beerName = inputs.recipe.beerName || inputs.recipe.name || 'Recipe';
  printHtml(body, {
    title: `${beerName} — Brew Day Sheet`,
    pageSize: 'A4',
    landscape: false,
    extraStyles: EXTRA_STYLES,
  });
}
