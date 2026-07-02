/**
 * Add / Edit ledger entry modal — port of brewlab-desktop.html lines
 * 15870–15947 (openAddLedgerEntry / openEditLedgerEntry / saveLedgerEntry /
 * deleteLedgerEntry / ledTypeChanged).
 *
 * Form fields:
 *   • TYPE radio (IN / OUT) — drives which date+note fields are visible.
 *   • RECEIVED DATE (IN only)  — used as `receivedDate` AND `date`.
 *   • USED DATE (OUT only)     — used as `usedDate` AND `date`.
 *   • QTY (kg) — single field, written to either `got` or `used`.
 *   • SUPPLIER (IN) / BEER (OUT) — narrative column.
 *
 * Edit mode pre-fills from the ledgerData[key][editIdx] row. The save
 * action writes through the store's updateLedgerEntry / addLedgerEntry
 * actions so the change persists locally + syncs.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { dateToStr, todayDate } from '../../lib/dates';
import type { LedgerEntry } from '../../types';

interface Props {
  ledgerKey: string;
  /** null = adding; otherwise edit the row at this original index. */
  editIdx: number | null;
  onClose: () => void;
}

type EntryType = 'got' | 'used';

export default function LedgerEntryModal({ ledgerKey, editIdx, onClose }: Props) {
  const ledgerData         = useStore(s => s.ledgerData);
  const setLedgerData      = useStore(s => s.setLedgerData);
  const addLedgerEntry     = useStore(s => s.addLedgerEntry);
  const updateLedgerEntry  = useStore(s => s.updateLedgerEntry);
  const deleteLedgerEntry  = useStore(s => s.deleteLedgerEntry);
  const pushToast          = useStore(s => s.pushToast);

  const isEdit = editIdx != null;
  const existing: LedgerEntry | null = useMemo(
    () => isEdit ? (ledgerData[ledgerKey]?.[editIdx] ?? null) : null,
    [isEdit, ledgerData, ledgerKey, editIdx],
  );

  const [type, setType] = useState<EntryType>(() =>
    existing?.got != null ? 'got' : existing?.used != null ? 'used' : 'got');
  const [qty, setQty]     = useState<string>(() =>
    existing?.got != null ? String(existing.got)
      : existing?.used != null ? String(existing.used)
      : '');
  const [beer, setBeer]   = useState<string>(() => existing?.beer ?? '');
  const [supplier, setSupplier] = useState<string>(() => existing?.supplier ?? '');
  const [receivedDate, setReceivedDate] = useState<string>(() =>
    existing?.receivedDate || existing?.date || dateToStr(todayDate()));
  const [usedDate, setUsedDate] = useState<string>(() =>
    existing?.usedDate || existing?.date || dateToStr(todayDate()));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    const n = parseFloat(qty) || 0;
    if (n <= 0) return;
    const date = type === 'got' ? receivedDate : usedDate;
    const entry: LedgerEntry = {
      date,
      beer: beer.trim() || undefined,
      supplier: supplier.trim() || undefined,
    };
    if (type === 'got') {
      entry.got = n;
      entry.receivedDate = receivedDate;
    } else {
      entry.used = n;
      entry.usedDate = usedDate;
    }
    if (isEdit && editIdx != null) updateLedgerEntry(ledgerKey, editIdx, entry);
    else addLedgerEntry(ledgerKey, entry);
    onClose();
  };

  const remove = () => {
    if (!isEdit || editIdx == null) return;
    // Snapshot the FULL ledgerData blob — undo restores the entry at
    // its exact original index. (deleteLedgerEntry uses index-based
    // removal; restoring via setLedgerData with the pre-delete blob
    // is the safe round-trip.)
    const before = ledgerData;
    deleteLedgerEntry(ledgerKey, editIdx);
    pushToast({
      message: 'Deleted ledger entry',
      undo: () => setLedgerData(before),
    });
    onClose();
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>{isEdit ? 'EDIT ENTRY' : 'ADD ENTRY'}</div>

        {/* Type radio */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio" name="led-type" value="got"
              checked={type === 'got'}
              onChange={() => setType('got')}
              style={{ accentColor: 'var(--amber)' }}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#3a8a3a', fontWeight: 700 }}>
              IN — Received
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio" name="led-type" value="used"
              checked={type === 'used'}
              onChange={() => setType('used')}
              style={{ accentColor: 'var(--amber)' }}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#c05050', fontWeight: 700 }}>
              OUT — Used
            </span>
          </label>
        </div>

        {/* Conditional date + note */}
        {type === 'got' ? (
          <>
            <Row label="RECEIVED DATE">
              <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={inputStyle} />
            </Row>
            <Row label="SUPPLIER">
              <input
                type="text" value={supplier}
                onChange={e => setSupplier(e.target.value)}
                placeholder="e.g. BET, Onishii"
                style={inputStyle}
              />
            </Row>
          </>
        ) : (
          <>
            <Row label="USED DATE">
              <input type="date" value={usedDate} onChange={e => setUsedDate(e.target.value)} style={inputStyle} />
            </Row>
            <Row label="BEER / NOTE">
              <input
                type="text" value={beer}
                onChange={e => setBeer(e.target.value)}
                placeholder="e.g. Solar Storm"
                style={inputStyle}
              />
            </Row>
          </>
        )}

        <Row label="QTY (kg)">
          <input
            type="number" min={0} step={0.01}
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder="0"
            autoFocus
            style={{ ...inputStyle, width: 120, flex: 'none' }}
          />
        </Row>

        {existing?.correctionNote && (
          <div style={correctionStyle}>
            Inventory correction note: {existing.correctionNote}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={save}>SAVE</button>
          <button className="btn" onClick={onClose}>CANCEL</button>
          {isEdit && (
            <button className="btn danger" onClick={remove}>DELETE</button>
          )}
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

const correctionStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  background: 'rgba(240,148,32,0.08)', border: '1px solid rgba(240,148,32,0.2)',
  padding: '5px 8px', marginTop: 6,
};
