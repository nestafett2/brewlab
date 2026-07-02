/**
 * Yearly Overview modal — port of brewlab-desktop.html lines 16215–16303
 * (openYearlyModal / renderYearly / yearlyAddEntry / yearlyDeleteEntry /
 * printYearlySchedule).
 *
 * 3×4 month grid for the active year. Each cell shows a list of beer
 * "chips" (name + colour) with inline add/delete. Year navigation via
 * ◀ / ▶ buttons; print opens a new window with a print-friendly grid.
 *
 * Storage: bl_yearly, keyed "<year>-<monthIndex>". Round-trips via the
 * settings table (added to SETTINGS_KEYS as part of this port — HTML
 * was local-only).
 */

import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { BREW_SWATCHES, MONTH_ABBR, MONTH_NAMES } from './plannerShared';

interface Props {
  onClose: () => void;
}

export default function YearlyModal({ onClose }: Props) {
  const yearlyData    = useStore(s => s.yearlyData);
  const setYearlyData = useStore(s => s.setYearlyData);
  const pushToast     = useStore(s => s.pushToast);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addEntry = (key: string) => {
    const name = (drafts[key] || '').trim();
    if (!name) return;
    // Snapshot the FULL yearlyData blob — undo restores all months,
    // not just this key's entry list. Cheap (yearlyData is small).
    const before = yearlyData;
    const existing = yearlyData[key] || [];
    const color = BREW_SWATCHES[existing.length % BREW_SWATCHES.length];
    setYearlyData({ ...yearlyData, [key]: [...existing, { name, color }] });
    setDrafts(prev => ({ ...prev, [key]: '' }));
    pushToast({
      message: `Added "${name}"`,
      undo: () => setYearlyData(before),
    });
  };

  const deleteEntry = (key: string, idx: number) => {
    const existing = yearlyData[key] || [];
    const removed = existing[idx];
    if (!removed) return;
    const before = yearlyData;
    const next = existing.filter((_, i) => i !== idx);
    setYearlyData({ ...yearlyData, [key]: next });
    pushToast({
      message: `Removed "${removed.name}"`,
      undo: () => setYearlyData(before),
    });
  };

  const printSchedule = () => {
    let rows = '';
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${m}`;
      const entries = yearlyData[key] || [];
      const list = entries.length
        ? entries.map(e => `<span class="beer-chip" style="border-left:3px solid ${e.color || '#d4820f'}">${escapeHtml(e.name)}</span>`).join('')
        : '<span class="beer-empty">—</span>';
      rows += `<div class="month-cell"><div class="month-name">${MONTH_NAMES[m].toUpperCase()}</div><div class="beer-list">${list}</div></div>`;
    }
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      pushToast({
        message: 'Popup blocked. Allow popups for this site to print the yearly schedule.',
        variant: 'error',
      });
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Production Schedule — ${year}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;background:#fff;color:#111;padding:24px;}
  h1{font-size:18px;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;}
  .subtitle{font-size:10px;letter-spacing:2px;color:#666;margin-bottom:20px;text-transform:uppercase;}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
  .month-cell{border:1px solid #ccc;padding:10px 12px;min-height:80px;}
  .month-name{font-size:9px;letter-spacing:2px;font-weight:700;color:#d4820f;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;}
  .beer-list{display:flex;flex-direction:column;gap:4px;}
  .beer-chip{font-size:11px;padding:2px 6px;background:#f5f5f5;display:block;}
  .beer-empty{font-size:11px;color:#aaa;}
  @media print{body{padding:12px;}h1{font-size:15px;}}
</style></head><body>
<h1>Production Schedule</h1>
<div class="subtitle">${year}</div>
<div class="grid">${rows}</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
    win.document.close();
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={titleStyle}>YEARLY OVERVIEW</span>
          <button className="btn sm" onClick={() => setYear(y => y - 1)}>◀</button>
          <span style={yearLabelStyle}>{year}</span>
          <button className="btn sm" onClick={() => setYear(y => y + 1)}>▶</button>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={printSchedule}>🖨 PRINT</button>
          <button className="btn sm" onClick={onClose}>✕ CLOSE</button>
        </div>
        <div style={gridStyle}>
          {Array.from({ length: 12 }, (_, m) => {
            const key = `${year}-${m}`;
            const entries = yearlyData[key] || [];
            return (
              <div key={key} style={monthCellStyle}>
                <div style={monthTitleStyle}>{MONTH_ABBR[m]}</div>
                {entries.map((e, i) => (
                  <div key={i} className="yearly-entry-row" style={entryStyle}>
                    <div style={{ width: 8, height: 8, borderRadius: 1, flexShrink: 0, background: e.color || '#d4820f' }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text)', flex: 1 }}>{e.name}</span>
                    <span
                      onClick={() => deleteEntry(key, i)}
                      style={{ fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px' }}
                      title="Delete"
                    >✕</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <input
                    type="text"
                    placeholder="Add beer…"
                    value={drafts[key] || ''}
                    onChange={ev => setDrafts(prev => ({ ...prev, [key]: ev.target.value }))}
                    onKeyDown={ev => { if (ev.key === 'Enter') addEntry(key); }}
                    style={addInputStyle}
                  />
                  <button onClick={() => addEntry(key)} style={addBtnStyle}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 220,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  padding: '18px 20px', width: 740, maxWidth: '96vw', maxHeight: '88vh', overflowY: 'auto',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--amber)',
};

const yearLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)',
  minWidth: 36, textAlign: 'center',
};

const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12,
};

const monthCellStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border)', padding: '8px 10px',
};

const monthTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 12, letterSpacing: 2, color: 'var(--amber)',
  marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--border)',
};

const entryStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '3px 0', borderBottom: '1px solid var(--border)',
};

const addInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--panel3)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 9,
  padding: '3px 6px', outline: 'none',
};

const addBtnStyle: React.CSSProperties = {
  background: 'var(--amber-dim, var(--amber))', border: 'none', color: '#fff',
  fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 8px', cursor: 'pointer',
};
