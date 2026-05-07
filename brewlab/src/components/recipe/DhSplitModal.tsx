/**
 * Dry-Hop Split modal — port of HTML #dhSplitModal (lines 1386–1406) +
 * supporting JS (openDhSplitModal 19620 / updateDhSplitTotal 19641 /
 * saveDhSplit 19654 / clearDhSplit 19670).
 *
 * Recipe-time UI for designing a dry-hop addition's split across the three
 * Ferm-tab DH slots (DH1/DH2/DH3). Stored on the hop ingredient as
 * `ing.dhSplit` (per-slot grams, sparse keys). The Ferm-tab DryHopModal
 * already consumes this shape — see `ingDhSplit` in DryHopModal.tsx.
 *
 * Validation matches HTML:
 *   - sum > total → alert + refuse save
 *   - sum < total → "X g unassigned" hint (muted)
 *   - sum === total → green tick
 *   - sum === 0    → equivalent to "no split" (saved as undefined)
 *
 * Storage is grams regardless of the hop's recipe unit (kg vs g), matching
 * HTML line 19663. The header reads "X g total" by converting the hop's
 * stored amount to grams once on open.
 */

import { useState, useEffect, useMemo } from 'react';
import type { Ingredient, DhSplit } from '../../types';

interface Props {
  ing: Ingredient;
  /** Receives the new split (sparse), or `undefined` to clear. Caller persists. */
  onSave: (split: DhSplit | undefined) => void;
  onClose: () => void;
}

const SLOTS: (1 | 2 | 3)[] = [1, 2, 3];

export default function DhSplitModal({ ing, onSave, onClose }: Props) {
  // Hop weight in grams — matches HTML line 19625.
  const totalG = useMemo(() => {
    const a = parseFloat(String(ing.amt)) || 0;
    return ing.unit === 'kg' ? a * 1000 : a;
  }, [ing.amt, ing.unit]);

  // Per-slot string state so users can clear a field while typing.
  const [vals, setVals] = useState<Record<1 | 2 | 3, string>>(() => {
    const init = ing.dhSplit ?? {};
    return {
      1: init[1] ? String(init[1]) : '',
      2: init[2] ? String(init[2]) : '',
      3: init[3] ? String(init[3]) : '',
    };
  });

  // Escape closes — matches the modal-pattern used elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const numVals = useMemo(() => ({
    1: parseFloat(vals[1]) || 0,
    2: parseFloat(vals[2]) || 0,
    3: parseFloat(vals[3]) || 0,
  }), [vals]);
  const sum = numVals[1] + numVals[2] + numVals[3];

  // Total / over / under hint — matches HTML updateDhSplitTotal line 19647–19650.
  const totalDisplay = useMemo(() => {
    if (totalG <= 0) return { text: `Total: ${sum.toFixed(0)} g`, color: 'var(--text-muted)' };
    const diff = totalG - sum;
    if (diff === 0) return { text: `Total: ${sum.toFixed(0)} g`, color: 'var(--green)' };
    if (diff > 0)  return { text: `Total: ${sum.toFixed(0)} g (${diff.toFixed(0)} g unassigned)`, color: 'var(--text-muted)' };
    return { text: `Total: ${sum.toFixed(0)} g (${Math.abs(diff).toFixed(0)} g over!)`, color: 'var(--red)' };
  }, [sum, totalG]);

  const handleSave = () => {
    // HTML guard at line 19659 — refuse if sum overflows total.
    if (totalG > 0 && sum > totalG + 0.01) {
      window.alert(`Total split (${sum.toFixed(0)} g) exceeds recipe amount (${totalG.toFixed(0)} g).`);
      return;
    }
    // Sparse output — only include slots with > 0 grams. If everything is
    // empty/zero, treat as cleared (undefined) so consumers don't see a
    // truthy-but-empty {} that they have to defensively re-check.
    const out: DhSplit = {};
    for (const n of SLOTS) {
      const v = numVals[n];
      if (v > 0) out[n] = v;
    }
    onSave(Object.keys(out).length > 0 ? out : undefined);
    onClose();
  };

  const handleClear = () => {
    onSave(undefined);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--panel)', border: '1px solid var(--border2)',
          width: 340, fontFamily: 'var(--mono)', borderRadius: 4,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '10px 14px', background: 'var(--panel2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 9, letterSpacing: 2, color: 'var(--amber)' }}>SPLIT DRY HOP</span>
          <button
            className="btn sm"
            onClick={onClose}
            style={{ fontSize: 12, padding: '0 6px' }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{
            fontSize: 12, color: 'var(--text)', marginBottom: 12, fontWeight: 600,
          }}>
            {ing.name} — {totalG.toFixed(0)} g total
          </div>
          <div style={{
            fontSize: 9, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: 0.5,
          }}>
            Enter grams for each dry hop addition. Total shown below — leave blank or 0 to exclude from that addition.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SLOTS.map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{
                  fontSize: 10, color: 'var(--amber)', letterSpacing: 1, width: 52,
                }}>DH {n}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={vals[n]}
                  placeholder="0"
                  onChange={e => setVals(prev => ({ ...prev, [n]: e.target.value }))}
                  style={{
                    width: 80, background: 'var(--panel2)',
                    border: '1px solid var(--border2)', color: 'var(--text)',
                    fontFamily: 'var(--mono)', fontSize: 12,
                    padding: '4px 7px', outline: 'none', textAlign: 'right',
                    borderRadius: 4,
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>g</span>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 10, fontSize: 10, color: totalDisplay.color, textAlign: 'right',
          }}>
            {totalDisplay.text}
          </div>
        </div>

        {/* Footer — order matches HTML modal (Clear left, Cancel + Save right) */}
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button
            className="btn sm danger"
            onClick={handleClear}
            style={{ marginRight: 'auto' }}
          >✕ Clear split</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Save Split</button>
        </div>
      </div>
    </div>
  );
}
