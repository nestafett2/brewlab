/**
 * Tariff Reduction (関税割当) — top-level page.
 *
 * Port of brewlab-desktop.html:2383–2407 (markup) + 9035–9091 (page open
 * + tab switching). Header carries the FY selector + per-tab print +
 * per-tab XLSX buttons (XLSX is a React-side addition; HTML had only a
 * mis-named CSV export for 需給表).
 *
 * Sub-tabs:
 *   • Annual Planner — references templates by templateId (HTML 9093)
 *   • Reservations — supplier orders, nested malts (HTML 9221)
 *   • 需給表 — monthly ledger + report blocks (HTML 9411)
 *
 * State:
 *   • `tariffByYear[year]` lazy-loaded via getTariff(year). Persisted by
 *     setTariff(year, data). Synced via the settings table thanks to
 *     SETTINGS_KEY_PREFIXES = ['bl_tariff_'] (see lib/supabase.ts).
 */

import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { currentFiscalYear, fiscalYearLabel } from '../../lib/tariff';
import AnnualPlannerTab from './AnnualPlannerTab';
import ReservationsTab from './ReservationsTab';
import NeekyuuHyoTab from './NeekyuuHyoTab';
import { printPlanner, printNeekyuu } from './tariffPrint';
import { exportPlannerXlsx, exportReservationsXlsx, exportNeekyuuXlsx } from './tariffXlsx';

type SubTab = 'planner' | 'reservations' | 'neekyuu';

export default function TariffReductionPage() {
  const getTariff = useStore(s => s.getTariff);
  const tariffByYear = useStore(s => s.tariffByYear);
  const settings = useStore(s => s.settings);
  const taxMaster = useStore(s => s.taxMaster);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const maltLib = useStore(s => s.maltLib);
  const templates = useStore(s => s.templates);
  const pushToast = useStore(s => s.pushToast);

  const cur = currentFiscalYear();
  const [year, setYear] = useState<number>(cur);
  const [tab, setTab] = useState<SubTab>('planner');

  // Lazy-load on year change. Subscribe to tariffByYear[year] so renders
  // pick up writes from the sub-tabs.
  const data = useMemo(() => {
    const cached = tariffByYear[year];
    if (cached !== undefined) return cached;
    return getTariff(year);
  }, [year, tariffByYear, getTariff]);

  // FY range: cur−2 → cur+3 (matches HTML 9060)
  const yearOptions: number[] = [];
  for (let y = cur - 2; y <= cur + 3; y++) yearOptions.push(y);

  const handlePrint = () => {
    if (tab === 'planner') {
      printPlanner({ year, data, templates, taxMaster, ingredientsByRecipe, maltLib });
    } else if (tab === 'neekyuu') {
      printNeekyuu({
        year, data, taxMaster, ingredientsByRecipe, maltLib,
        reservations: data.reservations ?? [],
      });
    }
    // No print path for the Reservations sub-tab (HTML had none either).
  };

  const handleExportXlsx = () => {
    const breweryName = settings.breweryName || 'BrewLab';
    if (tab === 'planner') {
      exportPlannerXlsx({ year, breweryName, data, templates, taxMaster, ingredientsByRecipe, maltLib });
    } else if (tab === 'reservations') {
      exportReservationsXlsx({ year, breweryName, data, maltLib });
    } else {
      const blocks = data.neekyuu?.reportBlocks ?? [];
      if (blocks.length === 0) {
        pushToast({
          message: 'No report blocks to export. Click ↺ Reset to NTA Template first.',
          variant: 'info',
        });
        return;
      }
      exportNeekyuuXlsx({ year, breweryName, data, taxMaster, ingredientsByRecipe, maltLib });
    }
  };

  const printDisabled = tab === 'reservations';

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>関税割当 — TARIFF REDUCTION</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
            Fiscal Year
          </span>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value, 10))}
            style={fySelectStyle}
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{fiscalYearLabel(y)}</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className="btn"
            onClick={handlePrint}
            disabled={printDisabled}
            title={printDisabled ? 'No print view for Reservations' : 'Print this tab'}
          >🖨 {tab === 'neekyuu' ? 'Print 需給表' : 'Print Planner'}</button>
          <button className="btn" onClick={handleExportXlsx}>⬇ Export XLSX</button>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={subnavWrapStyle}>
        <div
          className={`tariff-subnav ${tab === 'planner' ? 'active' : ''}`}
          onClick={() => setTab('planner')}
        >Annual Planner</div>
        <div
          className={`tariff-subnav ${tab === 'reservations' ? 'active' : ''}`}
          onClick={() => setTab('reservations')}
        >Reservations</div>
        <div
          className={`tariff-subnav ${tab === 'neekyuu' ? 'active' : ''}`}
          onClick={() => setTab('neekyuu')}
        >需給表</div>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {tab === 'planner'      && <AnnualPlannerTab year={year} data={data} />}
        {tab === 'reservations' && <ReservationsTab  year={year} data={data} />}
        {tab === 'neekyuu'      && <NeekyuuHyoTab    year={year} data={data} />}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderBottom: '1px solid var(--border)',
  background: 'var(--panel)', flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)',
};

const fySelectStyle: React.CSSProperties = {
  background: 'var(--panel2)',
  border: '1px solid var(--border2)',
  color: 'var(--amber)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  padding: '3px 8px',
  outline: 'none',
  borderRadius: 4,
};

const subnavWrapStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '2px solid var(--border)',
  background: 'var(--panel2)',
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  flex: 1, overflow: 'auto',
};
