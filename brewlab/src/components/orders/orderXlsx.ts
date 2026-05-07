/**
 * XLSX exports for the Order Planner forecast and the Inventory current
 * stock page. Both reuse `lib/excel.ts:exportWorkbook`.
 *
 *   • exportOrderPlannerXlsx — port of brewlab-desktop.html:15592.
 *     One sheet per section (or the active section). Columns are
 *     Ingredient · On Hand · brew1 (name+date) · Balance · brew2 …
 *     Total Needed · Status. Brew columns only — delivery columns
 *     are omitted to keep the workbook readable for ordering.
 *
 *   • exportInventoryCurrentXlsx — Inventory's "Current Page XLSX"
 *     menu item that was deferred in Phase 1. One sheet per active
 *     section with the same column set the on-screen table shows
 *     (ordered + visibility-filtered, mirroring the user's view).
 *
 * Filename branding uses settings.breweryName (sanitised) per Phase 1
 * convention; falls back to `BrewLab`.
 */

import { exportWorkbook, type CellValue, type SheetSpec } from '../../lib/excel';
import { fmtKg, INV_UNITS, sectionToIngType } from '../../lib/units';
import { getLedgerBalance } from '../../lib/ledger';
import { ingNamesMatch } from '../../lib/ingredient-matcher';
import { dateToStr, todayDate } from '../../lib/dates';
import {
  INV_COL_DEFS, getInvColVisibility, getOrderedVisibleCols,
  type InvSection,
} from '../inventory/inventoryShared';
import type {
  PlannerBrew, LedgerData, Ingredient,
} from '../../types';
import type { LibBySection, LibSection } from './orderForecast';

function brand(breweryName: string | undefined | null): string {
  return (breweryName?.trim() || 'BrewLab').replace(/[\s/\\?*[\]:]/g, '_');
}

// ── Order Planner export (HTML 15592) ────────────────────────────────

export function exportOrderPlannerXlsx(args: {
  section: LibSection | 'all';
  plannerBrews: PlannerBrew[];
  libBySection: LibBySection;
  inventoryStock: Record<string, number>;
  ledgerData: LedgerData;
  getIngredients: (recipeId: string) => Ingredient[];
  breweryName: string | undefined | null;
}): void {
  const sections: LibSection[] = args.section === 'all'
    ? ['malts', 'hops', 'yeast', 'misc']
    : [args.section];

  const brews = args.plannerBrews
    .filter(b => b.recipeId)
    .slice()
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

  const sheets: SheetSpec[] = [];

  for (const sec of sections) {
    const ingType = sectionToIngType(sec);
    const unit = INV_UNITS[sec];
    const entries = args.libBySection[sec];

    const brewHeaders = brews.flatMap(b => [
      `${b.name} ${b.start.slice(5)}`, 'Balance',
    ]);
    const headers = ['Ingredient', `On Hand (${unit})`, ...brewHeaders, 'Total Needed', 'Status'];
    const rows: CellValue[][] = [];

    for (const entry of entries) {
      const ledgerKey = `${sec}_${entry.id}`;
      const stock = getLedgerBalance(args.inventoryStock, args.ledgerData, ledgerKey);
      const brewUsage = brews.map(brew => {
        if (!brew.recipeId) return { amt: 0, recorded: false };
        const ings = args.getIngredients(brew.recipeId);
        const matched = ings.filter(i =>
          i.type === ingType && ingNamesMatch(entry.name, i.name, i.libId, entry.id));
        const amt = Math.round(
          matched.reduce((s, i) => s + (parseFloat(String(i.amt ?? 0)) || 0), 0) * 1000,
        ) / 1000;
        const brewTag = brew.name.toLowerCase().split(' ').slice(0, 3).join(' ');
        const recorded = (args.ledgerData[ledgerKey] ?? []).some(e =>
          e.used != null && (e.beer ?? '').toLowerCase().includes(brewTag));
        return { amt, recorded };
      });
      const totalRecipe = brewUsage.reduce((s, u) => s + u.amt, 0);
      if (!totalRecipe) continue;
      const totalNeeded = brewUsage.reduce((s, u) => s + (u.recorded ? 0 : u.amt), 0);
      let running = stock;
      const bals = brewUsage.map(u => {
        running = Math.round((running - (u.recorded ? 0 : u.amt)) * 1000) / 1000;
        return running;
      });
      const finalBal = bals.length ? bals[bals.length - 1] : stock;
      const status =
        totalNeeded === 0 ? 'DONE' :
        finalBal < 0      ? 'SHORT' :
        finalBal < totalNeeded * 0.15 ? 'LOW' : 'OK';
      const usageCells: CellValue[] = brewUsage.flatMap((u, i) => [
        u.recorded ? '✓' : (u.amt || ''),
        bals[i] ?? '',
      ]);
      rows.push([
        entry.name || '',
        stock,
        ...usageCells,
        totalNeeded,
        status,
      ]);
    }

    if (rows.length > 0) {
      sheets.push({
        name: sec.toUpperCase(),
        headers,
        rows,
      });
    }
  }

  if (!sheets.length) {
    window.alert('No ingredients from your library are used in any planned brew.');
    return;
  }
  const filename = `${brand(args.breweryName)}_OrderPlanner_${dateToStr(todayDate())}.xlsx`;
  exportWorkbook(filename, sheets);
}

// ── Inventory "Current Page XLSX" — completes the Phase 1 deferral ───

export function exportInventoryCurrentXlsx(args: {
  section: InvSection;
  libBySection: LibBySection;
  inventoryStock: Record<string, number>;
  ledgerData: LedgerData;
  breweryName: string | undefined | null;
}): void {
  const sec = args.section;
  const unit = INV_UNITS[sec];
  const entries = args.libBySection[sec];
  if (!entries.length) {
    window.alert(`No ${sec} entries in the library — nothing to export.`);
    return;
  }

  // Match the on-screen table — visible columns in saved order.
  const defs = INV_COL_DEFS[sec];
  const colDefMap = Object.fromEntries(defs.map(c => [c.key, c]));
  const orderedKeys = getOrderedVisibleCols(sec);
  const vis = getInvColVisibility(sec);

  // Header: name first, then ordered keys (mapping virtual keys).
  const headers: string[] = ['Ingredient'];
  const colKeys: string[] = []; // mirrors headers, used for row generation
  for (const k of orderedKeys) {
    if (k === '_stock') {
      headers.push(`On Hand (${unit})`);
      colKeys.push('_stock');
    } else if (k === '_opening') {
      if (vis['_opening'] === false) continue;
      headers.push('Opening Bal.');
      colKeys.push('_opening');
    } else {
      const def = colDefMap[k];
      if (!def) continue;
      headers.push(def.label);
      colKeys.push(k);
    }
  }

  const rows: CellValue[][] = entries.map(e => {
    const stockKey = `${sec}_${e.id}`;
    const stock = getLedgerBalance(args.inventoryStock, args.ledgerData, stockKey);
    const opening = parseFloat(String(args.inventoryStock[stockKey] ?? 0)) || 0;
    const row: CellValue[] = [e.name || ''];
    for (const k of colKeys) {
      if (k === '_stock')   row.push(stock);
      else if (k === '_opening') row.push(opening || '');
      else {
        const v = (e as Record<string, unknown>)[k];
        if (typeof v === 'boolean') row.push(v ? 'Yes' : '');
        else row.push((v as CellValue) ?? '');
      }
    }
    return row;
  });

  const filename = `${brand(args.breweryName)}_Inventory_${sec}_${dateToStr(todayDate())}.xlsx`;
  exportWorkbook(filename, [{
    name: sec.toUpperCase(),
    headers,
    rows,
  }]);
}

// fmtKg is not currently used for column rendering — XLSX cells stay
// numeric so users can sort/sum in Excel. Re-export keeps the helper
// available for callers that want to format display labels.
export { fmtKg };
