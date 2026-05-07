/**
 * Orders side panel — port of brewlab-desktop.html lines 14564–14685
 * (openOrdersPanel / renderOrdersList).
 *
 * Slide-in fixed-right panel, 320 px wide. Date-grouped (delivery
 * date, falling back to orderDate, then "No Date") collapsible list.
 * Each row click opens EditOrderModal — HTML had `openEditOrderModal`
 * referenced but never defined; we fill that gap with a real edit
 * modal that lets the brewer change qty / supplier / delivery /
 * status / notes / delete.
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

interface Props {
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--text-muted)',
  ordered: 'var(--amber)',
  received: 'var(--green)',
};

export default function OrdersPanel({ onClose }: Props) {
  const orders = useStore(s => s.orders);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const map: Record<string, typeof orders> = {};
    for (const o of orders) {
      const key = o.delivery || o.orderDate || 'No Date';
      if (!map[key]) map[key] = [];
      map[key].push(o);
    }
    return map;
  }, [orders]);

  const sortedDates = useMemo(() => {
    return Object.keys(groups).sort((a, b) => {
      if (a === 'No Date') return 1;
      if (b === 'No Date') return -1;
      return a.localeCompare(b);
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

  return (
    <>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>ORDERS</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={onClose}>✕</button>
        </div>
        <div style={listWrapStyle}>
          {orders.length === 0 ? (
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9,
              color: 'var(--text-muted)', padding: 8,
            }}>No orders yet.</div>
          ) : sortedDates.map(dateKey => {
            const grp = groups[dateKey];
            const isCollapsed = !!collapsed[dateKey];
            return (
              <div key={dateKey}>
                <div
                  onClick={() => setCollapsed(c => ({ ...c, [dateKey]: !c[dateKey] }))}
                  style={groupHeaderStyle}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1.5,
                    color: 'var(--amber)', textTransform: 'uppercase' as const, flex: 1,
                  }}>{fmtGroupDate(dateKey)}</span>
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
                      <div style={{
                        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {o.ingredient}{' '}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                          × {fmtKg(o.qty)} {unit}
                        </span>
                      </div>
                      <div style={metaLineStyle}>
                        <span>{o.supplier || '—'}</span>
                        <span style={{ color: STATUS_COLOR[o.status] || 'var(--text-muted)' }}>
                          {o.status}
                        </span>
                        {o.notes && <span>{o.notes}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
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
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 8px', cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
  background: 'var(--panel2)', userSelect: 'none' as const,
};

const orderItemStyle: React.CSSProperties = {
  padding: '6px 10px', borderBottom: '1px solid var(--border)',
  cursor: 'pointer', display: 'flex', flexDirection: 'column' as const, gap: 3,
};

const metaLineStyle: React.CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap',
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
};
