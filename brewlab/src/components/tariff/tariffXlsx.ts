/**
 * Tariff Reduction XLSX exports — per-tab, via lib/excel.ts.
 *
 * Not in HTML: HTML has only a CSV export for the 需給表 (CSV download
 * with a .csv extension despite the misleading function name `exportNeekyuuXlsx`,
 * brewlab-desktop.html:9649). React provides real .xlsx via SheetJS for
 * all three tabs to match the convention used in Tax Master + Inventory.
 *
 * Filename: `tariff-{tab}_{breweryName}_FY{year}.xlsx`. breweryName is
 * slugified via slugForFilename() so paths stay shell-safe.
 */

import { exportWorkbook, slugForFilename, type CellValue } from '../../lib/excel';
import {
  fiscalYearLabel, calcMaltUsageFromMaster, calcPlannedMaltUsage,
  buildMonthlyLedger, sumLedgerRange, ledgerOpeningAt, ledgerClosingAt,
} from '../../lib/tariff';
import type {
  TariffData, Template, MaltLib, TaxMasterRow, Ingredient,
} from '../../types';

const fname = (tab: 'planner' | 'reservations' | 'neekyuu', breweryName: string, year: number): string => {
  const slug = slugForFilename(breweryName || 'BrewLab') || 'BrewLab';
  return `tariff-${tab}_${slug}_FY${year}.xlsx`;
};

// ── Annual Planner ─────────────────────────────────────────────────────

export function exportPlannerXlsx(args: {
  year: number;
  breweryName: string;
  data: TariffData;
  templates: Template[];
  taxMaster: TaxMasterRow[];
  ingredientsByRecipe: Record<string, Ingredient[]>;
  maltLib: MaltLib[];
}): void {
  const { year, breweryName, data, templates, taxMaster, ingredientsByRecipe, maltLib } = args;

  const planner = data.planner ?? [];
  const planned = calcPlannedMaltUsage(planner, templates, maltLib);
  const fyStart = `${year}-04-01`;
  const fyEnd   = `${year + 1}-03-31`;
  const actual  = calcMaltUsageFromMaster(taxMaster, ingredientsByRecipe, maltLib, fyStart, fyEnd);
  const allMalts = [...new Set([...Object.keys(planned), ...Object.keys(actual)])].sort();

  const plannerRows: CellValue[][] = planner.map(row => {
    const tpl = templates.find(t => t.id === row.templateId);
    return [
      row.month,
      tpl?.name ?? '',
      parseFloat(row.batchL) || 0,
      row.classification === 'happoshu' ? 'Happoshu' : 'Beer',
    ];
  });

  const maltRows: CellValue[][] = allMalts.map(name => {
    const a = actual[name]?.total ?? 0;
    const p = planned[name]?.total ?? 0;
    const isTrq = !!(planned[name]?.tariff || actual[name]?.tariff);
    return [name, isTrq ? 'TRQ' : 'Standard', a, p, a + p];
  });

  exportWorkbook(fname('planner', breweryName, year), [
    {
      name: 'Planned Brews',
      headers: ['Month', 'Template', 'Batch (L)', 'Classification'],
      rows: plannerRows,
      colWidths: [8, 32, 10, 14],
    },
    {
      name: 'Malt Totals',
      headers: ['Malt', 'Tariff', 'Actual Used (kg)', 'Planned (kg)', 'Total Est. (kg)'],
      rows: maltRows,
      colWidths: [28, 10, 16, 14, 16],
    },
  ]);
  // FY label is encoded in the filename; saving here for posterity.
  void fiscalYearLabel;
}

// ── Reservations ───────────────────────────────────────────────────────

export function exportReservationsXlsx(args: {
  year: number;
  breweryName: string;
  data: TariffData;
  maltLib: MaltLib[];
}): void {
  const { year, breweryName, data, maltLib } = args;
  const reservations = data.reservations ?? [];

  // Flat one-row-per-malt sheet. Reservation header fields repeat across
  // a reservation's malt rows so the sheet sorts/filters cleanly.
  const flatRows: CellValue[][] = [];
  reservations.forEach((res, ri) => {
    const malts = res.malts ?? [];
    if (malts.length === 0) {
      // Reservation with no malts — emit one header row so the user sees it.
      flatRows.push([
        ri + 1, res.supplier, res.dateSent, res.dateReceived,
        res.status, res.notes, '', '', '', '',
      ]);
      return;
    }
    for (const m of malts) {
      const isTrq = !!(maltLib.find(e => e.name === m.malt)?.tariff);
      flatRows.push([
        ri + 1,
        res.supplier,
        res.dateSent,
        res.dateReceived,
        res.status,
        res.notes,
        m.malt,
        parseFloat(m.kgReserved) || 0,
        parseFloat(m.kgReceived ?? m.kgReserved) || 0,
        isTrq ? 'TRQ' : 'Standard',
      ]);
    }
  });

  // Aggregated total-reserved sheet.
  const byMalt: Record<string, { trq: number; std: number; received: number }> = {};
  for (const res of reservations) {
    for (const m of (res.malts ?? [])) {
      if (!m.malt) continue;
      const isTrq = !!(maltLib.find(e => e.name === m.malt)?.tariff);
      if (!byMalt[m.malt]) byMalt[m.malt] = { trq: 0, std: 0, received: 0 };
      const kgReserved = parseFloat(m.kgReserved) || 0;
      if (isTrq) byMalt[m.malt].trq += kgReserved;
      else       byMalt[m.malt].std += kgReserved;
      if (res.status === 'received') {
        byMalt[m.malt].received += parseFloat(m.kgReceived ?? m.kgReserved) || 0;
      }
    }
  }
  const totalRows: CellValue[][] = Object.keys(byMalt).sort().map(name => {
    const d = byMalt[name];
    return [name, d.trq, d.std, d.trq + d.std, d.received];
  });

  exportWorkbook(fname('reservations', breweryName, year), [
    {
      name: 'Reservations',
      headers: ['Reservation#', 'Supplier', 'Date Sent', 'Date Received', 'Status', 'Notes', 'Malt', 'Kg Reserved', 'Kg Received', 'TRQ'],
      rows: flatRows,
      colWidths: [12, 18, 12, 14, 10, 24, 24, 12, 12, 8],
    },
    {
      name: 'Total Reserved',
      headers: ['Malt', 'TRQ (kg)', 'Standard (kg)', 'Total Reserved (kg)', 'Received (kg)'],
      rows: totalRows,
      colWidths: [28, 12, 14, 18, 14],
    },
  ]);
}

// ── 需給表 ────────────────────────────────────────────────────────────

export function exportNeekyuuXlsx(args: {
  year: number;
  breweryName: string;
  data: TariffData;
  taxMaster: TaxMasterRow[];
  ingredientsByRecipe: Record<string, Ingredient[]>;
  maltLib: MaltLib[];
}): void {
  const { year, breweryName, data, taxMaster, ingredientsByRecipe, maltLib } = args;
  const reservations = data.reservations ?? [];

  const rows = buildMonthlyLedger(
    year, data.neekyuu, reservations, taxMaster, ingredientsByRecipe, maltLib,
  );

  const ledgerRows: CellValue[][] = rows.map(r => [
    r.label, r.purchTrq, r.purchStd, r.usageBeer, r.usageHap,
    r.closeStock, r.beerKL, r.hapKL,
  ]);

  const blocks = data.neekyuu?.reportBlocks ?? [];
  const blockRows: CellValue[][] = blocks.map(b => {
    if (b.type === 'malt') {
      const trq = sumLedgerRange(rows, b.from, b.to, 'purchTrq');
      const std = sumLedgerRange(rows, b.from, b.to, 'purchStd');
      const open  = ledgerOpeningAt(rows, b.from);
      const close = ledgerClosingAt(rows, b.to);
      return [b.label, 'Malt', b.from, b.to, trq, std, trq + std, '', '', open, close];
    } else {
      const beer = sumLedgerRange(rows, b.from, b.to, 'beerKL');
      const hap  = sumLedgerRange(rows, b.from, b.to, 'hapKL');
      return [b.label, 'Production', b.from, b.to, '', '', '', beer, hap, '', ''];
    }
  });

  exportWorkbook(fname('neekyuu', breweryName, year), [
    {
      name: 'Monthly Ledger',
      headers: ['Month', 'Purch TRQ', 'Purch Std', 'Used Beer', 'Used Hap', 'Balance', 'Beer Prod (kL)', 'Hap Prod (kL)'],
      rows: ledgerRows,
      colWidths: [12, 11, 11, 11, 11, 11, 14, 14],
    },
    {
      name: 'Report Blocks',
      headers: ['Block', 'Type', 'From', 'To', 'TRQ (kg)', 'Std (kg)', 'Total (kg)', 'Beer (kL)', 'Hap (kL)', 'Open Stock', 'Close Stock'],
      rows: blockRows,
      colWidths: [32, 12, 9, 9, 11, 11, 12, 11, 11, 12, 12],
    },
  ]);
}
