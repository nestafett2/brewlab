/**
 * Orders side panel — port of brewlab-desktop.html lines 14564–14685
 * (openOrdersPanel / renderOrdersList), redesigned for batch-level
 * grouping and bulk status actions.
 *
 * Slide-in fixed-right panel, 320 px wide. Grouped by `orderDate` — the
 * shared date every item created in one AddOrderModal batch carries
 * (PART 1 of the redesign). Each group header shows a derived status
 * badge (PENDING / IN PROGRESS / COMPLETE) and the expected-delivery
 * range across its items (delivery is per-item now, not shared).
 *
 * Bulk actions (checkbox per row, action bar fixed at panel bottom when
 * anything's checked): "N selected" + a pending/ordered/received
 * dropdown (defaults to 'ordered') + APPLY + ✕ (deselect all). APPLY
 * calls bulkUpdateOrders(ids, { status }); when the target status is
 * 'received' it also runs the same ledger-entry-creation logic
 * EditOrderModal used to run on its own not-received→received
 * transition (buildOrderLedgerEntry + applyLedgerInserts). That
 * transition no longer happens in EditOrderModal — status isn't
 * editable there anymore — so this is the one place new 'received'
 * ledger entries get created.
 *
 * Clicking a row (not its checkbox) still opens EditOrderModal, which
 * now only edits qty/supplier/delivery/notes.
 *
 * Auto-delete: on mount and whenever `orders` changes, any orderDate
 * group where every item is 'received' AND the most recent
 * delivery-or-orderDate across the group is more than 30 days old gets
 * deleted automatically (no confirm/undo — this is routine cleanup of
 * long-settled orders, not a destructive user action).
 *
 * Status colour:
 *   • pending  — text-muted
 *   • ordered  — amber
 *   • received — green
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { fmtKg, INV_UNITS } from '../../lib/units';
import EditOrderModal from './EditOrderModal';
import { applyLedgerInserts, buildOrderLedgerEntry } from './orderLedgerSync';
import type { LibBySection } from './orderForecast';
import type { LedgerEntry, OrderEntry } from '../../types';

interface Props {
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--text-muted)',
  ordered: 'var(--amber)',
  received: 'var(--green)',
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function OrdersPanel({ onClose }: Props) {
  const orders        = useStore(s => s.orders);
  const setOrders     = useStore(s => s.setOrders);
  const bulkUpdateOrders = useStore(s => s.bulkUpdateOrders);
  const deleteOrder   = useStore(s => s.deleteOrder);
  const ledgerData    = useStore(s => s.ledgerData);
  const setLedgerData = useStore(s => s.setLedgerData);
  const pushToast     = useStore(s => s.pushToast);
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Bulk-apply status dropdown — defaults to 'ordered' since that's the
  // most common action right after creating an order.
  const [bulkStatus, setBulkStatus] = useState<OrderEntry['status']>('ordered');

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Auto-delete fully-received order batches once they're 30+ days old.
  // Re-runs whenever `orders` changes (mount, hydration arriving late,
  // any edit) — idempotent, since a batch already deleted just won't be
  // found again on the next pass.
  useEffect(() => {
    const now = Date.now();
    const byDate: Record<string, OrderEntry[]> = {};
    for (const o of orders) {
      const key = o.orderDate || 'No Date';
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(o);
    }
    const idsToDelete: string[] = [];
    for (const items of Object.values(byDate)) {
      if (!items.every(o => o.status === 'received')) continue;
      const dates = items
        .map(o => o.delivery || o.orderDate)
        .filter((d): d is string => !!d)
        .sort();
      if (!dates.length) continue;
      const mostRecent = dates[dates.length - 1];
      const ts = new Date(mostRecent + 'T00:00:00').getTime();
      if (isFinite(ts) && now - ts > THIRTY_DAYS_MS) {
        idsToDelete.push(...items.map(o => o.id));
      }
    }
    idsToDelete.forEach(id => deleteOrder(id));
  }, [orders, deleteOrder]);

  const groups = useMemo(() => {
    const map: Record<string, OrderEntry[]> = {};
    for (const o of orders) {
      const key = o.orderDate || 'No Date';
      if (!map[key]) map[key] = [];
      map[key].push(o);
    }
    return map;
  }, [orders]);

  const sortedDates = useMemo(() => {
    return Object.keys(groups).sort((a, b) => {
      if (a === 'No Date') return 1;
      if (b === 'No Date') return -1;
      return b.localeCompare(a); // newest batch first
    });
  }, [groups]);

  const fmtGroupDate = (key: string): string => {
    if (key === 'No Date') return key;
    try {
      const d = new Date(key + 'T00:00:00');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch { return key; }
  };

  const groupStatus = (items: OrderEntry[]): { label: string; color: string } => {
    if (items.every(o => o.status === 'received')) return { label: 'COMPLETE', color: 'var(--green)' };
    if (items.every(o => o.status === 'pending'))  return { label: 'PENDING', color: 'var(--text-muted)' };
    return { label: 'IN PROGRESS', color: 'var(--amber)' };
  };

  const deliveryRange = (items: OrderEntry[]): string | null => {
    const dates = items.map(o => o.delivery).filter((d): d is string => !!d).sort();
    if (!dates.length) return null;
    const first = dates[0];
    const last = dates[dates.length - 1];
    return first === last ? fmtGroupDate(first) : `${fmtGroupDate(first)} – ${fmtGroupDate(last)}`;
  };

  const toggleChecked = (id: string) =>
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  const selectedIds = useMemo(() => Object.keys(checked).filter(id => checked[id]), [checked]);

  // Applies `bulkStatus` to every checked item. Setting 'received' also
  // runs the same ledger-entry-creation logic EditOrderModal used to run
  // on its own not-received→received transition (that transition no
  // longer happens there — status isn't editable in EditOrderModal
  // anymore — so this is the one remaining place new 'received' ledger
  // entries get created).
  const applyBulkStatus = () => {
    if (!selectedIds.length) return;

    if (bulkStatus !== 'received') {
      const beforeOrders = orders;
      bulkUpdateOrders(selectedIds, { status: bulkStatus });
      pushToast({
        message: `Marked ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''} ${bulkStatus}`,
        undo: () => setOrders(beforeOrders),
      });
      setChecked({});
      return;
    }

    const idSet = new Set(selectedIds);
    // Only build ledger entries for items not already received — avoids
    // double-inserting a ledger row if the selection includes items
    // that were already marked received earlier.
    const targets = orders.filter(o => idSet.has(o.id) && o.status !== 'received');
    const beforeOrders = orders;
    const beforeLedger = ledgerData;

    const libBySection: LibBySection = { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib };
    const inserts: { key: string; entry: LedgerEntry }[] = [];
    let noMatchCount = 0;
    for (const o of targets) {
      const built = buildOrderLedgerEntry(o, libBySection);
      if (built) inserts.push(built);
      else noMatchCount++;
    }
    if (inserts.length) {
      setLedgerData(applyLedgerInserts(ledgerData, inserts));
    }
    bulkUpdateOrders(selectedIds, { status: 'received' });

    const noMatchMsg = noMatchCount
      ? ` (${noMatchCount} not in library — no ledger entry)`
      : '';
    pushToast({
      message: `Marked ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''} received${noMatchMsg}`,
      undo: () => {
        setOrders(beforeOrders);
        setLedgerData(beforeLedger);
      },
    });
    setChecked({});
  };

  return (
    <>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>ORDERS</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={onClose}>✕</button>
        </div>
        <div style={{ ...listWrapStyle, paddingBottom: selectedIds.length ? 56 : 8 }}>
          {orders.length === 0 ? (
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9,
              color: 'var(--text-muted)', padding: 8,
            }}>No orders yet.</div>
          ) : sortedDates.map(dateKey => {
            const grp = groups[dateKey];
            const isCollapsed = !!collapsed[dateKey];
            const status = groupStatus(grp);
            const range = deliveryRange(grp);
            return (
              <div key={dateKey}>
                <div
                  onClick={() => setCollapsed(c => ({ ...c, [dateKey]: !c[dateKey] }))}
                  style={groupHeaderStyle}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1.5,
                        color: 'var(--amber)', textTransform: 'uppercase' as const,
                      }}>{fmtGroupDate(dateKey)}</span>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: 1,
                        color: status.color, textTransform: 'uppercase' as const,
                        border: `1px solid ${status.color}`, borderRadius: 3, padding: '1px 4px',
                      }}>{status.label}</span>
                    </div>
                    {range && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 1 }}>
                        Exp. {range}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)' }}>
                    {grp.length} item{grp.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {!isCollapsed && grp.map(o => {
                  const unit = INV_UNITS[o.type] || 'kg';
                  return (
                    <div
                      key={o.id}
                      onClick={() => setEditingId(o.id)}
                      style={orderItemStyle}
                      onMouseEnter={ev => (ev.currentTarget as HTMLDivElement).style.background = 'var(--panel2)'}
                      onMouseLeave={ev => (ev.currentTarget as HTMLDivElement).style.background = ''}
                    >
                      <input
                        type="checkbox"
                        checked={!!checked[o.id]}
                        onChange={() => toggleChecked(o.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ accentColor: 'var(--amber)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          textDecoration: o.status === 'received' ? 'line-through' : 'none',
                        }}>
                          {o.ingredient}{' '}
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            × {fmtKg(o.qty)} {unit}
                          </span>
                        </div>
                        <div style={metaLineStyle}>
                          {o.supplier && <span>{o.supplier}</span>}
                          {o.delivery && <span>Exp. {fmtGroupDate(o.delivery)}</span>}
                          <span style={{ color: STATUS_COLOR[o.status] || 'var(--text-muted)' }}>
                            ● {o.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {selectedIds.length > 0 && (
          <div style={bulkBarStyle}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
              {selectedIds.length} selected
            </span>
            <select
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value as OrderEntry['status'])}
              style={bulkSelectStyle}
              title="Mark as"
            >
              <option value="pending">pending</option>
              <option value="ordered">ordered</option>
              <option value="received">received</option>
            </select>
            <button
              className="btn sm primary"
              style={{ flexShrink: 0, fontSize: 9, padding: '4px 8px' }}
              onClick={applyBulkStatus}
            >APPLY</button>
            <button
              className="btn sm"
              style={{ flexShrink: 0, fontSize: 9, padding: '4px 6px' }}
              title="Deselect all"
              onClick={() => setChecked({})}
            >✕</button>
          </div>
        )}
      </div>

      {editingId && (
        <EditOrderModal
          orderId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'fixed', right: 0, top: 36, bottom: 0,
  width: 320,
  background: 'var(--panel)',
  borderLeft: '1px solid var(--border2)',
  zIndex: 50,
  display: 'flex', flexDirection: 'column',
  boxShadow: '-4px 0 12px rgba(0,0,0,0.3)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', borderBottom: '1px solid var(--border)',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
};

const listWrapStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 8,
};

const groupHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 6,
  padding: '6px 8px', cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
  background: 'var(--panel2)', userSelect: 'none' as const,
};

const orderItemStyle: React.CSSProperties = {
  padding: '6px 10px', borderBottom: '1px solid var(--border)',
  cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8,
};

const metaLineStyle: React.CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap',
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  marginTop: 3,
};

const bulkBarStyle: React.CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 0,
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 10px', borderTop: '1px solid var(--border2)',
  background: 'var(--panel2)', boxShadow: '0 -4px 12px rgba(0,0,0,0.2)',
};

const bulkSelectStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  background: 'var(--panel)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 6px', outline: 'none', borderRadius: 4,
};
