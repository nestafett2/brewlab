/**
 * Calendar jump-to-date popup — port of brewlab-desktop.html lines
 * 13584–13628 (openPlannerCalendar / renderCalGrid / calJumpTo).
 *
 * Positioned beside the 📅 button via `anchor` rect. Keeps its own
 * internal {year, month} cursor; calling onPick closes the popup.
 */

import { useEffect, useRef, useState } from 'react';
import { MONTH_NAMES } from './plannerShared';
import { todayDate } from '../../lib/dates';

interface Props {
  /** Date the popup should open on (controls the visible month). */
  initial: Date;
  /** Bounding-rect of the trigger button — used to position the popup. */
  anchor: { top: number; left: number; bottom: number };
  onPick: (d: Date) => void;
  onClose: () => void;
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function CalendarPopup({ initial, anchor, onPick, onClose }: Props) {
  const [calYear,  setCalYear]  = useState<number>(initial.getFullYear());
  const [calMonth, setCalMonth] = useState<number>(initial.getMonth());
  const popRef = useRef<HTMLDivElement>(null);

  // Outside click closes (HTML calOutsideClick at line 13601).
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    // Defer attachment so the click that opened the popup doesn't close it.
    const id = setTimeout(() => document.addEventListener('mousedown', onDocDown), 10);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDocDown); };
  }, [onClose]);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shiftMonth = (d: number) => {
    let y = calYear, m = calMonth + d;
    if (m > 11) { m = 0; y++; }
    if (m < 0)  { m = 11; y--; }
    setCalYear(y); setCalMonth(m);
  };
  const shiftYear = (d: number) => setCalYear(y => y + d);

  const today = todayDate();
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`pad-${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday =
      today.getFullYear() === calYear &&
      today.getMonth() === calMonth &&
      today.getDate() === d;
    cells.push(
      <div
        key={`d-${d}`}
        onClick={() => onPick(new Date(calYear, calMonth, d))}
        style={{
          padding: '3px 1px', cursor: 'pointer', borderRadius: 2,
          background: isToday ? 'var(--amber)' : undefined,
          color: isToday ? '#fff' : undefined,
          fontWeight: isToday ? 700 : undefined,
        }}
        onMouseEnter={e => { if (!isToday) (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.08)'; }}
        onMouseLeave={e => { if (!isToday) (e.currentTarget as HTMLDivElement).style.background = ''; }}
      >{d}</div>,
    );
  }

  return (
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        zIndex: 300,
        top: anchor.bottom + 4,
        left: anchor.left,
        background: 'var(--panel2)',
        border: '1px solid var(--border2)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        padding: 12, width: 240,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <button className="btn sm" onClick={() => shiftYear(-1)}>◀◀</button>
        <button className="btn sm" onClick={() => shiftMonth(-1)}>◀</button>
        <span style={{
          flex: 1, textAlign: 'center', fontFamily: 'var(--mono)',
          fontSize: 11, fontWeight: 600, color: 'var(--text)',
        }}>{MONTH_NAMES[calMonth]} {calYear}</span>
        <button className="btn sm" onClick={() => shiftMonth(1)}>▶</button>
        <button className="btn sm" onClick={() => shiftYear(1)}>▶▶</button>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2,
        textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10,
      }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>
        ))}
        {cells}
      </div>
      <button className="btn sm" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>Cancel</button>
    </div>
  );
}
