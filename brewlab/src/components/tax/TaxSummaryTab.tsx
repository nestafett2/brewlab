/**
 * Tax Summary tab — port of HTML page-taxsummary (line 1923) +
 * renderTaxSummaryPage (10923), printTaxSummary (11059), exportTaxSummaryExcel (11088).
 *
 * READ-ONLY view of the per-recipe tax record. Reads from snap-* fields
 * (single source of truth post-snapshot) — never recomputes from live cold
 * side data. The "warning banner" appears when no snap-* values exist
 * (i.e. user hasn't pressed Record to Tax Master yet).
 *
 * Excel export uses SheetJS (not the HTML's HTML-blob hack) per port plan §13.2.
 */

import { useStore } from '../../store';
import { displayLabel, taxIdentifier } from '../../lib/tax';
import { printHtml, escapeHtml } from '../../lib/print';
import { exportWorkbook, slugForFilename, todayIsoDate } from '../../lib/excel';
import type { TaxRecord, Recipe } from '../../types';

interface Props { recipeId: string }

// ─── number formatters (one place, used by render + print + excel) ───
const f1 = (v: unknown): string => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) && n !== 0 ? n.toFixed(1) : '—';
};
const f3 = (v: unknown): string => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) && n !== 0 ? n.toFixed(3) : '—';
};
const pctOrDash = (v: unknown): string => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) && n !== 0 ? n + '%' : '—';
};
const orDash = (v: unknown): string => {
  if (v == null || String(v).trim() === '') return '—';
  return String(v);
};

interface SummaryRows {
  brewFerm: (string | number)[];
  conditioning: (string | number)[];
  totalTax: (string | number)[];
  // shared
  hasSnap: boolean;
}

/** Pure builder — used by render + print + excel paths so they stay in sync. */
function buildSummary(rec: TaxRecord, recipe: Recipe): SummaryRows {
  const intoFV    = parseFloat(String(rec['in-fv'] ?? '')) || 0;
  const intoBT    = parseFloat(String(rec['snap-into-bt'] ?? '')) || 0;
  const yeastHarv = parseFloat(String(rec['snap-yeast-harvest'] ?? '')) || 0;
  const fvBtWaste = parseFloat(String(rec['snap-fv-bt-waste'] ?? '')) || 0;
  const sellCanL  = parseFloat(String(rec['snap-sell-can-l'] ?? '')) || 0;
  const canWasteM = parseFloat(String(rec['snap-can-waste-manual'] ?? '')) || 0;
  const fmWaste   = parseFloat(String(rec['snap-flowmeter-waste'] ?? '')) || 0;
  const totCanW   = parseFloat(String(rec['snap-total-can-waste'] ?? '')) || 0;
  const sellKegL  = parseFloat(String(rec['snap-sell-keg-l'] ?? '')) || 0;
  const kegWaste  = parseFloat(String(rec['snap-keg-waste'] ?? '')) || 0;
  const utWaste   = parseFloat(String(rec['snap-ut-waste'] ?? '')) || 0;
  const totWastePkg = parseFloat(String(rec['snap-total-waste-pkg'] ?? '')) || 0;
  const totWaste  = parseFloat(String(rec['snap-total-waste'] ?? '')) || 0;
  const sellTotal = parseFloat(String(rec['snap-sell-total'] ?? '')) || 0;
  const kegs15    = parseFloat(String(rec['snap-kegs-15'] ?? '')) || 0;
  const kegs10    = parseFloat(String(rec['snap-kegs-10'] ?? '')) || 0;
  const cans      = parseFloat(String(rec['snap-cans'] ?? '')) || 0;
  const canSizeMl = parseFloat(String(rec['snap-can-size-ml'] ?? '')) || 350;
  const pkgDate   = orDash(rec['snap-pkg-date']);
  const transferInto = orDash(rec['snap-transfer-into']);
  const btMm      = orDash(rec['snap-bt-mm']);
  const fvBtPct   = pctOrDash(rec['snap-fv-bt-pct']);
  const pctCanW   = pctOrDash(rec['snap-pct-can-waste']);
  const pctPkgW   = pctOrDash(rec['snap-pct-pkg-waste']);
  const pctTot    = pctOrDash(rec['snap-pct-total']);

  const hasSnap = (rec['snap-into-bt'] != null) || (rec['snap-sell-keg-l'] != null);

  const brewFerm: (string | number)[] = [
    orDash(rec['date']),
    orDash(rec['beer-name']) === '—' ? taxIdentifier(recipe) : orDash(rec['beer-name']),
    orDash(rec['brew-num']),
    orDash(rec['recipe-name']),
    f1(rec['malt']), f1(rec['wheat']), f1(rec['oats']), f1(rec['other']),
    f3(rec['hops']), f3(rec['yeast']), f1(rec['water']),
    f1(rec['spent-grain']), f1(rec['kettle-waste']),
    orDash(rec['tank']),
    orDash(rec['fv-mm']) !== '—' ? orDash(rec['fv-mm']) : orDash(rec['mm']),
    f1(intoFV),
    orDash(rec['start-brix']), orDash(rec['finish-brix']), orDash(rec['abv']),
  ];

  const conditioning: (string | number)[] = [
    pkgDate, orDash(rec['brew-num']), transferInto, btMm,
    f1(intoBT), f1(yeastHarv), f1(fvBtWaste), '0',
    pkgDate, orDash(rec['brew-num']),
    '15', kegs15, '10', kegs10, f1(sellKegL),
    parseFloat((canSizeMl / 1000).toFixed(3)), cans, f3(sellCanL), f1(sellTotal),
    f1(utWaste), f1(kegWaste), cans, f3(totCanW), f3(totWastePkg), '0',
  ];

  const totalTax: (string | number)[] = [
    orDash(rec['brew-num']),
    f1(intoFV), f1(intoBT), f1(fvBtWaste), fvBtPct,
    f3(sellCanL), f1(canWasteM) === '—' ? '0' : f1(canWasteM),
    f1(fmWaste), f3(totCanW),
    f1(sellKegL),
    pkgDate.length >= 5 ? pkgDate.slice(5) : '—',
    f3(totWastePkg), pctCanW, pctPkgW,
    f1(totWaste), pctTot,
    f3(sellCanL), f1(sellKegL), f1(sellTotal),
    orDash(rec['beer-name']), pkgDate, kegs15, kegs10, cans,
  ];

  return { brewFerm, conditioning, totalTax, hasSnap };
}

// ─── header definitions, shared between render + excel ───
const BREW_FERM_HEADERS = [
  'Date', 'Beer Name', 'Tax Batch #', 'Recipe',
  'Malt (kg)', 'Wheat (kg)', 'Oats (kg)', 'Other (kg)',
  'Hops (kg)', 'Yeast (kg)', 'Water (L)',
  'Spent Grain (kg)', 'Kettle Waste (L)',
  'Tank #', 'mm', 'In FV (L)',
  'Start Brix', 'Finish Brix', 'ABV',
];

const CONDITIONING_HEADERS = [
  'Date', 'Tax Batch #', 'Transfer Into', 'mm',
  'Amount (L)', 'Yeast Harv (L)', 'Waste (L)', 'Diff',
  'Pkg Date', 'Tax Batch #',
  '15L size', '15L qty', '10L size', '10L qty', 'Total Keg (L)',
  'Can Size (L)', 'Cans', 'Total Can (L)', 'Total Pkg (L)',
  'UT Waste (L)', 'Keg Waste (L)', 'Cans', 'Canning (L)', 'Total Pkg Waste (L)', 'Diff',
];

const TOTAL_TAX_HEADERS = [
  'Tax Batch #', 'Into Ferm (L)', 'Into Bright (L)', 'FV→BT Waste (L)', 'FV→BT %',
  'Sell Cans (L)', 'Can Waste (L)', 'Flowmeter Waste (L)', 'Total Can Waste (L)',
  'Sell Kegs (L)', 'Pkg Day',
  'Total Waste Pkg (L)', '% Can Waste', '% Pkg Waste',
  'Total Waste (L)', '%',
  'Sell Cans (L)', 'Sell Kegs (L)', 'Sell Total (L)',
  'Beer Name', 'Pkg Date', '15L Kegs', '10L Kegs', 'Cans',
];

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export default function TaxSummaryTab({ recipeId }: Props) {
  const recipe = useStore(s => s.recipes.find(r => r.id === recipeId));
  const taxRecord = useStore(s => s.taxRecordsByRecipe[recipeId]);
  const getTaxRecord = useStore(s => s.getTaxRecord);

  if (!recipe) return <div className="empty">Select a recipe.</div>;

  const rec = taxRecord ?? getTaxRecord(recipeId);
  const summary = buildSummary(rec, recipe);

  const handlePrint = () => printSummary(rec, recipe, summary);
  const handleExcel = () => exportSummary(rec, recipe, summary);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid var(--border2)',
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)' }}>
          TAX SUMMARY
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          Condensed view for tax office
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn" onClick={handlePrint}>🖨 Print / PDF</button>
          <button className="btn" onClick={handleExcel}>⬇ Export XLS</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, fontFamily: 'var(--mono)', fontSize: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)' }}>
            {displayLabel(recipe)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Tax Batch #{orDash(rec['brew-num'])} · {orDash(rec['date'])} · {orDash(rec['classification'])}
          </span>
          {!summary.hasSnap && (
            <span style={{
              fontSize: 9, color: 'var(--red)',
              background: 'rgba(200,50,50,0.15)', padding: '2px 8px', borderRadius: 4,
            }}>
              ⚠ Packaging not yet recorded — use "Record to Tax Master" on the Tax tab to sync numbers
            </span>
          )}
        </div>

        <SectionTitle>Brew &amp; Fermentation 醸造日・発酵</SectionTitle>
        <SummaryTable headers={BREW_FERM_HEADERS} row={summary.brewFerm} />

        <SectionTitle>Conditioning エージング</SectionTitle>
        <SummaryTable headers={CONDITIONING_HEADERS} row={summary.conditioning} />

        <SectionTitle>Total Tax Page</SectionTitle>
        <SummaryTable headers={TOTAL_TAX_HEADERS} row={summary.totalTax} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Layout primitives
// ═══════════════════════════════════════════════════════════════════

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1.5,
      textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 6, marginTop: 10,
    }}>
      {children}
    </div>
  );
}

function SummaryTable({ headers, row }: { headers: string[]; row: (string | number)[] }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 14 }}>
      <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 10 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                background: 'var(--panel2)', border: '1px solid var(--border2)',
                padding: '4px 6px', fontSize: 7, letterSpacing: 0.8, whiteSpace: 'nowrap',
                textAlign: 'center', color: 'var(--text-muted)', textTransform: 'uppercase',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: 'var(--panel2)' }}>
            {row.map((cell, i) => (
              <td key={i} style={{
                padding: '4px 6px', border: '1px solid var(--border)', fontSize: 10,
                textAlign: typeof cell === 'number' ? 'right' : 'left',
                whiteSpace: 'nowrap',
              }}>{cell === '' ? '—' : cell}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Print + Excel
// ═══════════════════════════════════════════════════════════════════

function printSummary(rec: TaxRecord, recipe: Recipe, s: SummaryRows): void {
  const beerLabel = displayLabel(recipe);
  const buildRow = (cells: (string | number)[]): string =>
    '<tr>' + cells.map(c => `<td>${escapeHtml(c === '' ? '—' : c)}</td>`).join('') + '</tr>';
  const buildHeaderRow = (headers: string[]): string =>
    '<tr>' + headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr>';

  const body = `
<h1>TAX SUMMARY — ${escapeHtml(beerLabel)}</h1>
<div style="font-size:10px;color:#000;margin-bottom:12px;">
  Tax Batch #${escapeHtml(rec['brew-num'] ?? '—')} &nbsp;|&nbsp; ${escapeHtml(rec['date'] ?? '—')} &nbsp;|&nbsp; ${escapeHtml(rec['classification'] ?? 'Beer')}
</div>

<h2>Brew &amp; Fermentation</h2>
<table>
  <thead>${buildHeaderRow(BREW_FERM_HEADERS)}</thead>
  <tbody>${buildRow(s.brewFerm)}</tbody>
</table>

<h2>Conditioning</h2>
<table>
  <thead>${buildHeaderRow(CONDITIONING_HEADERS)}</thead>
  <tbody>${buildRow(s.conditioning)}</tbody>
</table>

<h2>Total Tax Page</h2>
<table>
  <thead>${buildHeaderRow(TOTAL_TAX_HEADERS)}</thead>
  <tbody>${buildRow(s.totalTax)}</tbody>
</table>
`;
  printHtml(body, {
    title: 'Tax Summary — ' + beerLabel,
    pageSize: 'A3',
    landscape: true,
    extraStyles: `
      body { font-size: 9px; }
      h1 { font-size: 14px; }
      h2 { font-size: 10px; margin-top: 10px; }
      table { font-size: 8px; }
      th { background: #d4e8c2; font-size: 7px; }
    `,
  });
}

function exportSummary(rec: TaxRecord, recipe: Recipe, s: SummaryRows): void {
  const beerLabel = slugForFilename(displayLabel(recipe) || 'brewlab');
  exportWorkbook(`tax_summary_${beerLabel}_${todayIsoDate()}.xlsx`, [
    { name: 'Brew & Fermentation', headers: BREW_FERM_HEADERS, rows: [s.brewFerm] },
    { name: 'Conditioning',        headers: CONDITIONING_HEADERS, rows: [s.conditioning] },
    { name: 'Total Tax Page',      headers: TOTAL_TAX_HEADERS, rows: [s.totalTax] },
  ]);
  // Reference rec to satisfy strict no-unused-vars in some lint configs;
  // exporters that print a footer can use rec['snap-pkg-date'] etc.
  void rec;
}
