/**
 * Log-use modal — small companion to HarvestYeastModal. The HTML's
 * `openUseHarvestedYeastModal` deducts from oldest stock first using
 * `logHarvestedYeastUsage` (line 12835). Same FIFO logic here:
 *   • Walk entries in insertion order.
 *   • Deduct from each entry's `got - used` until the requested
 *     amount is satisfied or the strain runs out.
 *   • Append the beer name to each consumed entry's `beer` field
 *     (comma-separated).
 *
 * If stock can't cover the request, the modal still consumes what's
 * available and warns the user.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { dateToStr, todayDate } from '../../lib/dates';
import type { HarvestedYeast } from '../../types';

interface Props {
  strain: string;
  onClose: () => void;
}

export default function UseHarvestedYeastModal({ strain, onClose }: Props) {
  const harvestedYeast    = useStore(s => s.harvestedYeast);
  const setHarvestedYeast = useStore(s => s.setHarvestedYeast);

  const [amount, setAmount]     = useState('');
  const [beer, setBeer]         = useState('');
  const [brewNum, setBrewNum]   = useState('');
  const [date, setDate]         = useState(dateToStr(todayDate()));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const balance = useMemo(() => {
    const sd = harvestedYeast[strain];
    if (!sd) return 0;
    return sd.entries.reduce(
      (s, e) => s + (Number(e.got) || 0) - (Number(e.used) || 0), 0,
    );
  }, [harvestedYeast, strain]);

  const save = () => {
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      window.alert('Please enter a valid amount.');
      return;
    }
    if (amt > balance) {
      if (!window.confirm(
        `Requested ${amt.toFixed(1)} L but only ${balance.toFixed(1)} L available. Continue?`)) return;
    }
    const next: HarvestedYeast = { ...harvestedYeast };
    const sd = next[strain];
    if (!sd) return;
    const entries = sd.entries.slice();
    let remaining = Math.min(amt, balance > 0 ? balance : amt);
    const tag = brewNum.trim() || beer.trim();
    for (let i = 0; i < entries.length && remaining > 0; i++) {
      const avail = (Number(entries[i].got) || 0) - (Number(entries[i].used) || 0);
      if (avail <= 0) continue;
      const deduct = Math.min(avail, remaining);
      const usedNow = (Number(entries[i].used) || 0) + deduct;
      const beerJoined = entries[i].beer
        ? `${entries[i].beer}, ${tag}`
        : tag;
      entries[i] = { ...entries[i], used: usedNow, beer: beerJoined };
      remaining -= deduct;
    }
    // Append a usage row pinned to today's date so the table shows the
    // pulled amount as a discrete event (HTML doesn't do this — it just
    // mutates the harvest entries' used/beer fields). Adding the row
    // mirrors how the regular ledger flow works and makes the table
    // readable for brewers.
    entries.push({
      id: crypto.randomUUID(),
      date,
      got: 0,
      used: amt,
      beer: tag,
      harvestDate: date,
      generation: sd.generation,
      type: 'usage',
    });
    next[strain] = { ...sd, entries };
    setHarvestedYeast(next);
    onClose();
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>− LOG USE — {strain.toUpperCase()}</div>

        <div style={balanceStyle}>
          Available: <span style={{ color: balance > 0 ? 'var(--amber)' : 'var(--red)' }}>
            {balance.toFixed(1)} L
          </span>
        </div>

        <Row label="AMOUNT (L)">
          <input
            type="number" min={0} step={0.1}
            value={amount} onChange={e => setAmount(e.target.value)}
            autoFocus
            style={{ ...inputStyle, width: 120, flex: 'none' }}
          />
        </Row>
        <Row label="DATE">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="BEER">
          <input
            type="text" value={beer}
            onChange={e => setBeer(e.target.value)}
            placeholder="e.g. Solar Storm"
            style={inputStyle}
          />
        </Row>
        <Row label="BREW #">
          <input
            type="text" value={brewNum}
            onChange={e => setBrewNum(e.target.value)}
            placeholder="optional"
            style={inputStyle}
          />
        </Row>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={save}>LOG USE</button>
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
  fontFamily: 'var(--mono)', fontSize: 10,
  background: 'rgba(255,176,0,0.06)', border: '1px solid rgba(255,176,0,0.2)',
  padding: '6px 10px', marginBottom: 12,
};
