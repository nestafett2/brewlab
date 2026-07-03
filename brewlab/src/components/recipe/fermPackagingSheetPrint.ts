/**
 * Print Fermentation & Packaging Sheet — A4-portrait combined handwriting
 * sheet. The brewer prints it once fermentation starts and uses it through
 * dry-hop, harvest, and packaging. Same visual language as the Brew Day
 * Sheet (brewDaySheetPrint.ts) — target chips for pre-printed values,
 * underlined blanks for the brewer to fill in by hand.
 *
 * Unlike the Brew Day Sheet, most fields here are blank on purpose — this
 * sheet is handed out before fermentation/packaging readings exist, so
 * there's nothing to pre-fill except the recipe's own targets and the
 * couple of fermMeta fields the brewer may have already entered digitally
 * (harvest amount/container, DH dates).
 */
import type {
  Recipe,
  Ingredient,
  FermMeta,
  ColdSideData,
  BrewDayData,
} from '../../types';
import { printHtml, escapeHtml } from '../../lib/print';
import { fmtNum } from '../../lib/format';

export interface FermPackagingSheetInputs {
  recipe: Recipe;
  ingredients: Ingredient[];
  fermMeta: FermMeta;
  coldSide: ColdSideData;
  brewDay: BrewDayData;
  brewerName: string;
  tankName: string;
}

// ─── Format helpers ─────────────────────────────────────────────────

const EM_DASH = '—';
const isNum = (n: unknown): n is number => typeof n === 'number' && isFinite(n);

// Wraps a target value in a chip. Always returns the chip span — when the
// underlying value is missing, the chip shows EM_DASH so the brewer can
// see at a glance the target wasn't pre-printable.
const chip = (text: string): string =>
  `<span class="bds-target">${escapeHtml(text)}</span>`;

// Wraps a handwriting blank. Width hint controls the underline length.
const blank = (width = 90): string =>
  `<span class="bds-blank" style="min-width:${width}px"></span>`;

// ─── Section builders ───────────────────────────────────────────────

function buildHeader(inputs: FermPackagingSheetInputs): string {
  const { recipe, brewerName, tankName } = inputs;
  const beerName = recipe.beerName || recipe.name || 'Recipe';
  const brewNum = recipe.taxBatch || EM_DASH;
  const date = recipe.brewDate || EM_DASH;
  const og = fmtNum(recipe.ogPlato > 0 ? recipe.ogPlato : null, { dp: 1, suffix: '°P' });
  const fg = fmtNum(recipe.fgPlato > 0 ? recipe.fgPlato : null, { dp: 1, suffix: '°P' });
  const abv = fmtNum(recipe.abv > 0 ? recipe.abv : null, { dp: 1, suffix: '%' });

  return `
    <div class="bds-header">
      <div class="bds-header-left">
        <div class="bds-beer-name">${escapeHtml(beerName)} · ferm &amp; packaging</div>
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

// DH slot date/temp lookup — explicit per-slot access (not a computed
// template-literal index) so FermMeta's literal key types stay checked.
function dhLine(fermMeta: FermMeta, slot: 1 | 2 | 3): string | null {
  const date = slot === 1 ? fermMeta['dh1-date'] : slot === 2 ? fermMeta['dh2-date'] : fermMeta['dh3-date'];
  if (!date) return null;
  const temp = slot === 1 ? fermMeta['dh1-temp'] : slot === 2 ? fermMeta['dh2-temp'] : fermMeta['dh3-temp'];
  const tempStr = temp ? ` @ ${escapeHtml(temp)}°C` : '';
  return `DH${slot}: ${escapeHtml(date)}${tempStr}`;
}

function buildFermLog(inputs: FermPackagingSheetInputs): string {
  const { fermMeta } = inputs;

  const bodyRows = Array.from({ length: 15 }, () => `
    <tr>
      <td class="fps-blank-cell"></td>
      <td class="fps-blank-cell"></td>
      <td class="fps-blank-cell"></td>
      <td class="fps-blank-cell"></td>
      <td class="fps-blank-cell"></td>
    </tr>
  `).join('');

  const dhChips = ([1, 2, 3] as const)
    .map(slot => dhLine(fermMeta, slot))
    .filter((line): line is string => line != null)
    .map(chip)
    .join(' ');

  return `
    <section class="bds-section">
      <div class="bds-section-head">
        <span class="bds-section-title">FERMENTATION LOG</span>
      </div>
      <table class="bds-meas-table fps-ferm-table">
        <colgroup>
          <col style="width:14%"><col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:48%">
        </colgroup>
        <thead>
          <tr><th>Date</th><th>Plato</th><th>pH</th><th>Temp (°C)</th><th>Notes</th></tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      ${dhChips ? `<div class="bds-inline">${dhChips}</div>` : ''}
    </section>
  `;
}

function buildHarvest(inputs: FermPackagingSheetInputs): string {
  const { fermMeta } = inputs;
  const container = (fermMeta['harvest-cont'] || '').trim();
  const amount = (fermMeta['harvest-amt'] || '').trim();

  const containerCell = container
    ? `<td>${escapeHtml(container)}</td>`
    : `<td class="fps-blank-cell"></td>`;
  const amountCell = amount
    ? `<td class="r">${escapeHtml(amount)}</td>`
    : `<td class="r fps-blank-cell"></td>`;

  return `
    <section class="bds-section">
      <div class="bds-section-head">
        <span class="bds-section-title">HARVEST</span>
      </div>
      <table class="bds-table">
        <thead>
          <tr><th>Date</th><th>Container</th><th class="r">Amount (L)</th><th>Generation</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr>
            <td class="fps-blank-cell"></td>
            ${containerCell}
            ${amountCell}
            <td class="fps-blank-cell"></td>
            <td class="fps-blank-cell"></td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function buildPackaging(inputs: FermPackagingSheetInputs): string {
  const { recipe } = inputs;

  const carbTarget = isNum(recipe.plannedCarb) && recipe.plannedCarb > 0
    ? chip(fmtNum(recipe.plannedCarb, { dp: 1, suffix: ' vols' }))
    : blank(90);

  const leftFields: Array<[string, string]> = [
    ['Keg date', blank(110)],
    ['Can date', blank(110)],
    ['Transfer to BT', blank(110)],
    ['BT vessel', blank(110)],
    ['FG (°P)', blank(110)],
    ['pH', blank(110)],
    ['Carbonation target', carbTarget],
    ['Actual carbonation', blank(110)],
  ];
  const leftHtml = leftFields
    .map(([label, value]) => `<div class="fps-field"><label>${escapeHtml(label)}</label> ${value}</div>`)
    .join('');

  const pkgRows: Array<{ label: string; size: boolean; qty: boolean; bold?: boolean }> = [
    { label: 'Keg',            size: true,  qty: true },
    { label: 'Can (ml)',       size: true,  qty: true },
    { label: 'Keg waste (L)',  size: false, qty: false },
    { label: 'Can waste (L)',  size: false, qty: false },
    { label: 'Total packaged', size: false, qty: false, bold: true },
  ];
  const pkgRowsHtml = pkgRows.map(r => `
    <tr>
      <td class="${r.bold ? 'fps-pkg-total-label' : ''}">${escapeHtml(r.label)}</td>
      <td class="${r.size ? 'fps-pkg-cell' : ''}"></td>
      <td class="${r.qty  ? 'fps-pkg-cell' : ''}"></td>
      <td class="fps-pkg-cell"></td>
    </tr>
  `).join('');

  return `
    <section class="bds-section">
      <div class="bds-section-head">
        <span class="bds-section-title">PACKAGING</span>
      </div>
      <div class="fps-two-col">
        <div class="fps-col-left">${leftHtml}</div>
        <div class="fps-col-right">
          <table class="fps-pkg-table">
            <thead>
              <tr><th></th><th class="r">Size</th><th class="r">Qty</th><th class="r">Total L</th></tr>
            </thead>
            <tbody>${pkgRowsHtml}</tbody>
          </table>
          <div class="fps-vol-summary">
            <div class="fps-field"><label>Into FV (L)</label> ${blank(90)}</div>
            <div class="fps-field"><label>FV → Tank waste (L)</label> ${blank(90)}</div>
            <div class="fps-field"><label>Into Tank (L)</label> ${blank(90)}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildNotes(): string {
  // Lined writing surface — shorter than the Brew Day Sheet's (80px vs
  // 110px) since this sheet already carries four sections above it.
  return `
    <section class="bds-section">
      <div class="bds-section-head">
        <span class="bds-section-title">NOTES</span>
      </div>
      <div class="bds-notes-box" style="height:80px"></div>
    </section>
  `;
}

// ─── Print stylesheet ───────────────────────────────────────────────
//
// bds-* rules copied verbatim from brewDaySheetPrint.ts's EXTRA_STYLES —
// same visual language (target chips, handwriting blanks, section
// headers). fps-* rules are new, for the two-column Packaging layout and
// the taller Fermentation Log grid cells.

const EXTRA_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #111; }

  /* Header */
  .bds-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 1px solid #333; }
  .bds-beer-name { font-size: 18px; font-weight: 500; margin-bottom: 2px; }
  .bds-beer-sub { font-size: 12px; color: #666; }
  .bds-header-right { text-align: right; }
  .bds-brew-label { font-size: 11px; color: #666; letter-spacing: 1px; }
  .bds-brew-num   { font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .bds-stats-row { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0 6px; border-bottom: 1px solid #ddd; font-size: 12px; }
  .bds-stats-group { display: flex; flex-wrap: wrap; gap: 14px; }
  .bds-stat label { color: #888; font-size: 11px; letter-spacing: 0.5px; margin-right: 4px; text-transform: uppercase; }

  /* Sections */
  .bds-section { padding: 8px 0 4px; page-break-inside: avoid; border-bottom: 1px solid #eee; }
  .bds-section:last-of-type { border-bottom: none; }
  .bds-section-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }
  .bds-section-title { font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #444; }
  .bds-section-meta  { font-size: 11px; color: #444; }
  .bds-subhead { font-size: 11px; font-weight: 500; color: #555; margin: 4px 0 2px; letter-spacing: 0.6px; }

  /* Target chip — pre-printed value the brewer reads. */
  .bds-target {
    display: inline-block;
    background: #FFF4D9;
    border: 1px solid #E8D89E;
    border-radius: 3px;
    padding: 1px 6px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Inline handwriting blank — underline the brewer writes on. */
  .bds-blank {
    display: inline-block;
    border-bottom: 1px solid #999;
    min-width: 90px;
    height: 14px;
    vertical-align: bottom;
  }

  /* Tables */
  .bds-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
  .bds-table th { border: none; border-bottom: 1px solid #999; padding: 4px 6px; text-align: left; font-weight: 500; font-size: 11px; color: #444; }
  .bds-table td { border: none; border-bottom: 1px solid #eee; padding: 3px; }
  .bds-table th.r, .bds-table td.r { text-align: right; font-variant-numeric: tabular-nums; }

  /* Measurement grid — handwriting cells, header row style */
  .bds-meas-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
  .bds-meas-table th { border: 1px solid #ccc; background: #f7f7f7; font-size: 10px; color: #666; font-weight: 500; padding: 4px; text-align: center;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Row-cell layout — label + value pairs */
  .bds-row { display: flex; flex-wrap: wrap; gap: 18px; padding: 2px 0; }
  .bds-row-cell { display: flex; align-items: baseline; gap: 6px; font-size: 12px; white-space: nowrap; }
  .bds-row-cell label { color: #888; font-size: 11px; letter-spacing: 0.4px; }

  /* Inline non-row blank */
  .bds-inline { padding: 4px 0; font-size: 12px; color: #444; }

  /* Notes box — lined handwriting surface. */
  .bds-notes-box {
    border: 1px solid #999;
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

  /* Fermentation Log — taller handwriting cells (24px) than the Brew Day
     Sheet's mash measurement grid (20px), since Plato/pH/Temp readings
     take a bit more room to write clearly across 15 rows. */
  .fps-ferm-table td.fps-blank-cell { border: 1px solid #ccc; height: 24px; }

  /* Shared blank-cell style for Harvest's single-row table too. */
  .fps-blank-cell { border: 1px solid #ccc; height: 24px; }

  /* Packaging — two-column layout: label/blank fields left, volumes grid right. */
  .fps-two-col { display: flex; gap: 16px; }
  .fps-col-left { flex: 0 0 55%; }
  .fps-col-right { flex: 0 0 43%; }
  .fps-field { display: flex; align-items: baseline; gap: 6px; font-size: 12px; padding: 3px 0; }
  .fps-field label { color: #888; font-size: 11px; letter-spacing: 0.4px; min-width: 130px; }

  .fps-pkg-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
  .fps-pkg-table th { border: 1px solid #ccc; background: #f7f7f7; font-size: 10px; color: #666; font-weight: 500; padding: 4px; text-align: left;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .fps-pkg-table th.r { text-align: right; }
  .fps-pkg-table td { border: none; padding: 3px 6px; font-size: 11px; }
  .fps-pkg-cell { border: 1px solid #ccc; height: 20px; }
  .fps-pkg-total-label { font-weight: 600; }

  .fps-vol-summary { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }

  @media print { .bds-section { page-break-inside: avoid; } }
`;

// ─── Public entry point ─────────────────────────────────────────────

export function printFermPackagingSheet(inputs: FermPackagingSheetInputs): void {
  const body = [
    buildHeader(inputs),
    buildFermLog(inputs),
    buildHarvest(inputs),
    buildPackaging(inputs),
    buildNotes(),
  ].join('\n');

  const beerName = inputs.recipe.beerName || inputs.recipe.name || 'Recipe';
  printHtml(body, {
    title: `${beerName} — Ferm & Packaging Sheet`,
    pageSize: 'A4',
    landscape: false,
    extraStyles: EXTRA_STYLES,
  });
}
