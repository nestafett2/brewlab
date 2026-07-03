/**
 * Edit Order modal — fills the gap left by HTML's `openEditOrderModal`
 * callsite (brewlab-desktop.html:14637) which references a function
 * that was never defined. We give the user a real edit surface:
 *   • Ingredient, type — read-only (changing them would orphan the
 *     forecast match).
 *   • Qty, supplier, expected delivery, notes — editable.
 *   • Delete button.
 *
 * Status is no longer editable here — it's managed via checkboxes and
 * the bulk Mark Ordered / Mark Received actions in OrdersPanel.tsx.
 * That means the old prevStatus → nextStatus transition branches
 * (not-received → received, received → not-received) can't happen from
 * this modal anymore and have been removed; OrdersPanel's bulk actions
 * own that logic now (including the new-ledger-entry-on-receive path).
 *
 * Ledger sync invariant — the ledger reflects status='received' orders
 * only. This modal never flips status, but an already-received order
 * can still have its qty/supplier/delivery/notes edited here, so:
 *   • order.status !== 'received' : save order; no ledger touch
 *   • order.status === 'received' : save order; also update the tagged
 *                                    ledger entry (qty/supplier/date/notes)
 *                                    so it doesn't drift from the order
 *   • delete received order       : confirm; delete order + tagged entry
 *   • delete pending/ordered order: single-confirm delete; no ledger
 *
 * Pre-fix legacy ledger entries (Phase 2 initial release) lack
 * `orderId` so the lookup helpers skip them — the modal won't auto-
 * mutate untagged entries. The brewer cleans those up via the Tax
 * Ledger view if needed.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import type { LedgerData, OrderEntry } from '../../types';
import { findOrderLedgerLocation } from './orderLedgerSync';

interface Props {
  orderId: string;
  onClose: () => void;
}

export default function EditOrderModal({ orderId, onClose }: Props) {
  const orders       = useStore(s => s.orders);
  const setOrders    = useStore(s => s.setOrders);
  const updateOrder  = useStore(s => s.updateOrder);
  const deleteOrder  = useStore(s => s.deleteOrder);
  const suppliers    = useStore(s => s.suppliers);
  const ledgerData    = useStore(s => s.ledgerData);
  const setLedgerData = useStore(s => s.setLedgerData);
  const pushToast     = useStore(s => s.pushToast);

  const order = orders.find(o => o.id === orderId);

  const [qty, setQty]           = useState<string>(order ? String(order.qty) : '');
  const [supplier, setSupplier] = useState<string>(order?.supplier ?? '');
  const [delivery, setDelivery] = useState<string>(order?.delivery ?? '');
  const [notes, setNotes]       = useState<string>(order?.notes ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!order) {
    return (
      <div style={overlayStyle} onMouseDown={onClose}>
        <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
          <div style={titleStyle}>EDIT ORDER</div>
          <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            Order not found.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const save = () => {
    const n = parseFloat(qty);
    const updates: Partial<OrderEntry> = {
      qty: isFinite(n) ? n : 0,
      supplier: supplier.trim(),
      delivery: delivery || undefined,
      notes: notes.trim(),
    };
    // Snapshot the merged-state order BEFORE we mutate the store, for
    // the ledger-sync check below.
    const merged: OrderEntry = { ...order, ...updates };

    // Status can't change here anymore, but if this order is already
    // 'received' (set via OrdersPanel's bulk Mark Received action), its
    // tagged ledger entry needs to stay in sync with the edited fields —
    // otherwise the tax ledger would keep showing the pre-edit qty/
    // supplier/date/notes.
    if (order.status === 'received') {
      const loc = findOrderLedgerLocation(ledgerData, order.id);
      if (loc) {
        const list = ledgerData[loc.key] ?? [];
        const existing = list[loc.idx];
        const date = merged.delivery || merged.orderDate || existing.date;
        const updatedEntry = {
          ...existing,
          got: merged.qty,
          supplier: merged.supplier,
          beer: merged.notes || '',
          date,
          receivedDate: date,
        };
        const updatedList = list.slice();
        updatedList[loc.idx] = updatedEntry;
        const next: LedgerData = { ...ledgerData, [loc.key]: updatedList };
        setLedgerData(next);
      }
      // If loc was null, this is a legacy received order with an
      // untagged ledger entry. Don't touch the legacy entry — leave
      // brewer in control. (The save still goes through.)
    }

    updateOrder(orderId, updates);
    onClose();
  };

  const remove = () => {
    const isReceived = order.status === 'received';
    const msg = isReceived
      ? `Delete order for "${order.ingredient}"?\n\nThis will also remove the tax ledger entry for this delivery.`
      : `Delete order for "${order.ingredient}"?`;
    if (!window.confirm(msg)) return;
    // Cascade snapshot: orders + ledgerData (the latter only if this
    // is a received order with a ledger entry to remove). Capture both
    // unconditionally so the undo closure can restore both with one
    // setLedgerData call regardless of whether the action wrote to it.
    const beforeOrders = orders;
    const beforeLedger = ledgerData;
    if (isReceived) {
      const loc = findOrderLedgerLocation(ledgerData, order.id);
      if (loc) {
        const list = ledgerData[loc.key] ?? [];
        const updatedList = list.slice();
        updatedList.splice(loc.idx, 1);
        const next: LedgerData = { ...ledgerData, [loc.key]: updatedList };
        setLedgerData(next);
      }
    }
    deleteOrder(orderId);
    pushToast({
      message: `Deleted order for "${order.ingredient}"`,
      undo: () => {
        setOrders(beforeOrders);
        setLedgerData(beforeLedger);
      },
    });
    onClose();
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>EDIT ORDER</div>

        <div style={readonlyRowStyle}>
          <div>
            <div style={readonlyLabelStyle}>INGREDIENT</div>
            <div style={readonlyValueStyle}>{order.ingredient}</div>
          </div>
          <div>
            <div style={readonlyLabelStyle}>TYPE</div>
            <div style={readonlyValueStyle}>{order.type}</div>
          </div>
        </div>

        <Row label="QTY (kg)">
          <input
            type="number" min={0} step={0.1}
            value={qty}
            onChange={e => setQty(e.target.value)}
            style={{ ...inputStyle, width: 120, flex: 'none' }}
          />
        </Row>
        <Row label="SUPPLIER">
          <select value={supplier} onChange={e => setSupplier(e.target.value)} style={inputStyle}>
            <option value="">— None —</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Row>
        <Row label="DELIVERY">
          <input type="date" value={delivery} onChange={e => setDelivery(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="NOTES">
          <input
            type="text" value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="optional"
            style={inputStyle}
          />
        </Row>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={save}>SAVE</button>
          <button className="btn" onClick={onClose}>CANCEL</button>
          <button className="btn danger" onClick={remove}>DELETE</button>
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
        width: 100, flexShrink: 0,
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

const readonlyRowStyle: React.CSSProperties = {
  display: 'flex', gap: 16, marginBottom: 12,
  padding: '8px 10px', background: 'var(--panel2)',
  border: '1px solid var(--border2)',
};

const readonlyLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
  color: 'var(--text-muted)', textTransform: 'uppercase',
};

const readonlyValueStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
};

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '4px 8px', outline: 'none',
};
