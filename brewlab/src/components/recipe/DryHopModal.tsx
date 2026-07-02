/**
 * Dry Hop Modal — port of HTML #dryHopModal (lines 1335–1383) and
 * supporting JS (openDryHopModal 19275 / closeDryHopModal 19445 /
 * saveDryHopOnly 19547 / deleteDryHop 19568 / confirmDryHop 19474).
 *
 * Three sections:
 *   - Recipe hops: list of recipe ingredients with use==='dry hop',
 *     filtered/divided by hop.dhSplit if set. User enters actual grams.
 *   - Additional hops: ad-hoc rows (name + grams).
 *   - Adjuncts: ad-hoc rows (name + amount + unit).
 *
 * Footer: Save / Delete (and Record-to-Inventory + Restock disabled with
 * tooltip — inventory ledger isn't ported yet).
 */

import { useState, useEffect, useMemo } from 'react';
import type {
  Ingredient, FermMeta, DryHopExtraHop, DryHopAdjunct, DhSplit,
} from '../../types';
import { today } from '../../lib/utils';

interface Props {
  slot: 1 | 2 | 3;
  ingredients: Ingredient[];
  meta: FermMeta;
  onSave: (patch: Partial<FermMeta>) => void;
  onDelete: () => void;
  onClose: () => void;
}

type SlotKey = 'dh1' | 'dh2' | 'dh3';

function ingDhSplit(ing: Ingredient): DhSplit | null {
  const split = ing.dhSplit;
  return split && (split[1] || split[2] || split[3]) ? split : null;
}

export default function DryHopModal({ slot, ingredients, meta, onSave, onDelete, onClose }: Props) {
  const k: SlotKey = `dh${slot}` as SlotKey;
  const dateK    = `${k}-date`        as `dh1-date`        | `dh2-date`        | `dh3-date`;
  const tempK    = `${k}-temp`        as `dh1-temp`        | `dh2-temp`        | `dh3-temp`;
  const notesK   = `${k}-notes`       as `dh1-notes`       | `dh2-notes`       | `dh3-notes`;
  const recK     = `${k}-recorded`    as `dh1-recorded`    | `dh2-recorded`    | `dh3-recorded`;
  const amountsK = `${k}-amounts`     as `dh1-amounts`     | `dh2-amounts`     | `dh3-amounts`;
  const extraK   = `${k}-extra-hops`  as `dh1-extra-hops`  | `dh2-extra-hops`  | `dh3-extra-hops`;
  const adjK     = `${k}-adjuncts`    as `dh1-adjuncts`    | `dh2-adjuncts`    | `dh3-adjuncts`;

  // ── Local form state ────────────────────────────────────────────────────
  const [date, setDate]   = useState(meta[dateK] || today());
  const [temp, setTemp]   = useState(meta[tempK] || '');
  const [notes, setNotes] = useState(meta[notesK] || '');

  // Recipe hops the modal is interested in (use==='dry hop'), with optional
  // split filtering. If a hop has dhSplit set, only show it for slots whose
  // split value is > 0; planned grams = the slot's split. If no split,
  // show all 3 DHs the full hop weight.
  const recipeHops = useMemo(() => {
    return ingredients
      .filter(i => i.type === 'hop' && (i.use || '').toLowerCase() === 'dry hop')
      .map(hop => {
        const totalG = hop.unit === 'kg' ? (hop.amt || 0) * 1000 : (hop.amt || 0);
        const split = ingDhSplit(hop);
        const splitG = split ? (split[slot] ?? 0) : null;
        const plannedG = split ? splitG ?? 0 : totalG;
        return { hop, totalG, split, splitG, plannedG };
      })
      .filter(r => !r.split || (r.splitG ?? 0) > 0);
  }, [ingredients, slot]);

  const savedAmounts = meta[amountsK] || {};
  const [hopAmounts, setHopAmounts] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const r of recipeHops) {
      out[r.hop.id] = savedAmounts[r.hop.id] ?? r.plannedG.toFixed(0);
    }
    return out;
  });

  const [extraHops, setExtraHops] = useState<DryHopExtraHop[]>(meta[extraK] || []);
  const [adjuncts, setAdjuncts]   = useState<DryHopAdjunct[]>(meta[adjK] || []);

  const recordedDate = meta[recK];
  const alreadyRecorded = !!recordedDate;

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Save logic ──────────────────────────────────────────────────────────
  const buildPatch = (): Partial<FermMeta> => {
    const filteredExtras = extraHops.filter(h => h.name.trim());
    const filteredAdj   = adjuncts.filter(a => a.name.trim());
    const patch = {
      [dateK]:    date.trim(),
      [tempK]:    temp.trim(),
      [notesK]:   notes.trim(),
      [amountsK]: { ...hopAmounts },
      [extraK]:   filteredExtras,
      [adjK]:     filteredAdj,
    } as Partial<FermMeta>;
    return patch;
  };

  const handleSave = () => {
    onSave(buildPatch());
    onClose();
  };

  const handleDelete = () => {
    // Confirm dropped — the parent's handleDhDelete pushes a toast with
    // undo that restores the full pre-delete dh* meta. Inventory rows
    // already recorded under this dry-hop slot must be reversed via
    // ↩ Restock; the toast can't reach those.
    onDelete();
    onClose();
  };

  // ── Add/remove ad-hoc rows ──────────────────────────────────────────────
  const addExtra = () => setExtraHops([...extraHops, { name: '', amt: '' }]);
  const removeExtra = (idx: number) => setExtraHops(extraHops.filter((_, i) => i !== idx));
  const updExtra = (idx: number, patch: Partial<DryHopExtraHop>) =>
    setExtraHops(extraHops.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const addAdj = () => setAdjuncts([...adjuncts, { name: '', amt: '', unit: 'g' }]);
  const removeAdj = (idx: number) => setAdjuncts(adjuncts.filter((_, i) => i !== idx));
  const updAdj = (idx: number, patch: Partial<DryHopAdjunct>) =>
    setAdjuncts(adjuncts.map((r, i) => i === idx ? { ...r, ...patch } : r));

  // ── Render ──────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)',
    fontFamily: 'var(--mono)', fontSize: 12, padding: '3px 6px', outline: 'none',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--panel)', border: '1px solid var(--border2)', width: 480, maxHeight: '86vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--mono)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', background: 'var(--panel2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--amber)' }}>
            DRY HOP {slot}
          </span>
          <button className="btn sm" onClick={onClose} style={{ fontSize: 14, padding: '0 6px' }}>x</button>
        </div>

        {/* Date / Temp / Notes */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>DATE</label>
            <input type="text" placeholder="YYYY-MM-DD" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, width: 130 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>TEMP (C)</label>
            <input type="text" placeholder="--" value={temp} onChange={e => setTemp(e.target.value)} style={{ ...inputStyle, width: 70 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>NOTES</label>
            <input type="text" placeholder="--" value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Recipe hops */}
          <div style={{ padding: '8px 16px 4px', fontSize: 10, letterSpacing: 1, color: 'var(--text-muted)' }}>
            DRY HOP ADDITIONS FROM RECIPE
          </div>
          <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recipeHops.length === 0 ? (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
                No dry hop additions in this recipe.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 2, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>HOP</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>RECIPE (g)</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>ACTUAL (g)</span>
                </div>
                {recipeHops.map(({ hop, totalG, split, plannedG }) => {
                  const aaStr = hop.extra ? ` (${parseFloat(hop.extra).toFixed(1)}% AA)` : '';
                  return (
                    <div key={hop.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 2, alignItems: 'center', padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>
                        {hop.name}{aaStr}
                        {split && (
                          <span style={{ fontSize: 10, color: 'var(--amber)', marginLeft: 4 }}>
                            (split of {totalG.toFixed(0)}g total)
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                        {plannedG.toFixed(0)}
                      </span>
                      <input
                        type="number" min="0" step="1"
                        value={hopAmounts[hop.id] ?? ''}
                        onChange={e => setHopAmounts({ ...hopAmounts, [hop.id]: e.target.value })}
                        readOnly={alreadyRecorded}
                        style={{ ...inputStyle, textAlign: 'right' as const, width: '100%', opacity: alreadyRecorded ? 0.6 : 1 }}
                      />
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Extra hops */}
          <div style={{ padding: '6px 16px 4px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-muted)' }}>ADDITIONAL HOPS</span>
            <button className="btn sm" onClick={addExtra} style={{ fontSize: 11, padding: '2px 8px' }}>+ Add Hop</button>
          </div>
          <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {extraHops.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>None</div>
            ) : (
              extraHops.map((row, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 24px', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--border)' }}>
                  <input type="text" placeholder="Hop name…" value={row.name} onChange={e => updExtra(idx, { name: e.target.value })} style={{ ...inputStyle, width: '100%' }} />
                  <input type="number" placeholder="g" min="0" step="1" value={row.amt} onChange={e => updExtra(idx, { amt: e.target.value })} style={{ ...inputStyle, textAlign: 'right' as const, width: '100%' }} />
                  <button onClick={() => removeExtra(idx)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))
            )}
          </div>

          {/* Adjuncts */}
          <div style={{ padding: '6px 16px 4px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-muted)' }}>ADJUNCTS</span>
            <button className="btn sm" onClick={addAdj} style={{ fontSize: 11, padding: '2px 8px' }}>+ Add Adjunct</button>
          </div>
          <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {adjuncts.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>None</div>
            ) : (
              adjuncts.map((row, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 52px 24px', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--border)' }}>
                  <input type="text" placeholder="Adjunct name…" value={row.name} onChange={e => updAdj(idx, { name: e.target.value })} style={{ ...inputStyle, width: '100%' }} />
                  <input type="number" placeholder="amt" min="0" step="0.1" value={row.amt} onChange={e => updAdj(idx, { amt: e.target.value })} style={{ ...inputStyle, textAlign: 'right' as const, width: '100%' }} />
                  <select value={row.unit} onChange={e => updAdj(idx, { unit: e.target.value })} style={{ ...inputStyle, padding: '3px 4px', width: '100%' }}>
                    {['g', 'kg', 'ml', 'L', 'each'].map(u => <option key={u}>{u}</option>)}
                  </select>
                  <button onClick={() => removeAdj(idx)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: alreadyRecorded ? 'var(--green)' : 'var(--text-muted)', flex: 1, minWidth: 80 }}>
            {alreadyRecorded ? `Recorded on ${recordedDate}` : 'Not yet recorded to inventory'}
          </span>
          <button className="btn sm danger" onClick={handleDelete} title="Delete this dry hop entry" style={{ fontSize: 12 }}>
            🗑 Delete
          </button>
          <button className="btn" onClick={handleSave}>Save</button>
          <button
            className="btn"
            disabled
            title="Inventory ledger not ported yet"
            style={{ display: alreadyRecorded ? '' : 'none', opacity: 0.5, cursor: 'not-allowed' }}
          >
            ↩ Restock
          </button>
          <button
            className="btn primary"
            disabled
            title="Inventory ledger not ported yet"
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          >
            Record to Inventory
          </button>
        </div>
      </div>
    </div>
  );
}
