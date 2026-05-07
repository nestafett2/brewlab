/**
 * Tariff print helpers — port of brewlab-desktop.html lines 9805–9854
 * (printTariffPlanner / printNeekyuuHyo / _printTariffWindow) +
 * generateNeekyuuReport (9697).
 *
 * The HTML approach was: dump the tab's innerHTML into a popup and
 * string-replace CSS variables for print-friendly values. That doesn't
 * port cleanly to React (DOM is owned by React), so the React port
 * builds print HTML strings directly from the data:
 *   • printPlanner — renders planned brews + malt totals tables
 *   • printNeekyuu — renders the 8 report blocks (matches HTML behaviour
 *                   where "Print 需給表" calls generateNeekyuuReport)
 *
 * Both go through `_printTariffWindow` which opens a popup with the
 * shared print CSS (HTML 9818–9832), writes the body, then triggers
 * `window.print()` after a small delay so styles and fonts load first.
 */

import {
  fiscalYearLabel, calcMaltUsageFromMaster, calcPlannedMaltUsage,
  buildMonthlyLedger, sumLedgerRange, ledgerOpeningAt, ledgerClosingAt,
} from '../../lib/tariff';
import type {
  TariffData, Template, MaltLib, TaxMasterRow, Ingredient,
} from '../../types';

const PRINT_STYLE = `
body{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#000;background:#fff;margin:20px;}
h1{font-size:13px;letter-spacing:2px;margin-bottom:16px;}
h2{font-size:11px;letter-spacing:1px;margin:16px 0 8px;color:#c07010;}
table{width:100%;border-collapse:collapse;margin-bottom:8px;}
th{text-align:left;border-bottom:2px solid #333;padding:4px 8px;font-size:7px;letter-spacing:0.5px;}
th.r,td.r{text-align:right;}
td{padding:4px 8px;border-bottom:1px solid #ddd;}
tr.total-row td{font-weight:700;border-top:2px solid #333;border-bottom:none;}
.report-block{border:1px solid #ccc;padding:10px;margin-bottom:12px;min-width:280px;page-break-inside:avoid;display:inline-block;vertical-align:top;width:calc(50% - 24px);box-sizing:border-box;margin-right:8px;}
.block-title{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;color:#c07010;}
@media print{body{margin:8px;}}
`;

/**
 * Open a print popup with the supplied body HTML. Mirrors HTML
 * brewlab-desktop.html:9815 with the same setTimeout(400) trick so the
 * popup has time to layout before `print()` fires.
 */
function _printTariffWindow(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Print failed — popup blocked. Allow popups for this site.');
    return;
  }
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
  <style>${PRINT_STYLE}</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  ${bodyHtml}
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const fmt1 = (n: number): string => n > 0 ? n.toFixed(1) : '—';
const fmt3 = (n: number): string => n.toFixed(3);

// ── Print Planner ──────────────────────────────────────────────────────

export function printPlanner(args: {
  year: number;
  data: TariffData;
  templates: Template[];
  taxMaster: TaxMasterRow[];
  ingredientsByRecipe: Record<string, Ingredient[]>;
  maltLib: MaltLib[];
}): void {
  const { year, data, templates, taxMaster, ingredientsByRecipe, maltLib } = args;
  const planner = data.planner ?? [];
  const planned = calcPlannedMaltUsage(planner, templates, maltLib);
  const fyStart = `${year}-04-01`;
  const fyEnd   = `${year + 1}-03-31`;
  const actual  = calcMaltUsageFromMaster(taxMaster, ingredientsByRecipe, maltLib, fyStart, fyEnd);
  const allMalts = [...new Set([...Object.keys(planned), ...Object.keys(actual)])].sort();

  // Planned brews
  const plannerRows = planner.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:#888;padding:12px;">No brews planned.</td></tr>`
    : planner.map(row => {
        const tpl = templates.find(t => t.id === row.templateId);
        return `<tr>
          <td>${escapeHtml(row.month)}</td>
          <td>${escapeHtml(tpl?.name ?? '—')}</td>
          <td class="r">${escapeHtml(row.batchL || '')}</td>
          <td>${escapeHtml(row.classification === 'happoshu' ? 'Happoshu' : 'Beer')}</td>
        </tr>`;
      }).join('');

  // Malt totals
  const totalActual  = Object.values(actual).reduce((s, v) => s + v.total, 0);
  const totalPlanned = Object.values(planned).reduce((s, v) => s + v.total, 0);
  const maltRows = allMalts.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:12px;">No malt usage to report.</td></tr>`
    : allMalts.map(name => {
        const a = actual[name]?.total ?? 0;
        const p = planned[name]?.total ?? 0;
        const isTrq = !!(planned[name]?.tariff || actual[name]?.tariff);
        return `<tr>
          <td>${escapeHtml(name)}</td>
          <td>${isTrq ? 'TRQ' : 'Standard'}</td>
          <td class="r">${fmt1(a)}</td>
          <td class="r">${fmt1(p)}</td>
          <td class="r">${(a + p).toFixed(1)}</td>
        </tr>`;
      }).join('') + `
      <tr class="total-row">
        <td colspan="2">TOTAL</td>
        <td class="r">${totalActual.toFixed(1)}</td>
        <td class="r">${totalPlanned.toFixed(1)}</td>
        <td class="r">${(totalActual + totalPlanned).toFixed(1)}</td>
      </tr>`;

  const body = `
    <h2>Planned Brews — FY ${fiscalYearLabel(year)}</h2>
    <table>
      <thead><tr><th>Month</th><th>Recipe Template</th><th class="r">Batch (L)</th><th>Classification</th></tr></thead>
      <tbody>${plannerRows}</tbody>
    </table>
    <h2>Malt Totals Summary</h2>
    <table>
      <thead><tr><th>Malt</th><th>Tariff</th><th class="r">Actual Used (kg)</th><th class="r">Planned (kg)</th><th class="r">Total Est. (kg)</th></tr></thead>
      <tbody>${maltRows}</tbody>
    </table>
    <p style="margin-top:12px;color:#888;">TRQ = Tariff Rate Quota malt. Print this page to share with your supplier in January.</p>
  `;

  _printTariffWindow(`Annual Malt Planner — FY ${fiscalYearLabel(year)}`, body);
}

// ── Print 需給表 ──────────────────────────────────────────────────────

/**
 * Mirrors HTML's generateNeekyuuReport (9697). For each block in
 * neekyuu.reportBlocks, sum the relevant fields over [from, to] from
 * the monthly ledger, render either a Malt or Production card.
 */
export function printNeekyuu(args: {
  year: number;
  data: TariffData;
  taxMaster: TaxMasterRow[];
  ingredientsByRecipe: Record<string, Ingredient[]>;
  maltLib: MaltLib[];
  reservations: TariffData['reservations'];
}): void {
  const { year, data, taxMaster, ingredientsByRecipe, maltLib, reservations } = args;
  const blocks = data.neekyuu?.reportBlocks ?? [];
  if (blocks.length === 0) {
    alert('Add at least one block first.');
    return;
  }

  const rows = buildMonthlyLedger(year, data.neekyuu, reservations, taxMaster, ingredientsByRecipe, maltLib);

  const blockHtml = blocks.map(b => {
    if (!b.from || !b.to) return '';
    const label = escapeHtml(b.label || `${b.from}~${b.to}`);
    if (b.type === 'malt') {
      const trq = sumLedgerRange(rows, b.from, b.to, 'purchTrq');
      const std = sumLedgerRange(rows, b.from, b.to, 'purchStd');
      const useBeer = sumLedgerRange(rows, b.from, b.to, 'usageBeer');
      const useHap  = sumLedgerRange(rows, b.from, b.to, 'usageHap');
      const open  = ledgerOpeningAt(rows, b.from);
      const close = ledgerClosingAt(rows, b.to);
      return `
      <div class="report-block">
        <div class="block-title">${label}</div>
        <table>
          <thead><tr><th></th><th class="r">TRQ (kg)</th><th class="r">Standard (kg)</th><th class="r">Total (kg)</th></tr></thead>
          <tbody>
            <tr><td>Opening Stock</td><td class="r">—</td><td class="r">—</td><td class="r">${open.toFixed(1)}</td></tr>
            <tr><td>期間中の購入量</td><td class="r">${trq.toFixed(1)}</td><td class="r">${std.toFixed(1)}</td><td class="r">${(trq + std).toFixed(1)}</td></tr>
            <tr><td>使用量（beer）</td><td class="r">—</td><td class="r">—</td><td class="r">${useBeer.toFixed(1)}</td></tr>
            <tr><td>使用量（happoshu）</td><td class="r">—</td><td class="r">—</td><td class="r">${useHap.toFixed(1)}</td></tr>
            <tr class="total-row"><td>Closing Stock</td><td class="r">—</td><td class="r">—</td><td class="r">${close.toFixed(1)}</td></tr>
          </tbody>
        </table>
      </div>`;
    } else {
      const beer = sumLedgerRange(rows, b.from, b.to, 'beerKL');
      const hap  = sumLedgerRange(rows, b.from, b.to, 'hapKL');
      return `
      <div class="report-block">
        <div class="block-title">${label}</div>
        <table>
          <thead><tr><th></th><th class="r">Amount (kL)</th></tr></thead>
          <tbody>
            <tr><td>beer amount</td><td class="r">${fmt3(beer)}</td></tr>
            <tr><td>happoushu amount</td><td class="r">${fmt3(hap)}</td></tr>
          </tbody>
        </table>
      </div>`;
    }
  }).join('');

  _printTariffWindow(
    `需給表 — FY ${fiscalYearLabel(year)}`,
    `<div>${blockHtml}</div>`,
  );
}
