/**
 * Inventory Correction modal — port of brewlab-desktop.html lines
 * 16103–16166 (openInventoryCorrection / confirmInventoryCorrection).
 *
 * Shows every library entry in the active section with its current
 * digital balance + a Physical input. On confirm, any field where the
 * physical count differs from digital writes a correction ledger entry:
 *   • physical > digital → IN row (got = diff)
 *   • physical < digital → OUT row (used = abs(diff))
 *
 * Entries with `correctionNote` set are flagged in the LedgerView so
 * the user can see they came from a correction, not a normal IN/OUT.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { fmtKg, INV_UNITS } from '../../lib/units';
import { getLedgerBalance } from '../../lib/ledger';
import { dateToStr, todayDate } from '../../lib/dates';
import type { InvSection } from './inventoryShared';
import type { LedgerEntry } from '../../types';

interface Props {
  section: InvSection;
  onClose: () => void;
}

export default function InventoryCorrectionModal({ section, onClose }: Props) {
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);
  const inventoryStock = useStore(s => s.inventoryStock);
  const ledgerData     = useStore(s => s.ledgerData);
  const setLedgerData  = useStore(s => s.setLedgerData);
  const pushToast      = useStore(s => s.pushToast);

  const data =
    section === 'malts' ? maltLib :
    section === 'hops'  ? hopLib :
    section === 'yeast' ? yeastLib : miscLib;
  const unit = INV_UNITS[section];

  const [date, setDate] = useState<string>(dateToStr(todayDate()));
  // Per-entry physical input value (string so empty-vs-zero is distinguishable).
  const [physical, setPhysical] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Snapshot current ledger balances at modal-open time so users see the
  // numbers they're correcting against — and the diff math uses them.
  const currentBalances = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of data) {
      const k = `${section}_${e.id}`;
      out[k] = getLedgerBalance(inventoryStock, ledgerData, k);
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional one-shot snapshot

  const confirm = () => {
    const next = { ...ledgerData };
    let corrected = 0;
    for (const e of data) {
      const key = `${section}_${e.id}`;
      const raw = physical[key];
      if (raw == null || raw.trim() === '') continue; // blank = skip
      const phys = parseFloat(raw);
      if (!isFinite(phys)) continue;
      const current = currentBalances[key] ?? 0;
      const diff = Math.round((phys - current) * 1000) / 1000;
      if (Math.abs(diff) < 0.001) continue;
      const entry: LedgerEntry = {
        date,
        beer: 'Inventory correction',
        correctionNote: `Physical count: ${phys}`,
      };
      if (diff > 0) entry.got = diff;
      else entry.used = Math.abs(diff);
      next[key] = [...(next[key] ?? []), entry];
      corrected++;
    }
    if (corrected > 0) {
      setLedgerData(next);
      pushToast({
        message: `${corrected} correction(s) applied and written to the tax ledger.`,
        variant: 'success',
      });
      onClose();
    } else {
      pushToast({
        message: 'No changes — all physical counts match digital, or no counts were entered.',
        variant: 'info',
      });
    }
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>INVENTORY CORRECTION — {unit.toUpperCase()}</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
          <label style={{
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
            color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0,
          }}>DATE</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
          <span style={hintStyle}>Counts on this date — written as ledger correction entries.</span>
        </div>

        <div style={listWrapStyle}>
          {data.length === 0 ? (
            <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
              No ingredients in this section.
            </div>
          ) : data.map(e => {
            const key = `${section}_${e.id}`;
            const current = currentBalances[key] ?? 0;
            return (
              <div key={String(e.id)} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={nameStyle}>{e.name}</div>
                  <div style={metaStyle}>
                    Digital: <span style={{ color: 'var(--amber)' }}>{fmtKg(current)} {unit}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                    Physical:
                  </span>
                  <input
                    type="number" min={0} step={0.1}
                    placeholder="—"
                    value={physical[key] ?? ''}
                    onChange={ev => setPhysical(prev => ({ ...prev, [key]: ev.target.value }))}
                    style={physInputStyle}
                  />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                    {unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={confirm}>APPLY CORRECTIONS</button>
          <button className="btn" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  padding: '18px 20px', width: 480, maxWidth: '95vw',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
  marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const dateInputStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 8px', outline: 'none',
};

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
};

const listWrapStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto',
  border: '1px solid var(--border)', background: 'var(--bg)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '7px 12px', borderBottom: '1px solid var(--border)',
};

const nameStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const metaStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
};

const physInputStyle: React.CSSProperties = {
  width: 72, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '2px 6px', outline: 'none', textAlign: 'right',
};
