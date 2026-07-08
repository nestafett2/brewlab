/**
 * Tax Master — port of HTML page-taxmaster (line 2321) +
 * renderTaxMaster (line ~10180), printTaxMasterTab (10150),
 * exportTaxMasterExcel (10723).
 *
 * Three sub-tabs (Brew & Fermentation / Conditioning / Total Tax Page),
 * shared YYYY-MM range + classification filters. Reads from store.taxMaster.
 *
 * READ-ONLY by user policy (port plan §13.4 — taxMaster rows are immutable
 * once filed). Deliberate divergence from HTML's deleteTaxMasterRecord
 * (line 10441) — no delete UI in the React port. If you need to fix a
 * filed row, edit it via the Tax tab + Record to Tax Master (which prompts
 * for overwrite confirmation).
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { printHtml, escapeHtml } from '../../lib/print';
import { exportWorkbook, slugForFilename, todayIsoDate, type CellValue } from '../../lib/excel';
import type { TaxMasterRow } from '../../types';

type SubTab = 'brew' | 'cond' | 'total';
type ClassFilter = 'all' | 'beer' | 'happoshu';

// ─── derived row shape — pre-computed once per master entry ───
interface DerivedRow {
  rec: TaxMasterRow;
  brewNum: string;
  beerName: string;
  recipeName: string;
  brewDate: string;
  brewYM: string;
  pkgDate: string;
  pkgMonth: string;
  pkgDay: string;
  monthLabel: string;
  isBeer: boolean;
  intoFV: number;
  intoBT: number;
  yeastHarvest: number;
  fvBtWaste: number;
  fvBtPct: string;
  sellCanL: number;
  canWasteManual: number;
  flowmeterWaste: number;
  totalCanWaste: number;
  sellKegL: number;
  kegWaste: number;
  utWaste: number;
  totalWastePkg: number;
  totalWaste: number;
  sellTotal: number;
  kegs15: number;
  kegs10: number;
  cans: number;
  canSizeMl: number;
  pctCanWaste: string;
  pctPkgWaste: string;
  pctTotal: string;
  transferInto: string;
  btMm: string;
}

function deriveRow(rec: TaxMasterRow): DerivedRow {
  const num = (k: keyof TaxMasterRow): number => {
    const v = rec[k];
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return isFinite(n) ? n : 0;
  };
  const str = (k: keyof TaxMasterRow): string => String(rec[k] ?? '');

  const pctOrZero = (k: keyof TaxMasterRow): string => {
    const v = rec[k];
    return v != null && v !== '' ? String(v) + '%' : '0%';
  };

  const pkgDate = str('snap-pkg-date');
  const pkgMonth = pkgDate ? pkgDate.slice(0, 7) : '';
  const pkgDay = pkgDate ? pkgDate.slice(5).replace(/^0/, '').replace(/-0/, '-') : '';
  const monthLabel = pkgMonth
    ? new Date(pkgMonth + '-02').toLocaleString('en', { month: 'long', year: 'numeric' })
    : '';
  const isBeer = !str('classification').toLowerCase().includes('happoshu');
  const brewDate = str('date');
  const brewYM = brewDate ? brewDate.slice(0, 7) : '';

  return {
    rec,
    brewNum: str('brew-num'),
    beerName: str('beer-name') || str('recipe-name'),
    recipeName: str('recipe-name'),
    brewDate,
    brewYM,
    pkgDate,
    pkgMonth,
    pkgDay,
    monthLabel,
    isBeer,
    intoFV:        num('in-fv'),
    intoBT:        num('snap-into-bt'),
    yeastHarvest:  num('snap-yeast-harvest'),
    fvBtWaste:     num('snap-fv-bt-waste'),
    fvBtPct:       pctOrZero('snap-fv-bt-pct'),
    sellCanL:      num('snap-sell-can-l'),
    canWasteManual: num('snap-can-waste-manual'),
    flowmeterWaste: num('snap-flowmeter-waste'),
    totalCanWaste: num('snap-total-can-waste'),
    sellKegL:      num('snap-sell-keg-l'),
    kegWaste:      num('snap-keg-waste'),
    utWaste:       num('snap-ut-waste'),
    totalWastePkg: num('snap-total-waste-pkg'),
    totalWaste:    num('snap-total-waste'),
    sellTotal:     num('snap-sell-total'),
    kegs15:        num('snap-kegs-15'),
    kegs10:        num('snap-kegs-10'),
    cans:          num('snap-cans'),
    canSizeMl:     num('snap-can-size-ml') || 350,
    pctCanWaste:   pctOrZero('snap-pct-can-waste'),
    pctPkgWaste:   pctOrZero('snap-pct-pkg-waste'),
    pctTotal:      pctOrZero('snap-pct-total'),
    transferInto:  str('snap-transfer-into'),
    btMm:          str('snap-bt-mm'),
  };
}

// ─── formatters ───
const f1 = (v: number): string => isFinite(v) && v !== 0 ? v.toFixed(1) : '0';
const f2 = (v: number): string => isFinite(v) && v !== 0 ? v.toFixed(2) : '0';
const f3 = (v: number): string => isFinite(v) && v !== 0 ? v.toFixed(3) : '0';
const orDash = (s: string): string => s && s.trim() !== '' ? s : '—';

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export default function TaxMasterPage() {
  const taxMaster = useStore(s => s.taxMaster);
  // Tax Master rows always render — the artifact is the filed declaration,
  // not the source recipe (NTA compliance). When the source recipe has been
  // deleted, suffix the Beer Name with "(recipe deleted)" so the brewer
  // sees the orphan state without losing the row.
  const recipes = useStore(s => s.recipes);
  const pushToast = useStore(s => s.pushToast);
  const recipeIdSet = useMemo(() => new Set(recipes.map(r => r.id)), [recipes]);

  const [activeSubTab, setActiveSubTab] = useState<SubTab>('brew');
  const [classFilter, setClassFilter]   = useState<ClassFilter>('all');
  const [dateFrom, setDateFrom]         = useState<string>('');  // YYYY-MM
  const [dateTo, setDateTo]             = useState<string>('');  // YYYY-MM

  const decorateBeerName = (rec: TaxMasterRow, beerName: string): string => {
    const id = rec.recipeId;
    if (!id) return beerName;
    return recipeIdSet.has(id) ? beerName : `${beerName} (recipe deleted)`;
  };

  const filteredRows = useMemo(() => {
    const all = taxMaster.map(rec => {
      const d = deriveRow(rec);
      return { ...d, beerName: decorateBeerName(rec, d.beerName) };
    });
    all.sort((a, b) => a.brewNum.localeCompare(b.brewNum, undefined, { numeric: true }));
    return all.filter(r => {
      const ym = activeSubTab === 'brew'
        ? (r.brewYM || r.pkgMonth)
        : (r.pkgMonth || r.brewYM);
      if (dateFrom && ym && ym < dateFrom) return false;
      if (dateTo && ym && ym > dateTo) return false;
      if (classFilter === 'beer' && !r.isBeer) return false;
      if (classFilter === 'happoshu' && r.isBeer) return false;
      return true;
    });
    // decorateBeerName closes over recipeIdSet — listed in deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxMaster, activeSubTab, dateFrom, dateTo, classFilter, recipeIdSet]);

  const handlePrint = () => {
    if (filteredRows.length === 0) {
      pushToast({ message: 'Nothing to print.', variant: 'info' });
      return;
    }
    // Strip the "(recipe deleted)" suffix from beerName before printing so
    // the paper artifact looks clean — same reason Excel uses raw deriveRow.
    const clean = filteredRows.map(r => ({
      ...r,
      beerName: r.beerName.replace(/\s+\(recipe deleted\)$/u, ''),
    }));
    if (activeSubTab === 'total') {
      printMonthlyReport(clean, dateFrom, dateTo);
    } else {
      printSubTab(activeSubTab, clean);
    }
  };

  const handleExcel = () => {
    if (taxMaster.length === 0) {
      pushToast({ message: 'Tax Master is empty.', variant: 'info' });
      return;
    }
    // Excel export ignores filters and writes ALL three sheets — matches HTML.
    // Excel/print intentionally exclude the "(recipe deleted)" suffix —
    // paper artifacts shouldn't carry transient UI state.
    const all = taxMaster.map(deriveRow);
    all.sort((a, b) => a.brewNum.localeCompare(b.brewNum, undefined, { numeric: true }));
    exportTaxMasterWorkbook(all);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid var(--border2)',
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)' }}>
          TAX MASTER
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          Filed declarations
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn" onClick={handlePrint}>🖨 Print Active Tab</button>
          <button className="btn" onClick={handleExcel}>⬇ Export XLSX (3 sheets)</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
        borderBottom: '1px solid var(--border2)', flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>FROM</span>
        <input type="month" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
               style={inputStyle} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>TO</span>
        <input type="month" value={dateTo} onChange={e => setDateTo(e.target.value)}
               style={inputStyle} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginLeft: 12 }}>
          CLASS
        </span>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value as ClassFilter)}
                style={inputStyle}>
          <option value="all">All</option>
          <option value="beer">Beer</option>
          <option value="happoshu">Happoshu</option>
        </select>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
          {filteredRows.length} of {taxMaster.length}
        </span>
      </div>

      {/* Sub-tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border2)', padding: '0 16px',
      }}>
        {([
          ['brew',  'Brew & Fermentation'],
          ['cond',  'Conditioning'],
          ['total', 'Total Tax Page'],
        ] as [SubTab, string][]).map(([id, label]) => (
          <button key={id}
                  onClick={() => setActiveSubTab(id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '10px 16px',
                    color: activeSubTab === id ? 'var(--amber)' : 'var(--text-muted)',
                    borderBottom: '2px solid ' + (activeSubTab === id ? 'var(--amber)' : 'transparent'),
                    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}>
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filteredRows.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: 'var(--text-muted)',
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
          }}>
            NO RECORDS — RECORD A RECIPE TO TAX MASTER FIRST
          </div>
        ) : (
          <>
            {activeSubTab === 'brew' && <BrewSubTab rows={filteredRows} />}
            {activeSubTab === 'cond' && <CondSubTab rows={filteredRows} />}
            {activeSubTab === 'total' && <TotalSubTab rows={filteredRows} />}
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--panel2)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  padding: '4px 8px',
  borderRadius: 5,
  fontFamily: 'var(--mono)',
  fontSize: 11,
  outline: 'none',
};

// ═══════════════════════════════════════════════════════════════════
// Sub-tab components
// ═══════════════════════════════════════════════════════════════════

const BREW_HEADERS = [
  'Date', 'Beer Name', 'Tax Batch #', 'Recipe',
  'Malt (kg)', 'Wheat (kg)', 'Oats (kg)', 'Other (kg)',
  'Hops (kg)', 'Yeast (kg)', 'Water (L)',
  'Spent Grain (kg)', 'Kettle Waste (L)',
  'Tank #', 'mm', 'In FV (L)', 'Start Brix', 'Finish Brix', 'ABV',
];

function brewRow(r: DerivedRow): CellValue[] {
  return [
    r.brewDate, r.beerName, r.brewNum, r.recipeName,
    f2(parseFloat(String(r.rec['malt'] ?? '')) || 0),
    f2(parseFloat(String(r.rec['wheat'] ?? '')) || 0),
    f2(parseFloat(String(r.rec['oats'] ?? '')) || 0),
    f2(parseFloat(String(r.rec['other'] ?? '')) || 0),
    f3(parseFloat(String(r.rec['hops'] ?? '')) || 0),
    f3(parseFloat(String(r.rec['yeast'] ?? '')) || 0),
    f1(parseFloat(String(r.rec['water'] ?? '')) || 0),
    f2(parseFloat(String(r.rec['spent-grain'] ?? '')) || 0),
    f1(parseFloat(String(r.rec['kettle-waste'] ?? '')) || 0),
    String(r.rec['tank'] ?? ''),
    String(r.rec['fv-mm'] ?? r.rec['mm'] ?? ''),
    f1(r.intoFV),
    String(r.rec['start-brix'] ?? ''),
    String(r.rec['finish-brix'] ?? ''),
    String(r.rec['abv'] ?? ''),
  ];
}

function BrewSubTab({ rows }: { rows: DerivedRow[] }) {
  return <DataTable headers={BREW_HEADERS} rows={rows.map(brewRow)} numericFromCol={4} />;
}

const COND_HEADERS = [
  'Date', 'Tax Batch #', 'Transfer Into', 'mm',
  'Amount (L)', 'Yeast Harv (L)', 'Waste (L)', 'Diff',
  'Pkg Date', 'Tax Batch #',
  '15L size', '15L qty', '10L size', '10L qty', 'Total Keg (L)',
  'Can Size (L)', 'Cans', 'Total Can (L)', 'Total Pkg (L)',
  'UT Waste (L)', 'Keg Waste (L)', 'Cans', 'Canning (L)', 'Total Pkg Waste (L)', 'Diff',
];

function condRow(r: DerivedRow): CellValue[] {
  return [
    orDash(r.pkgDate), r.brewNum, orDash(r.transferInto), orDash(r.btMm),
    f1(r.intoBT), f1(r.yeastHarvest), f1(r.fvBtWaste), '0',
    orDash(r.pkgDate), r.brewNum,
    '15', r.kegs15, '10', r.kegs10, f1(r.sellKegL),
    (r.canSizeMl / 1000).toFixed(3), r.cans, f3(r.sellCanL), f1(r.sellTotal),
    f1(r.utWaste), f1(r.kegWaste), r.cans, f3(r.totalCanWaste), f3(r.totalWastePkg), '0',
  ];
}

function CondSubTab({ rows }: { rows: DerivedRow[] }) {
  return <DataTable headers={COND_HEADERS} rows={rows.map(condRow)} numericFromCol={4} />;
}

const TOTAL_HEADERS = [
  'Tax Batch #', 'Into FV (L)', 'Into Bright (L)', 'FV→BT Waste (L)', 'FV→BT %',
  'Sell Cans (L)', 'Can Waste (L)', 'Flowmeter Waste (L)', 'Total Can Waste (L)',
  'Sell Kegs (L)', 'Pkg Day',
  'Total Waste Pkg (L)', '% Can Waste', '% Pkg Waste',
  'Total Waste (L)', '%',
  'Sell Cans (L)', 'Sell Kegs (L)', 'Sell Total (L)',
  'Beer Name', 'Pkg Date', '15L Kegs', '10L Kegs', 'Cans',
];

function totalRow(r: DerivedRow): CellValue[] {
  return [
    r.brewNum,
    f1(r.intoFV), f1(r.intoBT), f1(r.fvBtWaste), r.fvBtPct,
    f3(r.sellCanL), f1(r.canWasteManual), f1(r.flowmeterWaste), f3(r.totalCanWaste),
    f1(r.sellKegL), orDash(r.pkgDay),
    f3(r.totalWastePkg), r.pctCanWaste, r.pctPkgWaste,
    f1(r.totalWaste), r.pctTotal,
    f3(r.sellCanL), f1(r.sellKegL), f1(r.sellTotal),
    r.beerName, orDash(r.pkgDate),
    r.kegs15, r.kegs10, r.cans,
  ];
}

// Group derived rows by packaging month (YYYY-MM); rows with no pkgMonth
// go into noDate. Sorted chronologically. Shared by the on-screen Total
// sub-tab and the Monthly Packaging Report print path so both views agree
// on which rows belong to which month and in what order.
type MonthGroup = { label: string; rows: DerivedRow[] };
function groupRowsByMonth(rows: DerivedRow[]): {
  months: Array<[string, MonthGroup]>;
  noDate: DerivedRow[];
} {
  const map = new Map<string, MonthGroup>();
  const noDate: DerivedRow[] = [];
  for (const r of rows) {
    if (!r.pkgMonth) {
      noDate.push(r);
    } else {
      if (!map.has(r.pkgMonth)) map.set(r.pkgMonth, { label: r.monthLabel, rows: [] });
      map.get(r.pkgMonth)!.rows.push(r);
    }
  }
  const months = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return { months, noDate };
}

// Total tab — group by month, with summary card per month
function TotalSubTab({ rows }: { rows: DerivedRow[] }) {
  const byMonth = useMemo(() => groupRowsByMonth(rows), [rows]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {byMonth.months.map(([key, group]) => (
        <div key={key}>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2,
            color: 'var(--amber)', marginBottom: 10,
          }}>
            {group.label.toUpperCase()}
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, overflowX: 'auto' }}>
              <DataTable headers={TOTAL_HEADERS} rows={group.rows.map(totalRow)} numericFromCol={1} />
            </div>
            <MonthSummaryCard rows={group.rows} label={group.label.toUpperCase()} />
          </div>
        </div>
      ))}
      {byMonth.noDate.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2,
            color: 'var(--amber)', opacity: 0.5, marginBottom: 10,
          }}>
            NO PACKAGE DATE
          </div>
          <div style={{ overflowX: 'auto' }}>
            <DataTable headers={TOTAL_HEADERS} rows={byMonth.noDate.map(totalRow)} numericFromCol={1} />
          </div>
        </div>
      )}
    </div>
  );
}

function MonthSummaryCard({ rows, label }: { rows: DerivedRow[]; label: string }) {
  const sum = (sel: (r: DerivedRow) => number): number => rows.reduce((s, r) => s + sel(r), 0);
  const sl = (v: number, dp = 0): string => v > 0 ? (dp ? v.toFixed(dp) : Math.round(v).toString()) : '—';

  const sKL = sum(r => r.sellKegL);
  const sCL = sum(r => r.sellCanL);
  const sW  = sum(r => r.totalWastePkg);
  const sT  = sum(r => r.sellTotal);
  const sBeer = rows.filter(r => r.isBeer).reduce((s, r) => s + r.sellTotal, 0);
  const sHap  = rows.filter(r => !r.isBeer).reduce((s, r) => s + r.sellTotal, 0);
  const sK15 = sum(r => r.kegs15);
  const sK10 = sum(r => r.kegs10);
  const sCans = sum(r => r.cans);
  const sBeerK = rows.filter(r => r.isBeer).reduce((s, r) => s + r.kegs15 + r.kegs10, 0);
  const sHapK  = rows.filter(r => !r.isBeer).reduce((s, r) => s + r.kegs15 + r.kegs10, 0);
  const sBeerC = rows.filter(r => r.isBeer).reduce((s, r) => s + r.cans, 0);
  const sHapC  = rows.filter(r => !r.isBeer).reduce((s, r) => s + r.cans, 0);

  return (
    <div style={{
      flexShrink: 0, width: 210,
      background: 'var(--panel2)', border: '1px solid var(--border2)',
      borderRadius: 8, padding: '12px 14px',
      fontFamily: 'var(--mono)', fontSize: 10, alignSelf: 'flex-start',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
        color: 'var(--amber)', marginBottom: 10,
      }}>{label}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px', marginBottom: 6 }}>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center' }}>Kegs</div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center' }}>Cans</div>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{sl(sK15 + sK10)}</div>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{sl(sCans)}</div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginBottom: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center' }}>Liters kegs</div>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center' }}>Liters cans</div>
          <div style={{ textAlign: 'center', fontWeight: 600 }}>{sl(sKL, 1)}</div>
          <div style={{ textAlign: 'center', fontWeight: 600 }}>{sl(sCL, 3)}</div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 4 }}>Packaging waste</div>
        <div style={{ fontWeight: 600 }}>{sl(sW, 3)} L</div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>Total Liters</div>
        <div style={{ fontWeight: 700, color: 'var(--amber)', fontSize: 14 }}>{sl(sT, 2)} L</div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
        <div style={{
          fontSize: 8, color: 'var(--text-muted)', marginBottom: 4,
          textTransform: 'uppercase', letterSpacing: 1,
        }}>Beer / Happoshu</div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr 1fr',
          gap: '2px 8px', fontSize: 9,
        }}>
          <div></div>
          <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Beer</div>
          <div style={{ color: '#7ac', textAlign: 'center' }}>Happoshu</div>
          <div style={{ color: 'var(--text-muted)' }}>Kegs</div>
          <div style={{ textAlign: 'center', fontWeight: 600 }}>{sl(sBeerK)}</div>
          <div style={{ textAlign: 'center', fontWeight: 600, color: '#7ac' }}>{sl(sHapK)}</div>
          <div style={{ color: 'var(--text-muted)' }}>Cans</div>
          <div style={{ textAlign: 'center', fontWeight: 600 }}>{sl(sBeerC)}</div>
          <div style={{ textAlign: 'center', fontWeight: 600, color: '#7ac' }}>{sl(sHapC)}</div>
          <div style={{ color: 'var(--text-muted)' }}>Liters</div>
          <div style={{ textAlign: 'center', fontWeight: 600 }}>{sl(sBeer, 2)}</div>
          <div style={{ textAlign: 'center', fontWeight: 600, color: '#7ac' }}>{sl(sHap, 2)}</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Generic data table
// ═══════════════════════════════════════════════════════════════════

function DataTable({
  headers, rows, numericFromCol,
}: {
  headers: string[];
  rows: CellValue[][];
  numericFromCol: number;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontFamily: 'var(--mono)', fontSize: 10,
      }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                background: 'var(--panel2)', border: '1px solid var(--border2)',
                padding: '4px 6px', fontSize: 7, letterSpacing: 0.5, whiteSpace: 'nowrap',
                textAlign: i >= numericFromCol ? 'right' : 'left',
                color: 'var(--text-muted)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} style={{ background: rIdx % 2 ? 'var(--panel2)' : 'var(--bg)' }}>
              {row.map((cell, cIdx) => (
                <td key={cIdx} style={{
                  border: '1px solid var(--border)', padding: '3px 6px', fontSize: 10,
                  textAlign: cIdx >= numericFromCol ? 'right' : 'left',
                  whiteSpace: 'nowrap',
                }}>{cell === '' || cell == null ? '—' : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Print + Excel
// ═══════════════════════════════════════════════════════════════════

// Print path for the Brew & Fermentation and Conditioning sub-tabs. The
// Total sub-tab routes through printMonthlyReport instead — it needs the
// per-month block layout to match the HTML's standalone Monthly Packaging
// Report (brewlab-desktop.html:10696).
function printSubTab(tab: 'brew' | 'cond', rows: DerivedRow[]): void {
  const tabLabels = {
    brew: 'Brew & Fermentation',
    cond: 'Conditioning',
  } as const;
  const headers = tab === 'brew' ? BREW_HEADERS : COND_HEADERS;
  const buildRow = tab === 'brew' ? brewRow : condRow;

  const buildHeaderRow = (h: string[]): string =>
    '<tr>' + h.map(x => `<th>${escapeHtml(x)}</th>`).join('') + '</tr>';
  const buildBodyRow = (cells: CellValue[]): string =>
    '<tr>' + cells.map(c => `<td>${escapeHtml(c == null || c === '' ? '—' : c)}</td>`).join('') + '</tr>';

  const body = `
<h1>TAX MASTER — ${escapeHtml(tabLabels[tab].toUpperCase())}</h1>
<table>
  <thead>${buildHeaderRow(headers)}</thead>
  <tbody>${rows.map(r => buildBodyRow(buildRow(r))).join('')}</tbody>
</table>
`;
  printHtml(body, {
    title: 'Tax Master — ' + tabLabels[tab],
    pageSize: 'A3',
    landscape: true,
    extraStyles: `
      body { font-size: 8px; }
      h1 { font-size: 13px; }
      table { font-size: 7px; }
      th { background: #d4e8c2; }
    `,
  });
}

// Monthly Packaging Report — port of HTML printMonthlyReport
// (brewlab-desktop.html:10696) + renderMonthlyReport (10470). One block
// per packaging month with a per-brew table on the left and a
// Beer/Happoshu/Total summary sidebar on the right, ordered
// chronologically and separated by page-break-inside:avoid. Reads snap-*
// fields off DerivedRow only — never recomputes from live cold-side data
// (post-snapshot canonical-source rule, same as Tax Summary).
//
// Divergence from HTML: the HTML row column "Flowmeter (L)" displayed the
// raw flowmeter reading. The React snapshot only stores the computed
// waste delta (snap-flowmeter-waste = flowmeter − canTotalL); raw
// flowmeter isn't snapshotted. Column is relabeled "Flowmeter Waste (L)"
// rather than showing waste under a misleading "Flowmeter" label —
// matches the existing TOTAL_HEADERS naming for the on-screen Total tab.
function printMonthlyReport(rows: DerivedRow[], dateFrom: string, dateTo: string): void {
  const { months, noDate } = groupRowsByMonth(rows);
  const rangeLabel = (dateFrom || '') + (dateTo ? ' – ' + dateTo : '');
  const titleSuffix = rangeLabel ? ' — ' + rangeLabel : '';

  const fmtL = (v: number): string => (v && isFinite(v) ? v.toFixed(1) : '—');
  const fmtN = (v: number): string => (v && isFinite(v) ? String(Math.round(v)) : '—');
  const sl   = (v: number): string => (v > 0 ? v.toFixed(1) : '—');

  const th = (txt: string, right = false): string =>
    `<th class="${right ? 'r' : 'l'}">${escapeHtml(txt)}</th>`;
  const td = (val: string, opts: { right?: boolean; muted?: boolean; amber?: boolean } = {}): string => {
    const cls = [opts.right ? 'r' : 'l', opts.muted ? 'muted' : '', opts.amber ? 'amber' : '']
      .filter(Boolean).join(' ');
    return `<td class="${cls}">${escapeHtml(val || '—')}</td>`;
  };
  const typeCell = (isBeer: boolean): string =>
    `<td class="l ${isBeer ? 'muted' : 'happo'}">${isBeer ? 'Beer' : 'Happoshu'}</td>`;

  let body = `<h1>MONTHLY PACKAGING REPORT${escapeHtml(titleSuffix)}</h1>`;

  if (months.length === 0 && noDate.length === 0) {
    body += '<div class="empty">No packaged brews found in this date range.</div>';
  }

  for (const [, group] of months) {
    const mRows = group.rows;
    const mLabel = group.label.toUpperCase();

    const sumWhere = (sel: (r: DerivedRow) => number, predicate?: (r: DerivedRow) => boolean): number =>
      mRows.filter(r => !predicate || predicate(r)).reduce((s, r) => s + sel(r), 0);

    const sBeerKegs = sumWhere(r => r.sellKegL,  r => r.isBeer);
    const sHapKegs  = sumWhere(r => r.sellKegL,  r => !r.isBeer);
    const sBeerCans = sumWhere(r => r.sellCanL,  r => r.isBeer);
    const sHapCans  = sumWhere(r => r.sellCanL,  r => !r.isBeer);
    const sBeerTot  = sumWhere(r => r.sellTotal, r => r.isBeer);
    const sHapTot   = sumWhere(r => r.sellTotal, r => !r.isBeer);
    const sAllTot   = sumWhere(r => r.sellTotal);

    // Highlight Happoshu rows in mixed-class blocks only. If every row in
    // this block is Happoshu, highlighting everything tells the reader
    // nothing — suppress. Decision is per-block, NOT per-report.
    const highlightHappo = mRows.some(r => r.isBeer);
    const trOpen = (r: DerivedRow): string =>
      highlightHappo && !r.isBeer ? '<tr class="happo-row">' : '<tr>';

    const tableRows = mRows.map(r => `${trOpen(r)}
      ${td(r.beerName,             { amber: true })}
      ${td(r.brewNum)}
      ${td(r.pkgDate)}
      ${td(fmtL(r.intoFV),         { right: true })}
      ${td(fmtL(r.intoBT),         { right: true, muted: true })}
      ${td(fmtL(r.fvBtWaste),      { right: true, muted: true })}
      ${td(r.fvBtPct,              { right: true, muted: true })}
      ${td(fmtL(r.sellCanL),       { right: true })}
      ${td(fmtL(r.totalCanWaste),  { right: true, muted: true })}
      ${td(fmtL(r.flowmeterWaste), { right: true, muted: true })}
      ${td(fmtL(r.sellKegL),       { right: true })}
      ${td(fmtL(r.kegWaste),       { right: true, muted: true })}
      ${td(fmtL(r.sellTotal),      { right: true, amber: true })}
      ${td(fmtL(r.totalWaste),     { right: true, muted: true })}
      ${td(r.pctTotal,             { right: true, muted: true })}
      ${td(fmtN(r.kegs15),         { right: true })}
      ${td(fmtN(r.kegs10),         { right: true })}
      ${td(fmtN(r.cans),           { right: true })}
      ${typeCell(r.isBeer)}
    </tr>`).join('');

    body += `<div class="month-block">
      <div class="main-table">
        <div class="month-label">${escapeHtml(mLabel)}</div>
        <table>
          <thead><tr>
            ${th('Beer')}${th('Brew #')}${th('Pkg Date')}
            ${th('Into FV (L)', true)}${th('Into BT (L)', true)}
            ${th('FV→BT Waste', true)}${th('FV→BT %', true)}
            ${th('Sellable Cans (L)', true)}${th('Can Waste (L)', true)}${th('Flowmeter Waste (L)', true)}
            ${th('Sellable Kegs (L)', true)}${th('Keg Waste (L)', true)}
            ${th('Total Packaged (L)', true)}${th('Total Waste (L)', true)}${th('Waste %', true)}
            ${th('15L Kegs', true)}${th('10L Kegs', true)}${th('Cans', true)}
            ${th('Type')}
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="sidebar">
        <div class="sidebar-month">${escapeHtml(mLabel)}</div>
        <div class="sidebar-section">KEGS (L)</div>
        <div class="sidebar-row"><span class="muted">Beer</span><span>${sl(sBeerKegs)}</span></div>
        <div class="sidebar-row gap"><span class="muted">Happoshu</span><span>${sl(sHapKegs)}</span></div>
        <div class="sidebar-section">CANS (L)</div>
        <div class="sidebar-row"><span class="muted">Beer</span><span>${sl(sBeerCans)}</span></div>
        <div class="sidebar-row gap"><span class="muted">Happoshu</span><span>${sl(sHapCans)}</span></div>
        <div class="sidebar-total">
          <div class="sidebar-section">TOTAL PACKAGED (L)</div>
          <div class="sidebar-row"><span class="muted">Beer</span><span>${sl(sBeerTot)}</span></div>
          <div class="sidebar-row"><span class="muted">Happoshu</span><span>${sl(sHapTot)}</span></div>
          <div class="sidebar-grand"><span>Total</span><span>${sl(sAllTot)}</span></div>
        </div>
      </div>
    </div>`;
  }

  if (noDate.length > 0) {
    // Same per-block highlight rule as the month loop — auto-suppress when
    // the NO PACKAGE DATE section is itself all-Happoshu.
    const highlightHappo = noDate.some(r => r.isBeer);
    const trOpen = (r: DerivedRow): string =>
      highlightHappo && !r.isBeer ? '<tr class="happo-row">' : '<tr>';

    const unscheduledRows = noDate.map(r => `${trOpen(r)}
      ${td(r.beerName,        { amber: true })}
      ${td(r.brewNum)}
      ${td(fmtL(r.intoFV),    { right: true })}
      ${td(fmtL(r.sellTotal), { right: true })}
      ${typeCell(r.isBeer)}
    </tr>`).join('');
    body += `<div>
      <div class="unscheduled-label">NO PACKAGE DATE</div>
      <table>
        <thead><tr>
          ${th('Beer')}${th('Brew #')}
          ${th('Into FV (L)', true)}${th('Total Packaged (L)', true)}
          ${th('Type')}
        </tr></thead>
        <tbody>${unscheduledRows}</tbody>
      </table>
    </div>`;
  }

  printHtml(body, {
    title: 'Monthly Packaging Report' + titleSuffix,
    pageSize: 'A3',
    landscape: true,
    extraStyles: `
      body { font-family: 'IBM Plex Mono', 'SF Mono', Menlo, monospace; font-size: 9px; color: #000; }
      h1 { font-size: 13px; letter-spacing: 2px; margin-bottom: 12px; }
      table { font-size: 8px; margin-bottom: 8px; }
      th, td { border: none; padding: 4px 6px; white-space: nowrap; }
      th { background: transparent; border-bottom: 2px solid #333; font-size: 7px; letter-spacing: 0.5px; color: #000; font-weight: 600; }
      td { border-bottom: 1px solid #888; }
      th.r, td.r { text-align: right; }
      th.l, td.l { text-align: left; }
      td.muted { color: #000; }
      td.amber { color: #c07010; font-weight: 600; }
      td.happo { color: #4488aa; }
      /* Soft yellow row highlight for Happoshu rows in mixed-class blocks.
         print-color-adjust forces Chrome to honour background colours when
         the user saves as PDF without ticking "background graphics". */
      tr.happo-row td { background: #FFF8C4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .month-block { display: flex; gap: 16px; margin-bottom: 24px; page-break-inside: avoid; align-items: flex-start; }
      .main-table { flex: 1; overflow-x: auto; }
      .sidebar { flex-shrink: 0; width: 180px; background: #f5f5f5; border: 1px solid #888; padding: 12px 14px; font-size: 9px; }
      .month-label { font-size: 13px; letter-spacing: 2px; color: #c07010; margin-bottom: 8px; font-weight: 700; }
      .sidebar-month { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; color: #c07010; margin-bottom: 10px; }
      .sidebar-section { font-size: 8px; color: #000; letter-spacing: 1px; margin-bottom: 4px; }
      .sidebar-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
      .sidebar-row.gap { margin-bottom: 8px; }
      .sidebar-row .muted { color: #000; }
      .sidebar-total { border-top: 1px solid #888; padding-top: 8px; margin-top: 4px; }
      .sidebar-grand { display: flex; justify-content: space-between; font-weight: 700; color: #c07010; border-top: 1px solid #888; margin-top: 4px; padding-top: 4px; }
      .unscheduled-label { font-size: 11px; letter-spacing: 2px; color: #c07010; opacity: 0.5; margin-bottom: 8px; font-weight: 700; }
      .empty { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #000; text-align: center; padding: 40px; }
      @media print { .month-block { page-break-inside: avoid; } }
    `,
  });
}

function exportTaxMasterWorkbook(rows: DerivedRow[]): void {
  const filename = `TaxMaster_${todayIsoDate()}.xlsx`;

  // Total Tax Page sheet — flatten the per-month grouping into rows with
  // a TOTAL row per month at the end, mirroring the HTML's Excel output.
  const totalRows: CellValue[][] = [];
  const byMonth = new Map<string, DerivedRow[]>();
  const noDate: DerivedRow[] = [];
  for (const r of rows) {
    if (!r.pkgMonth) { noDate.push(r); continue; }
    if (!byMonth.has(r.pkgMonth)) byMonth.set(r.pkgMonth, []);
    byMonth.get(r.pkgMonth)!.push(r);
  }
  const sortedMonths = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, group] of sortedMonths) {
    for (const r of group) totalRows.push(totalRow(r));
    // Per-month TOTAL row (sums of the numeric columns we know are summable)
    const sum = (sel: (r: DerivedRow) => number): number => group.reduce((s, r) => s + sel(r), 0);
    totalRows.push([
      'TOTAL ' + (group[0]?.monthLabel ?? ''),
      f1(sum(r => r.intoFV)), f1(sum(r => r.intoBT)), f1(sum(r => r.fvBtWaste)), '',
      f3(sum(r => r.sellCanL)), f1(sum(r => r.canWasteManual)),
      f1(sum(r => r.flowmeterWaste)), f3(sum(r => r.totalCanWaste)),
      f1(sum(r => r.sellKegL)), '',
      f3(sum(r => r.totalWastePkg)), '', '',
      f1(sum(r => r.totalWaste)), '',
      f3(sum(r => r.sellCanL)), f1(sum(r => r.sellKegL)), f1(sum(r => r.sellTotal)),
      '', '',
      sum(r => r.kegs15), sum(r => r.kegs10), sum(r => r.cans),
    ]);
  }
  for (const r of noDate) totalRows.push(totalRow(r));

  exportWorkbook(filename, [
    { name: 'Brew & Fermentation', headers: BREW_HEADERS, rows: rows.map(brewRow) },
    { name: 'Conditioning',        headers: COND_HEADERS, rows: rows.map(condRow) },
    { name: 'Total Tax Page',      headers: TOTAL_HEADERS, rows: totalRows },
  ]);

  // Use slugForFilename so the import isn't dropped by tree-shaking when the
  // hash-stamped filename above is the only consumer; future variants may
  // include a brewery name that needs sanitising.
  void slugForFilename;
}
