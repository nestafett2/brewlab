/**
 * Ferm Entry Modal — port of HTML #fermEntryModal (lines 1408–1439) and
 * saveFermEntry (line 19726). Fields: date / Plato / pH / Temp / Notes.
 *
 * Save creates a new entry with crypto.randomUUID() and hands it to the
 * parent's onSave; the parent appends to the log and dispatches via
 * setFermLog → lsSet → ferm_log table upsert.
 */

import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import type { FermLogEntry } from '../../types';
import { today } from '../../lib/utils';

interface Props {
  onSave: (entry: FermLogEntry) => void;
  onClose: () => void;
}

export default function FermEntryModal({ onSave, onClose }: Props) {
  const pushToast = useStore(s => s.pushToast);
  const [date, setDate]   = useState(today());
  const [plato, setPlato] = useState('');
  const [ph, setPh]       = useState('');
  const [temp, setTemp]   = useState('');
  const [notes, setNotes] = useState('');
  const platoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { platoRef.current?.focus(); }, []);

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = date.trim();
    if (!trimmed) { pushToast({ message: 'Date is required', variant: 'error' }); return; }
    const entry: FermLogEntry = {
      id: crypto.randomUUID(),
      date: trimmed,
      plato: plato.trim() ? parseFloat(plato) : null,
      ph:    ph.trim()    ? parseFloat(ph)    : null,
      temp:  temp.trim()  ? parseFloat(temp)  : null,
      notes: notes.trim(),
    };
    onSave(entry);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--panel)', border: '1px solid var(--border2)', padding: '20px 24px', width: 320, fontFamily: 'var(--mono)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--amber)', marginBottom: 14 }}>
          Log Entry
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            ['Date',       date,  setDate,  'YYYY-MM-DD', 'text'],
            ['Plato (°P)', plato, setPlato, '—',          'number'],
            ['pH',         ph,    setPh,    '—',          'number'],
            ['Temp (°C)',  temp,  setTemp,  '—',          'number'],
            ['Notes',      notes, setNotes, '—',          'text'],
          ] as [string, string, (s: string) => void, string, string][]).map(([label, val, setter, ph, type], i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 9, color: 'var(--text-muted)', width: 64 }}>{label}</label>
              <input
                ref={i === 1 ? platoRef : undefined}
                type={type}
                step={type === 'number' ? '0.1' : undefined}
                placeholder={ph}
                value={val}
                onChange={e => setter(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                style={{ flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, padding: '4px 6px', outline: 'none' }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Save Entry</button>
        </div>
      </div>
    </div>
  );
}
