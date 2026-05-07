/**
 * Tax Ledger view — port of brewlab-desktop.html lines 15806–15867
 * (renderLedger) + 15787–15803 (populateLedgerIngredientSel,
 * currentLedgerKey).
 *
 * Per-ingredient drilldown with:
 *   • Ingredient picker (one-of from the active section's library).
 *   • Opening-balance start row.
 *   • Sorted entries (by date asc) with running balance.
 *   • Click a row to edit; "+ ADD ENTRY" button to add.
 *   • Live balance display in the toolbar above the table.
 *
 * Entry shape — high-stakes, NTA compliance:
 *   • IN  (got): receivedDate + supplier on the row.
 *   • OUT (used): usedDate + beer on the row.
 *   • date is the sort/display date (= receivedDate for IN, usedDate for OUT).
 *   • correctionNote present on rows from InventoryCorrectionModal.
 */

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '../../store';
import { fmtKg, INV_UNITS } from '../../lib/units';
import { runningBalances } from '../../lib/ledger';
import type { InvSection } from './inventoryShared';
import LedgerEntryModal from './LedgerEntryModal';

interface Props {
  section: InvSection;
}

export default function LedgerView({ section }: Props) {
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);
  const inventoryStock = useStore(s => s.inventoryStock);
  const ledgerData     = useStore(s => s.ledgerData);

  const data =
    section === 'malts' ? maltLib :
    section === 'hops'  ? hopLib :
    section === 'yeast' ? yeastLib : miscLib;

  // Selected ingredient — pick first if list is non-empty and nothing selected.
  const [selectedKey, setSelectedKey] = useState<string>('');
  useEffect(() => {
    if (!selectedKey && data.length > 0) {
      setSelectedKey(`${section}_${data[0].id}`);
    }
    // If switching section, clear selection so the picker re-seeds to first.
  }, [section, data, selectedKey]);

  // Reset selectedKey when the section changes — otherwise we keep a key
  // for the wrong library.
  useEffect(() => { setSelectedKey(''); }, [section]);

  // Add/Edit modal state.
  const [editing, setEditing] = useState<{ idx: number | null }>({ idx: null });
  const [modalOpen, setModalOpen] = useState(false);

  const entries = ledgerData[selectedKey] ?? [];
  // Sort by date asc, like HTML 15841. Map sorted index → original index
  // so the edit modal can write back to the right row.
  const sortedWithOriginalIdx = useMemo(() => {
    return entries
      .map((e, i) => ({ entry: e, origIdx: i }))
      .sort((a, b) => (a.entry.date || '').localeCompare(b.entry.date || ''));
  }, [entries]);
  const sortedEntries = sortedWithOriginalIdx.map(x => x.entry);
  const opening = parseFloat(String(inventoryStock[selectedKey] ?? 0)) || 0;
  const balances = runningBalances(opening, sortedEntries);
  const finalBalance = balances.length ? balances[balances.length - 1] : opening;

  const openAdd = () => { setEditing({ idx: null }); setModalOpen(true); };
  const openEdit = (sortedIdx: number) => {
    const origIdx = sortedWithOriginalIdx[sortedIdx]?.origIdx ?? null;
    if (origIdx == null) return;
    setEditing({ idx: origIdx });
    setModalOpen(true);
  };

  return (
    <div style={containerStyle}>
      {/* Ingredient selector + balance */}
      <div style={toolbarStyle}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1, color: 'var(--text-muted)' }}>
          INGREDIENT
        </span>
        <select
          value={selectedKey}
          onChange={e => setSelectedKey(e.target.value)}
          style={selectStyle}
        >
          {data.length === 0 ? (
            <option value="">— no library entries —</option>
          ) : data.map(e => (
            <option key={String(e.id)} value={`${section}_${e.id}`}>{e.name}</option>
          ))}
        </select>
        <button className="btn sm primary" onClick={openAdd} disabled={!selectedKey}>
          ＋ ADD ENTRY
        </button>
        <span style={{
          marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)',
        }}>
          {selectedKey ? `Current balance: ${fmtKg(finalBalance)} ${INV_UNITS[section]}` : ''}
        </span>
      </div>

      {/* Ledger table */}
      <div style={tableWrapStyle}>
        {!selectedKey ? (
          <div style={emptyStyle}>Select an ingredient above</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, minWidth: 100 }}>DATE</th>
                <th style={{ ...thStyle, minWidth: 70 }}>TYPE</th>
                <th style={{ ...thStyle, minWidth: 80, textAlign: 'right' }}>QTY (kg)</th>
                <th style={{ ...thStyle, minWidth: 160 }}>BEER / SUPPLIER / NOTE</th>
                <th style={{ ...thStyle, minWidth: 90 }}>RECEIVED DATE</th>
                <th style={{ ...thStyle, minWidth: 90 }}>USED DATE</th>
                <th style={{ ...thStyle, minWidth: 80, textAlign: 'right' }}>BALANCE</th>
                <th style={{ ...thStyle, minWidth: 40 }} />
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'var(--panel2)' }}>
                <td style={{ ...tdStyle, color: 'var(--text-dim)', fontWeight: 600 }}>START</td>
                <td style={tdStyle} />
                <td style={tdStyle} />
                <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11 }}>
                  Opening balance
                </td>
                <td style={tdStyle} />
                <td style={tdStyle} />
                <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'right' }}>{fmtKg(opening)}</td>
                <td style={tdStyle} />
              </tr>
              {sortedEntries.map((e, i) => {
                const isGot = !!e.got;
                const balance = balances[i];
                const balColor = balance < 0
                  ? '#c03030'
                  : opening > 0 && balance < opening * 0.15
                    ? '#f09420'
                    : 'var(--text)';
                const qty = isGot ? fmtKg(e.got) : fmtKg(e.used);
                const note = isGot ? (e.supplier || '') : (e.beer || '');
                const receivedDate = isGot ? (e.receivedDate || e.date) : '';
                const usedDate = !isGot ? (e.usedDate || e.date) : '';
                return (
                  <tr
                    key={i}
                    onClick={() => openEdit(i)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={ev => (ev.currentTarget as HTMLTableRowElement).style.background = 'var(--panel2)'}
                    onMouseLeave={ev => (ev.currentTarget as HTMLTableRowElement).style.background = ''}
                  >
                    <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: 9 }}>{e.date}</td>
                    <td style={tdStyle}>
                      <span style={{ color: isGot ? '#3a8a3a' : '#c05050', fontWeight: 700 }}>
                        {isGot ? 'IN' : 'OUT'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'right' }}>{qty}</td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {note}
                      {e.correctionNote && (
                        <span style={{ marginLeft: 6, fontSize: 8, color: 'var(--text-muted)' }}>
                          ({e.correctionNote})
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 9, color: 'var(--text-dim)' }}>{receivedDate}</td>
                    <td style={{ ...tdStyle, fontSize: 9, color: 'var(--text-dim)' }}>{usedDate}</td>
                    <td style={{ ...tdStyle, color: balColor, fontWeight: 500, textAlign: 'right' }}>
                      {fmtKg(balance)}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 9, color: 'var(--text-muted)' }}>✎</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && selectedKey && (
        <LedgerEntryModal
          ledgerKey={selectedKey}
          editIdx={editing.idx}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 12px', borderBottom: '1px solid var(--border)',
  background: 'var(--panel2)', flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '3px 8px', outline: 'none', minWidth: 200,
};

const tableWrapStyle: React.CSSProperties = {
  flex: 1, overflow: 'auto',
};

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8,
  textTransform: 'uppercase', color: 'var(--text-muted)',
  textAlign: 'left', padding: '6px 8px', fontWeight: 600,
  background: 'var(--panel)', borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
  padding: '4px 8px', borderBottom: '1px solid var(--border)',
};

const emptyStyle: React.CSSProperties = {
  padding: 20, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
};
