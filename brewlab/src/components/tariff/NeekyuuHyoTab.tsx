/**
 * 需給表 (Needyuu Hyo) — Tariff sub-tab 3.
 *
 * Port of brewlab-desktop.html:9411–9804 (renderNeekyuuHyo +
 * updateNeekyuuOpening, updateNeekyuuOverride, addNeekyuuBlock,
 * seedNeekyuuBlocks, updateNeekyuuBlock, removeNeekyuuBlock).
 *
 * Layout:
 *   • Opening Stock — single number; running balance starts here.
 *   • Monthly Malt Ledger — 12 rows, Apr → Mar. Past months auto-fill
 *     from reservations + tax master + current-FY scope. Future months
 *     are editable. Manual overrides display as amber (HTML 9530).
 *   • Report Generator — user-edited blocks (label / type / from / to)
 *     used by Print 需給表 and the per-tab XLSX export. Auto-seeds the
 *     standard NTA template if no blocks exist yet.
 */

import { useEffect } from 'react';
import { useStore } from '../../store';
import { buildMonthlyLedger, seedNeekyuuBlocks } from '../../lib/tariff';
import type {
  TariffData, NeekyuuData, NeekyuuBlock, MonthOverride,
} from '../../types';

interface Props {
  year: number;
  data: TariffData;
}

type OverrideField = keyof MonthOverride;

export default function NeekyuuHyoTab({ year, data }: Props) {
  const setTariff = useStore(s => s.setTariff);
  const taxMaster = useStore(s => s.taxMaster);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const maltLib = useStore(s => s.maltLib);

  const neekyuu: NeekyuuData = data.neekyuu ?? {};
  const reservations = data.reservations ?? [];
  const reportBlocks = neekyuu.reportBlocks ?? [];

  // Auto-seed if no blocks exist yet (HTML 9415–9418).
  useEffect(() => {
    if (reportBlocks.length === 0) {
      const seeded = seedNeekyuuBlocks(year);
      setTariff(year, {
        ...data,
        neekyuu: { ...neekyuu, reportBlocks: seeded },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const monthRows = buildMonthlyLedger(
    year, neekyuu, reservations, taxMaster, ingredientsByRecipe, maltLib,
  );
  const todayMs = new Date().toISOString().slice(0, 7);

  // ── Persistence helpers ──────────────────────────────────────────────

  const saveData = (next: TariffData) => setTariff(year, next);

  const updateOpening = (val: string) => {
    saveData({ ...data, neekyuu: { ...neekyuu, openingStock: val } });
  };

  const updateOverride = (ms: string, field: OverrideField, val: string) => {
    const overrides = { ...(neekyuu.overrides ?? {}) };
    overrides[ms] = { ...(overrides[ms] ?? {}), [field]: val };
    saveData({ ...data, neekyuu: { ...neekyuu, overrides } });
  };

  const addBlock = () => {
    const next: NeekyuuBlock = { label: '', type: 'malt', from: '', to: '' };
    saveData({ ...data, neekyuu: { ...neekyuu, reportBlocks: [...reportBlocks, next] } });
  };

  const updateBlock = <K extends keyof NeekyuuBlock>(
    bi: number, key: K, val: NeekyuuBlock[K],
  ) => {
    const next = reportBlocks.map((b, i) => i === bi ? { ...b, [key]: val } : b);
    saveData({ ...data, neekyuu: { ...neekyuu, reportBlocks: next } });
  };

  const removeBlock = (bi: number) => {
    const next = reportBlocks.filter((_, i) => i !== bi);
    saveData({ ...data, neekyuu: { ...neekyuu, reportBlocks: next } });
  };

  const resetTemplate = () => {
    saveData({ ...data, neekyuu: { ...neekyuu, reportBlocks: seedNeekyuuBlocks(year) } });
  };

  // ── Rendering helpers ────────────────────────────────────────────────

  const fmtCell = (
    v: number,
    field: OverrideField,
    ms: string,
    isEditable: boolean,
  ) => {
    const ov = neekyuu.overrides?.[ms]?.[field];
    if (isEditable) {
      const display = ov !== undefined && ov !== '' ? parseFloat(ov).toFixed(1) : '';
      return (
        <td className="r">
          <input
            className="tariff-inp"
            style={{ width: 60 }}
            type="number"
            step="0.1"
            value={display}
            placeholder="0"
            onChange={e => updateOverride(ms, field, e.target.value)}
          />
        </td>
      );
    }
    return (
      <td className="r" style={{ color: ov !== undefined && ov !== '' ? 'var(--amber)' : undefined }}>
        {v > 0 ? v.toFixed(1) : '—'}
      </td>
    );
  };

  return (
    <div className="tariff-content-wrap">
      {/* Opening stock */}
      <div className="tariff-section" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--amber)' }}>
          Opening Stock Apr 1 (kg)
        </span>
        <input
          className="tariff-inp"
          style={{ width: 90 }}
          type="number"
          step="0.1"
          value={neekyuu.openingStock ?? ''}
          placeholder="0"
          onChange={e => updateOpening(e.target.value)}
        />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
          Starting malt balance for FY {year}–{year + 1}
        </span>
      </div>

      {/* Monthly table */}
      <div className="tariff-section" style={{ overflowX: 'auto', marginBottom: 20 }}>
        <div className="tariff-section-title">Monthly Malt Ledger — FY {year}–{year + 1}</div>
        <table className="tariff-table">
          <thead><tr>
            <th>Month</th>
            <th className="r">Purch TRQ (kg)</th>
            <th className="r">Purch Std (kg)</th>
            <th className="r">Used Beer (kg)</th>
            <th className="r">Used Hap (kg)</th>
            <th className="r">Balance (kg)</th>
            <th className="r">Beer Prod (kL)</th>
            <th className="r">Hap Prod (kL)</th>
          </tr></thead>
          <tbody>
            {monthRows.map(r => {
              const isCurrent = r.ms === todayMs;
              const isEditable = !r.isPast;
              const balanceColor = r.closeStock < 0 ? '#ff453a' : r.closeStock < 200 ? 'var(--amber)' : 'var(--text)';
              return (
                <tr key={r.ms} style={{ background: isCurrent ? 'rgba(192,112,16,0.08)' : undefined }}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: isCurrent ? 700 : 400 }}>
                    {r.label}{isCurrent ? ' ◀' : ''}
                  </td>
                  {fmtCell(r.purchTrq,  'purchTrq',  r.ms, isEditable)}
                  {fmtCell(r.purchStd,  'purchStd',  r.ms, isEditable)}
                  {fmtCell(r.usageBeer, 'usageBeer', r.ms, isEditable)}
                  {fmtCell(r.usageHap,  'usageHap',  r.ms, isEditable)}
                  <td className="r" style={{ fontWeight: 600, color: balanceColor }}>{r.closeStock.toFixed(1)}</td>
                  {fmtCell(r.beerKL, 'beerKL', r.ms, isEditable)}
                  {fmtCell(r.hapKL,  'hapKL',  r.ms, isEditable)}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>
          Past months auto-filled from brew records. Future months editable. Amber = manually overridden.
        </div>
      </div>

      {/* Report generator */}
      <div className="tariff-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="tariff-section-title">需給表 Report Generator</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={resetTemplate}>↺ Reset to NTA Template</button>
            <button className="btn sm" onClick={addBlock}>＋ Add Block</button>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 12 }}>
          Blocks are pre-filled with the standard NTA 需給表 structure for FY {year}–{year + 1}.
          Adjust date ranges if needed, then use Print 需給表 (toolbar) or the Excel export above.
        </div>
        {reportBlocks.length === 0 ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
            No blocks yet — click ↺ Reset to NTA Template to load the standard structure, or ＋ Add Block to start manually.
          </div>
        ) : (
          <table className="tariff-table" style={{ marginBottom: 8 }}>
            <thead><tr>
              <th>Block Label</th><th>Type</th><th>From</th><th>To</th><th></th>
            </tr></thead>
            <tbody>
              {reportBlocks.map((b, bi) => (
                <tr key={bi}>
                  <td>
                    <input
                      className="tariff-inp"
                      style={{ width: 200 }}
                      value={b.label}
                      placeholder="e.g. 2025.april~2025.september"
                      onChange={e => updateBlock(bi, 'label', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="tariff-inp"
                      value={b.type}
                      onChange={e => updateBlock(bi, 'type', e.target.value as 'malt' | 'production')}
                    >
                      <option value="malt">Malt (TRQ/Std/Total)</option>
                      <option value="production">Production (Beer/Hap kL)</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="tariff-inp"
                      type="month"
                      value={b.from}
                      onChange={e => updateBlock(bi, 'from', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="tariff-inp"
                      type="month"
                      value={b.to}
                      onChange={e => updateBlock(bi, 'to', e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => removeBlock(bi)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
