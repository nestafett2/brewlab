/**
 * Grain Bill % editor modal — matches brewlab-desktop.html lines 18122–18191.
 *
 * Two editable columns per grain (% and kg). Editing one updates the other
 * for that row only — other rows stay put. Totals at the bottom recompute
 * after every keystroke. Apply writes the new kg back to each ingredient's
 * `amt`, converting to grams when `unit === 'g'`.
 */

import { useState } from 'react';
import type { Ingredient } from '../../types';

interface Props {
  grains: Ingredient[];
  onApply: (updates: { id: string; amt: number }[]) => void;
  onClose: () => void;
}

interface Row {
  id: string;
  name: string;
  unit: string;
  kg: number;
  pct: number;
  // String form of the input fields so partial entries (e.g. "0.") don't
  // get coerced to NaN mid-keystroke.
  kgStr: string;
  pctStr: string;
}

function ingToKg(i: Ingredient): number {
  return (parseFloat(String(i.amt)) || 0) * (i.unit === 'g' ? 0.001 : 1);
}

export default function GrainPctModal({ grains, onApply, onClose }: Props) {
  // Initialise rows from the current ingredients on first render.
  const [rows, setRows] = useState<Row[]>(() => {
    const totalKg = grains.reduce((s, g) => s + ingToKg(g), 0);
    return grains.map(g => {
      const kg = ingToKg(g);
      const pct = totalKg > 0 ? (kg / totalKg) * 100 : 0;
      return {
        id: g.id, name: g.name, unit: g.unit,
        kg, pct,
        kgStr: kg.toFixed(2),
        pctStr: pct.toFixed(2),
      };
    });
  });

  const totalKg = rows.reduce((s, r) => s + r.kg, 0);
  const totalPct = rows.reduce((s, r) => s + r.pct, 0);

  // Editing % — kg = totalKg * pct/100. Other rows untouched. (HTML lines 18156-18165.)
  const onPctChange = (idx: number, val: string) => {
    setRows(prev => {
      const snapshotTotal = prev.reduce((s, r) => s + r.kg, 0);
      const pct = parseFloat(val) || 0;
      return prev.map((r, i) => {
        if (i !== idx) return r;
        const kg = snapshotTotal > 0 ? (snapshotTotal * pct) / 100 : 0;
        return { ...r, pct, kg, pctStr: val, kgStr: kg.toFixed(2) };
      });
    });
  };

  // Editing kg — pct = kg / totalKg * 100 against the SNAPSHOT total. (HTML lines 18167-18175.)
  const onKgChange = (idx: number, val: string) => {
    setRows(prev => {
      const snapshotTotal = prev.reduce((s, r) => s + r.kg, 0);
      const kg = parseFloat(val) || 0;
      return prev.map((r, i) => {
        if (i !== idx) return r;
        const pct = snapshotTotal > 0 ? (kg / snapshotTotal) * 100 : 0;
        return { ...r, kg, pct, kgStr: val, pctStr: pct.toFixed(2) };
      });
    });
  };

  // Apply — convert kg back to ingredient unit (g multiplied by 1000).
  const handleApply = () => {
    const updates = rows.map(r => ({
      id: r.id,
      amt: r.unit === 'g' ? r.kg * 1000 : r.kg,
    }));
    onApply(updates);
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ width: 540, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Grain Bill %</span>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, idx) => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 20px 100px 30px', gap: 6, alignItems: 'center' }}>
                <span
                  style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={r.name}
                >
                  {r.name}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.pctStr}
                  onChange={e => onPctChange(idx, e.target.value)}
                  style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 6px', textAlign: 'right' as const, width: '100%', outline: 'none' }}
                />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' as const }}>%</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.kgStr}
                  onChange={e => onKgChange(idx, e.target.value)}
                  style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 6px', textAlign: 'right' as const, width: '100%', outline: 'none' }}
                />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>kg</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 20px 100px 30px', gap: 6, alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' as const, paddingRight: 8 }}>TOTAL</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--amber)', textAlign: 'right' as const }}>{totalPct.toFixed(2)}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' as const }}>%</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--amber)', textAlign: 'right' as const }}>{totalKg.toFixed(2)}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>kg</span>
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
