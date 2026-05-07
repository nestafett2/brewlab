/**
 * Annual Planner — Tariff sub-tab 1.
 *
 * Port of brewlab-desktop.html:9093–9220 (renderTariffPlanner +
 * planner row CRUD: addTariffPlanRow, removeTariffPlanRow,
 * updateTariffPlanRow, updateTariffDefaultBatch).
 *
 * Structure:
 *   • Default Batch Size — pre-fills new planner rows.
 *   • Planned Brews table — Month / Recipe Template / Batch (L) /
 *     Classification / Remove. Inline edits persist immediately.
 *   • Malt Totals Summary — derived from planner + tax master.
 */

import { useStore } from '../../store';
import { calcMaltUsageFromMaster, calcPlannedMaltUsage } from '../../lib/tariff';
import type { TariffData, TariffPlanRow } from '../../types';

const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

interface Props {
  year: number;
  data: TariffData;
}

export default function AnnualPlannerTab({ year, data }: Props) {
  const setTariff = useStore(s => s.setTariff);
  const templates = useStore(s => s.templates);
  const taxMaster = useStore(s => s.taxMaster);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const maltLib = useStore(s => s.maltLib);

  const planner = data.planner ?? [];
  const defaultBatchL = data.defaultBatchL ?? '';

  // Calculations
  const planned = calcPlannedMaltUsage(planner, templates, maltLib);
  const fyStart = `${year}-04-01`;
  const fyEnd   = `${year + 1}-03-31`;
  const actual  = calcMaltUsageFromMaster(taxMaster, ingredientsByRecipe, maltLib, fyStart, fyEnd);
  const allMalts = [...new Set([...Object.keys(planned), ...Object.keys(actual)])].sort();
  const totalActual  = Object.values(actual).reduce((s, v) => s + v.total, 0);
  const totalPlanned = Object.values(planned).reduce((s, v) => s + v.total, 0);

  // ── Persistence helpers ──────────────────────────────────────────────

  const saveData = (next: TariffData) => setTariff(year, next);

  const updateDefaultBatch = (val: string) => {
    saveData({ ...data, defaultBatchL: val });
  };

  const addRow = () => {
    const next: TariffPlanRow = {
      month: 'Apr',
      templateId: '',
      batchL: defaultBatchL,
      classification: 'beer',
    };
    saveData({ ...data, planner: [...planner, next] });
  };

  const removeRow = (i: number) => {
    saveData({ ...data, planner: planner.filter((_, idx) => idx !== i) });
  };

  const updateRow = <K extends keyof TariffPlanRow>(i: number, key: K, val: TariffPlanRow[K]) => {
    const updated = planner.map((r, idx) => idx === i ? { ...r, [key]: val } : r);
    // Auto-fill batch size from template if not set (HTML 9209)
    if (key === 'templateId' && !updated[i].batchL) {
      const tpl = templates.find(t => t.id === val);
      if (tpl?.batchL) updated[i] = { ...updated[i], batchL: String(tpl.batchL) };
    }
    saveData({ ...data, planner: updated });
  };

  return (
    <div className="tariff-content-wrap">
      {/* Default batch size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>Default Batch Size</span>
        <input
          className="tariff-inp"
          type="number"
          style={{ width: 90, textAlign: 'left' }}
          value={defaultBatchL}
          placeholder="L"
          onChange={e => updateDefaultBatch(e.target.value)}
        />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          L — pre-fills new rows (editable per brew)
        </span>
      </div>

      {/* Planned brews */}
      <div className="tariff-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="tariff-section-title">Planned Brews — FY {year}–{year + 1}</div>
          <button className="btn sm" onClick={addRow}>＋ Add Brew</button>
        </div>
        <table className="tariff-table">
          <thead><tr>
            <th>Month</th><th>Recipe Template</th><th>Batch Size (L)</th>
            <th>Classification</th><th style={{ width: 30 }}></th>
          </tr></thead>
          <tbody>
            {planner.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                No brews planned yet — click ＋ Add Brew to start
              </td></tr>
            ) : planner.map((row, i) => (
              <tr key={i}>
                <td>
                  <select
                    className="tariff-inp"
                    style={{ width: 100 }}
                    value={row.month}
                    onChange={e => updateRow(i, 'month', e.target.value)}
                  >
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    className="tariff-inp"
                    style={{ width: 200 }}
                    value={row.templateId}
                    onChange={e => updateRow(i, 'templateId', e.target.value)}
                  >
                    <option value="">— select template —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    className="tariff-inp"
                    type="number"
                    value={row.batchL}
                    placeholder="L"
                    onChange={e => updateRow(i, 'batchL', e.target.value)}
                  />
                </td>
                <td>
                  <select
                    className="tariff-inp"
                    style={{ width: 110 }}
                    value={row.classification}
                    onChange={e => updateRow(i, 'classification', e.target.value as 'beer' | 'happoshu')}
                  >
                    <option value="beer">Beer</option>
                    <option value="happoshu">Happoshu</option>
                  </select>
                </td>
                <td>
                  <button
                    onClick={() => removeRow(i)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
                    title="Remove"
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Malt totals */}
      {allMalts.length > 0 && (
        <div className="tariff-section">
          <div className="tariff-section-title">Malt Totals Summary</div>
          <table className="tariff-table">
            <thead><tr>
              <th>Malt</th><th>Tariff</th>
              <th className="r">Actual Used (kg)</th>
              <th className="r">Planned (kg)</th>
              <th className="r">Total Est. (kg)</th>
            </tr></thead>
            <tbody>
              {allMalts.map(name => {
                const a = actual[name]?.total ?? 0;
                const p = planned[name]?.total ?? 0;
                const isTrq = !!(planned[name]?.tariff || actual[name]?.tariff);
                return (
                  <tr key={name}>
                    <td style={{ fontWeight: 600 }}>{name}</td>
                    <td>
                      <span className={`tariff-badge ${isTrq ? 'received' : 'pending'}`}>
                        {isTrq ? 'TRQ' : 'Standard'}
                      </span>
                    </td>
                    <td className="r">{a > 0 ? a.toFixed(1) : '—'}</td>
                    <td className="r">{p > 0 ? p.toFixed(1) : '—'}</td>
                    <td className="r" style={{ color: 'var(--amber)', fontWeight: 600 }}>{(a + p).toFixed(1)}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '2px solid var(--border2)' }}>
                <td colSpan={2} style={{ fontWeight: 700, color: 'var(--amber)' }}>TOTAL</td>
                <td className="r" style={{ fontWeight: 700 }}>{totalActual.toFixed(1)}</td>
                <td className="r" style={{ fontWeight: 700 }}>{totalPlanned.toFixed(1)}</td>
                <td className="r" style={{ fontWeight: 700, color: 'var(--amber)' }}>{(totalActual + totalPlanned).toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
            TRQ = Tariff Rate Quota malt (tag in malt library). Print this page to share with your supplier in January.
          </div>
        </div>
      )}
    </div>
  );
}
