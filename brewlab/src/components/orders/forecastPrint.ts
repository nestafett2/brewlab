/**
 * Order Planner forecast — print view. Rebuilds the same timeline the
 * on-screen ForecastTable renders (deriveTimeline + the day-limit
 * filter from ForecastTable.tsx) and prints it as a clean HTML table:
 * ingredient, on-hand, per-brew amount/balance, needed, status.
 *
 * Uses the shared print-popup helper (`lib/print.ts:printHtml`) that
 * every other print path in the app goes through.
 */

import { printHtml, escapeHtml } from '../../lib/print';
import { fmtKg, INV_UNITS } from '../../lib/units';
import { dateToStr, todayDate } from '../../lib/dates';
import {
  buildForecastRows, computeRowStatus, deriveTimeline,
  type LibSection, type LibBySection,
} from './orderForecast';
import type { PlannerBrew, OrderEntry, RecurringOrder, LedgerData, Ingredient } from '../../types';

const SECTION_LABEL: Record<LibSection, string> = {
  malts: 'MALTS', hops: 'HOPS', yeast: 'YEAST', misc: 'ADJUNCTS',
};

const PRINT_STYLE = `
  body { font-family: 'IBM Plex Mono', monospace; font-size: 9px; color: #000; background: #fff; margin: 20px; }
  h1 { font-size: 14px; letter-spacing: 1px; margin-bottom: 4px; }
  .subtitle { font-size: 10px; color: #000; margin-bottom: 14px; }
  h2 { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #c07010; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
  th, td { border: 1px solid #555; padding: 3px 6px; text-align: left; }
  th { background: #eee; font-weight: 600; font-size: 8px; }
  td.r, th.r { text-align: right; }
  td.c, th.c { text-align: center; }
  .status-ok    { color: #2a7a2a; font-weight: 700; }
  .status-low   { color: #b06a00; font-weight: 700; }
  .status-short { color: #b02020; font-weight: 700; }
  @media print { body { margin: 8px; } }
`;

type RecipeLookup = Map<string, { taxBatch: string; beerName: string; name: string }>;

function formatBrewHeader(brew: { name: string; recipeId?: string | null }, recipeById: RecipeLookup): string {
  const r = brew.recipeId ? recipeById.get(brew.recipeId) : undefined;
  const tax = r?.taxBatch?.trim() ?? '';
  const beer = (r?.beerName?.trim() || r?.name?.trim()) ?? '';
  if (tax && beer) return `${tax} — ${beer}`;
  if (tax)         return tax;
  if (beer)        return beer;
  return brew.name;
}

function statusClass(status: 'DONE' | 'OK' | 'LOW' | 'SHORT'): string {
  return status === 'SHORT' ? 'status-short' : status === 'LOW' ? 'status-low' : 'status-ok';
}

function statusLabel(status: 'DONE' | 'OK' | 'LOW' | 'SHORT'): string {
  return status === 'DONE' ? '✓ DONE'
    : status === 'SHORT'   ? '⚠ SHORT'
    : status === 'LOW'     ? '⚡ LOW' : '✓ OK';
}

export function printForecastTable(args: {
  section: LibSection | 'all';
  plannerBrews: PlannerBrew[];
  orders: OrderEntry[];
  recurringOrders: RecurringOrder[];
  libBySection: LibBySection;
  inventoryStock: Record<string, number>;
  ledgerData: LedgerData;
  getIngredients: (recipeId: string) => Ingredient[];
  recipeById: RecipeLookup;
  dayLimit: number;
  breweryName?: string | null;
}): void {
  const {
    section, plannerBrews, orders, recurringOrders, libBySection, inventoryStock, ledgerData,
    getIngredients, recipeById, dayLimit, breweryName,
  } = args;

  const getTaxBatch = (recipeId: string): string => recipeById.get(recipeId)?.taxBatch ?? '';

  const timeline = deriveTimeline(plannerBrews, orders, recurringOrders);
  const today = new Date();
  const filtered = dayLimit === 0 ? timeline : timeline.filter(col => {
    const colDate = new Date(col.kind === 'brew' ? col.brew.start : col.date);
    const diffDays = (colDate.getTime() - today.getTime()) / 86400000;
    return diffDays <= dayLimit;
  });

  const sections: LibSection[] = section === 'all'
    ? ['malts', 'hops', 'yeast', 'misc']
    : [section];
  const sectionLabel = section === 'all' ? 'ALL INGREDIENTS' : SECTION_LABEL[section];

  const colTh = 'style="width:120px; min-width:120px; max-width:120px; white-space:normal; word-break:normal; overflow-wrap:break-word; text-align:center;"';
  const colTd = 'style="width:60px; min-width:60px; max-width:60px;"';

  const colHeaderCells = filtered.map(col => col.kind === 'brew'
    ? `<th colspan="2" ${colTh}>${escapeHtml(formatBrewHeader(col.brew, recipeById))}<br>${escapeHtml(col.brew.start.slice(5))}</th>`
    : `<th colspan="2" ${colTh}>📦 ${escapeHtml(col.date.slice(5).replace('-', '/'))}</th>`
  ).join('');

  const sectionBlocks = sections.map(sec => {
    const rows = buildForecastRows(sec, filtered, libBySection, inventoryStock, ledgerData, getIngredients, getTaxBatch);
    if (!rows.length) return '';
    const unit = INV_UNITS[sec];
    const bodyRows = rows.map(row => {
      const status = computeRowStatus(row);
      const cellHtml = row.colAmts.flatMap((c, j) => {
        const bal = row.balances[j];
        const amtCell = c.incoming > 0
          ? `+${fmtKg(c.incoming)}`
          : c.recorded ? '✓' : c.amt > 0 ? fmtKg(c.amt) : '';
        return [
          `<td class="c" ${colTd}>${escapeHtml(amtCell)}</td>`,
          `<td class="c" ${colTd}>${escapeHtml(fmtKg(bal))}</td>`,
        ];
      }).join('');
      return `<tr>
        <td>${escapeHtml(row.entry.name || '—')}</td>
        <td class="r">${escapeHtml(fmtKg(row.stock))}</td>
        ${cellHtml}
        <td class="r">${escapeHtml(fmtKg(row.totalNeeded))}</td>
        <td class="${statusClass(status)}">${statusLabel(status)}</td>
      </tr>`;
    }).join('');
    return `
      <h2>${escapeHtml(SECTION_LABEL[sec])} · ${escapeHtml(unit.toUpperCase())}</h2>
      <table>
        <thead><tr>
          <th>Ingredient</th><th class="r">On Hand</th>${colHeaderCells}<th class="r">Needed</th><th>Status</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>`;
  }).join('');

  const brand = breweryName?.trim() || 'BrewLab';
  const dateLabel = dateToStr(todayDate());

  printHtml(`
    <h1>${escapeHtml(brand)} — Order Forecast</h1>
    <div class="subtitle">${escapeHtml(dateLabel)} · ${escapeHtml(sectionLabel)}</div>
    ${sectionBlocks || '<p>No ingredients from your library are used in any planned brew.</p>'}
  `, {
    title: `${brand} — Order Forecast — ${dateLabel} — ${sectionLabel}`,
    landscape: true,
    extraStyles: PRINT_STYLE,
  });
}
