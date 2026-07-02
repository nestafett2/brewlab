/**
 * Hop IBUs editor modal — matches brewlab-desktop.html lines 18196–18305.
 *
 * One row per non-dry-hop. IBU and grams are linked by `ibu = k * amtG`,
 * where `k` is the IBU contribution per gram for this hop with the current
 * IBU method (Tinseth/Rager/Daniels) plus whirlpool and mash adjustments.
 * Editing one column updates the other for that row only.
 *
 * If `k` is 0 (e.g. mash hop with -100% adjustment, AA missing) the IBU
 * input is disabled — caller can still edit grams.
 *
 * Apply writes new gram amounts back to each ingredient's `amt`, dividing
 * by 1000 when `unit === 'kg'`.
 */

import { useState, useMemo } from 'react';
import { calcHopIbuPerGram } from '../../lib/calculations';
import { fmtNum } from '../../lib/format';
import type { Ingredient, IbuMethod } from '../../types';

interface Props {
  hops: Ingredient[];           // non-dry-hop hops only — caller filters
  batchL: number;
  ogSg: number;
  method: IbuMethod;
  whirlpoolTemp: number;
  mashHopAdj: number;
  onApply: (updates: { id: string; amt: number }[]) => void;
  onClose: () => void;
}

interface Row {
  id: string;
  name: string;
  unit: string;
  use: string;
  time: number;
  extra: string;       // AA% string for the label
  k: number;           // IBU per gram — captured at modal open, fixed during edits
  canCalc: boolean;    // false when k = 0
  ibu: number;
  amtG: number;
  ibuStr: string;
  amtStr: string;
}

function ingToGrams(i: Ingredient): number {
  return (parseFloat(String(i.amt)) || 0) * (i.unit === 'kg' ? 1000 : 1);
}

function buildLabel(ing: Ingredient): string {
  const aa = parseFloat(ing.extra || '0') || 0;
  const time = ing.time != null ? ing.time : 0;
  return `${ing.name} [${fmtNum(aa, { dp: 1, suffix: '%' })}] — ${ing.use}${time ? ` ${time} min` : ''}`;
}

export default function HopIbuModal({
  hops, batchL, ogSg, method, whirlpoolTemp, mashHopAdj, onApply, onClose,
}: Props) {
  // Build rows once on open. `k` is captured here and stays fixed — only
  // ingredient amounts change in this modal.
  const initialRows: Row[] = useMemo(() => hops.map(ing => {
    const aaPct = parseFloat(ing.extra || '0') || 0;
    const aa = aaPct / 100;
    const amtG = ingToGrams(ing);
    const time = ing.time != null ? ing.time : 0;
    const use = (ing.use || '').toLowerCase();
    const k = calcHopIbuPerGram({ method, aa, use, time, batchL, ogSg, whirlpoolTemp, mashHopAdj });
    const canCalc = k > 0;
    const ibu = canCalc ? Math.round(k * amtG * 10) / 10 : 0;
    return {
      id: ing.id, name: ing.name, unit: ing.unit, use, time,
      extra: ing.extra || '0',
      k, canCalc,
      ibu, amtG,
      ibuStr: canCalc ? ibu.toFixed(1) : '',
      amtStr: amtG.toFixed(1),
    };
  // We capture once at mount; no need to recompute on prop changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const totalIbu = rows.reduce((s, r) => s + (r.canCalc ? r.ibu : 0), 0);

  // Editing IBU — back-calc grams using the captured k.
  const onIbuChange = (idx: number, val: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      if (!r.canCalc) return r;
      const ibu = parseFloat(val) || 0;
      const amtG = r.k > 0 ? ibu / r.k : 0;
      return { ...r, ibu, amtG, ibuStr: val, amtStr: amtG.toFixed(1) };
    }));
  };

  // Editing grams — forward-calc IBU rounded to 1dp.
  const onAmtChange = (idx: number, val: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const amtG = parseFloat(val) || 0;
      const ibuRaw = r.canCalc ? r.k * amtG : 0;
      const ibu = Math.round(ibuRaw * 10) / 10;
      return { ...r, amtG, ibu, amtStr: val, ibuStr: r.canCalc ? ibu.toFixed(1) : '' };
    }));
  };

  // Apply — convert grams back to ingredient unit.
  const handleApply = () => {
    const updates = rows.map(r => ({
      id: r.id,
      amt: r.unit === 'kg' ? r.amtG / 1000 : r.amtG,
    }));
    onApply(updates);
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ width: 580, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Hop IBU Breakdown</span>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, idx) => {
              const label = buildLabel({ ...hops[idx] } as Ingredient);
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 20px 90px 24px', gap: 6, alignItems: 'center' }}>
                  <span
                    style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={label}
                  >
                    {label}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={r.ibuStr}
                    disabled={!r.canCalc}
                    title={!r.canCalc ? 'Cannot calculate — check AA% / use' : undefined}
                    onChange={e => onIbuChange(idx, e.target.value)}
                    style={{
                      background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)',
                      fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 6px',
                      textAlign: 'right' as const, width: '100%', outline: 'none',
                      opacity: r.canCalc ? 1 : 0.4,
                    }}
                  />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' as const }}>IBU</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={r.amtStr}
                    onChange={e => onAmtChange(idx, e.target.value)}
                    style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 6px', textAlign: 'right' as const, width: '100%', outline: 'none' }}
                  />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>g</span>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>TOTAL</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>{fmtNum(totalIbu, { dp: 1, suffix: ' IBU' })}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
