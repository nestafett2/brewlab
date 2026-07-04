/**
 * TastingModal — wizard-style sensory scoring for the Analysis-tab tasting
 * panel. Two screens:
 *   Screen 1: taster name + date.
 *   Screen 2: two scoring sections (Hop & Fruit, Malt & Fermentation)
 *             stepped Next → / ← Back. Each descriptor scored 0–5 in
 *             half-point steps via an 11-button row.
 *
 * On "Save Tasting" it builds a TasterScore (new UUID) and calls onSave,
 * then closes.
 */

import { useState } from 'react';
import type { TasterScore } from '../../types';

interface Props {
  recipeId: string;
  onSave: (score: TasterScore) => void;
  onClose: () => void;
}

// Score buttons: 0, 0.5, 1 … 5.
const SCORES = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** "2½" / "½" / "3" display for a half-point score. */
function fmtScore(s: number): string {
  const whole = Math.floor(s);
  const half = s - whole >= 0.5;
  if (half) return whole === 0 ? '½' : `${whole}½`;
  return String(whole);
}

type HopKey =
  | 'citrus' | 'tropical' | 'berry' | 'stoneFruit' | 'floral'
  | 'piney' | 'dank' | 'earthy' | 'spicy';
type MaltKey =
  | 'lightGrain' | 'darkGrain' | 'sweet' | 'nutty'
  | 'sour' | 'funky' | 'fullBody' | 'clean';

const HOP_DESCRIPTORS: { key: HopKey; label: string }[] = [
  { key: 'citrus',     label: 'Citrus' },
  { key: 'tropical',   label: 'Tropical' },
  { key: 'berry',      label: 'Berry' },
  { key: 'stoneFruit', label: 'Stone Fruit' },
  { key: 'floral',     label: 'Floral' },
  { key: 'piney',      label: 'Piney/Resinous' },
  { key: 'dank',       label: 'Dank' },
  { key: 'earthy',     label: 'Earthy' },
  { key: 'spicy',      label: 'Spicy/Herbal' },
];

const MALT_DESCRIPTORS: { key: MaltKey; label: string }[] = [
  { key: 'lightGrain', label: 'Light Grain' },
  { key: 'darkGrain',  label: 'Dark Grain' },
  { key: 'sweet',      label: 'Sweet/Caramel' },
  { key: 'nutty',      label: 'Nutty' },
  { key: 'sour',       label: 'Sour/Acidic' },
  { key: 'funky',      label: 'Funky/Yeasty' },
  { key: 'fullBody',   label: 'Full Body' },
  { key: 'clean',      label: 'Clean/Dry' },
];

const EMPTY_HOP: TasterScore['hopChart'] = {
  citrus: 0, tropical: 0, berry: 0, stoneFruit: 0, floral: 0,
  piney: 0, dank: 0, earthy: 0, spicy: 0,
};
const EMPTY_MALT: TasterScore['maltChart'] = {
  lightGrain: 0, darkGrain: 0, sweet: 0, nutty: 0,
  sour: 0, funky: 0, fullBody: 0, clean: 0,
};

export default function TastingModal({ onSave, onClose }: Props) {
  const [screen, setScreen] = useState<1 | 2>(1);
  const [section, setSection] = useState<'hop' | 'malt'>('hop');

  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [hopChart, setHopChart] = useState<TasterScore['hopChart']>({ ...EMPTY_HOP });
  const [maltChart, setMaltChart] = useState<TasterScore['maltChart']>({ ...EMPTY_MALT });

  const setHop = (k: HopKey, v: number) => setHopChart(prev => ({ ...prev, [k]: v }));
  const setMalt = (k: MaltKey, v: number) => setMaltChart(prev => ({ ...prev, [k]: v }));

  const handleSave = () => {
    const score: TasterScore = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Anonymous',
      date,
      hopChart,
      maltChart,
    };
    onSave(score);
    onClose();
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        {screen === 1 ? (
          <>
            <h3 style={titleStyle}>NEW TASTING</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <label style={fieldStyle}>
                <span style={labelStyle}>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                  autoFocus
                />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn sm" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={() => { setSection('hop'); setScreen(2); }}>
                Start Tasting →
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Progress indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ ...stepPill, ...(section === 'hop' ? stepPillActive : {}) }}>Hop &amp; Fruit</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <span style={{ ...stepPill, ...(section === 'malt' ? stepPillActive : {}) }}>Malt &amp; Fermentation</span>
            </div>

            <h3 style={titleStyle}>
              {section === 'hop' ? 'HOP & FRUIT CHARACTER' : 'MALT & FERMENTATION'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {section === 'hop'
                ? HOP_DESCRIPTORS.map(d => (
                    <ScoreRow key={d.key} label={d.label} value={hopChart[d.key]} onChange={v => setHop(d.key, v)} />
                  ))
                : MALT_DESCRIPTORS.map(d => (
                    <ScoreRow key={d.key} label={d.label} value={maltChart[d.key]} onChange={v => setMalt(d.key, v)} />
                  ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
              <button
                className="btn sm"
                onClick={() => section === 'hop' ? setScreen(1) : setSection('hop')}
              >← Back</button>
              {section === 'hop' ? (
                <button className="btn primary" onClick={() => setSection('malt')}>Next →</button>
              ) : (
                <button className="btn primary" onClick={handleSave}>Save Tasting</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Score row: label + 11 half-point buttons ────────────────────────────

function ScoreRow({ label, value, onChange }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: '0 0 130px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {SCORES.map(s => {
          const active = value === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              style={{
                minWidth: 26, padding: '3px 0', textAlign: 'center',
                fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
                border: '1px solid var(--border2)', borderRadius: 4,
                background: active ? 'var(--amber)' : 'var(--panel2)',
                color: active ? '#fff' : 'var(--text)',
              }}
            >{fmtScore(s)}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const panel: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  borderRadius: 12, padding: 20, width: 560, maxWidth: '95vw',
  maxHeight: '90vh', overflow: 'auto',
};
const titleStyle: React.CSSProperties = {
  margin: 0, color: 'var(--amber)', fontFamily: 'var(--mono)',
  fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
};
const fieldStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
};
const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8,
  textTransform: 'uppercase', color: 'var(--text-muted)',
};
const inputStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12,
  padding: '6px 8px', borderRadius: 6, outline: 'none',
};
const stepPill: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 8px',
  borderRadius: 999, background: 'var(--panel2)', color: 'var(--text-muted)',
};
const stepPillActive: React.CSSProperties = {
  background: 'var(--amber)', color: '#fff',
};
