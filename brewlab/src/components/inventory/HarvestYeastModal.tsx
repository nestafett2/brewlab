/**
 * Log-harvest modal — port of brewlab-desktop.html lines 12752–12833
 * (openHarvestYeastModal / openHarvestYeastModalForStrain /
 * confirmHarvestYeast).
 *
 * Fields:
 *   • Strain (text — pre-filled from initialStrain prop, read-only when set)
 *   • Amount (L)
 *   • Harvest Date
 *   • From Batch (free text — recipe brewNum or recipe name)
 *   • Generation (auto-suggest: existing strain.generation + 1, or 1 if new)
 *   • Container (free text — jar/bottle id)
 *
 * Writes a new entry to the strain's `entries` array. If the strain
 * doesn't exist yet, creates it with the entered generation.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { dateToStr, todayDate } from '../../lib/dates';
import type { HarvestedYeastEntry } from '../../types';

interface Props {
  /** When non-empty, the strain field is pre-filled and read-only. */
  initialStrain: string;
  onClose: () => void;
}

export default function HarvestYeastModal({ initialStrain, onClose }: Props) {
  const harvestedYeast    = useStore(s => s.harvestedYeast);
  const setHarvestedYeast = useStore(s => s.setHarvestedYeast);

  const lockStrain = !!initialStrain;
  const existing = initialStrain ? harvestedYeast[initialStrain] : undefined;

  const suggestedGen = useMemo(() => existing
    ? (existing.generation || 1) + 1
    : 1, [existing]);

  const [strain, setStrain]       = useState(initialStrain);
  const [amount, setAmount]       = useState('');
  const [date, setDate]           = useState(dateToStr(todayDate()));
  const [fromBatch, setFromBatch] = useState('');
  const [generation, setGeneration] = useState(String(suggestedGen));
  const [container, setContainer] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const balance = useMemo(() => {
    if (!strain || !harvestedYeast[strain]) return null;
    return harvestedYeast[strain].entries.reduce(
      (s, e) => s + (Number(e.got) || 0) - (Number(e.used) || 0), 0,
    );
  }, [strain, harvestedYeast]);

  const save = () => {
    const trimmed = strain.trim();
    if (!trimmed) { window.alert('Please enter a strain name.'); return; }
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) { window.alert('Please enter a valid amount.'); return; }
    const gen = parseInt(generation, 10) || 1;
    const entry: HarvestedYeastEntry = {
      id: crypto.randomUUID(),
      date,
      got: amt,
      used: 0,
      beer: '',
      harvestDate: date,
      generation: gen,
      container: container.trim(),
      note: fromBatch.trim() ? `Harvested from #${fromBatch.trim()}` : undefined,
      type: 'harvest',
    };
    // The HTML stores `harvestedFrom` as a sibling field; it's not on
    // our React `HarvestedYeastEntry` interface but we keep it on the
    // raw object for round-trip compatibility with HTML / supabase.
    (entry as HarvestedYeastEntry & { harvestedFrom?: string }).harvestedFrom = fromBatch.trim();

    const next = { ...harvestedYeast };
    const cur = next[trimmed] ?? { generation: gen, entries: [] };
    next[trimmed] = {
      generation: gen,
      entries: [...cur.entries, entry],
    };
    setHarvestedYeast(next);
    onClose();
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>🧫 LOG HARVEST</div>

        <Row label="STRAIN">
          <input
            type="text"
            value={strain}
            readOnly={lockStrain}
            onChange={e => setStrain(e.target.value)}
            placeholder="e.g. London Ale III"
            style={{ ...inputStyle, ...(lockStrain ? { background: 'var(--panel3)' } : {}) }}
          />
        </Row>

        {balance != null && (
          <div style={balanceStyle}>
            Current stock of <b>{strain}</b>:&nbsp;
            <span style={{ color: 'var(--amber)' }}>{balance.toFixed(1)} L</span>&nbsp;
            (Gen {harvestedYeast[strain]?.generation || 1})
          </div>
        )}

        <Row label="AMOUNT (L)">
          <input
            type="number" min={0} step={0.1}
            value={amount} onChange={e => setAmount(e.target.value)}
            autoFocus
            style={{ ...inputStyle, width: 120, flex: 'none' }}
          />
        </Row>
        <Row label="HARVEST DATE">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="FROM BATCH">
          <input
            type="text" value={fromBatch}
            onChange={e => setFromBatch(e.target.value)}
            placeholder="e.g. 384"
            style={inputStyle}
          />
        </Row>
        <Row label="GENERATION">
          <input
            type="number" min={1}
            value={generation}
            onChange={e => setGeneration(e.target.value)}
            style={{ ...inputStyle, width: 80, flex: 'none' }}
          />
        </Row>
        <Row label="CONTAINER">
          <input
            type="text" value={container}
            onChange={e => setContainer(e.target.value)}
            placeholder="e.g. Jar A"
            style={inputStyle}
          />
        </Row>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={save}>LOG HARVEST</button>
          <button className="btn" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <label style={{
        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
        color: 'var(--text-muted)', textTransform: 'uppercase',
        width: 110, flexShrink: 0,
      }}>{label}</label>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  padding: '18px 20px', width: 380, maxWidth: '95vw',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
  marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '4px 8px', outline: 'none',
};

const balanceStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9,
  background: 'rgba(255,176,0,0.06)', border: '1px solid rgba(255,176,0,0.2)',
  padding: '5px 8px', marginBottom: 8, color: 'var(--text-muted)',
};
