/**
 * Inventory page — top-level composition. Replaces the LIBRARIES-style
 * placeholder for `activeTab === 'inventory'` in Desktop.tsx.
 *
 * Layout (HTML 3210–3268):
 *   • Toolbar: section nav (MALTS / HOPS / YEAST / ADJUNCTS / 🧫 HARVESTED),
 *     view toggle (CURRENT / TAX LEDGER), IN STOCK ONLY, EXPORT dropdown,
 *     ⚖ CORRECTION button.
 *   • Body: one of three views — current stock table, ledger view,
 *     harvested yeast view.
 *
 * Section + view state lives locally (per-device). Modals (LedgerExport,
 * Correction, LibraryEntry, etc.) are rendered conditionally here so they
 * can read live store state.
 *
 * Library entry edit/delete: when a row's ✕ is clicked or it's
 * double-clicked, we route the entry through the existing
 * LibraryEntryModal so all the same fields are editable and the
 * On Hand display is live.
 */

import { useState } from 'react';
import { useStore } from '../../store';
import type { LibEntry } from '../libraries/libraryShared';
import { sameId } from '../libraries/libraryShared';
import LibraryEntryModal from '../libraries/LibraryEntryModal';
import CurrentStockTable from './CurrentStockTable';
import LedgerView from './LedgerView';
import LedgerExportModal from './LedgerExportModal';
import InventoryCorrectionModal from './InventoryCorrectionModal';
import HarvestedYeastView from './HarvestedYeastView';
import type { InvSection } from './inventoryShared';
import { INV_SECTION_LABELS } from '../../lib/units';
import type { MaltLib, HopLib, YeastLib, MiscLib } from '../../types';
import { exportInventoryCurrentXlsx } from '../orders/orderXlsx';

type ViewMode = 'current' | 'ledger';

export default function InventoryPage() {
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);
  const setMaltLib  = useStore(s => s.setMaltLib);
  const setHopLib   = useStore(s => s.setHopLib);
  const setYeastLib = useStore(s => s.setYeastLib);
  const setMiscLib  = useStore(s => s.setMiscLib);
  const pushToast   = useStore(s => s.pushToast);

  const [section, setSection]   = useState<InvSection>('malts');
  const [view, setView]         = useState<ViewMode>('current');
  const [showHarvested, setShowHarvested] = useState(false);
  const [inStockOnly, setInStockOnly]     = useState(false);
  const [exportMenu, setExportMenu]       = useState(false);
  const [exportModal, setExportModal]     = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<{ section: InvSection; entry: LibEntry } | null>(null);

  const sectionData =
    section === 'malts' ? maltLib :
    section === 'hops'  ? hopLib :
    section === 'yeast' ? yeastLib : miscLib;

  const setSectionData = (sec: InvSection, next: LibEntry[]) => {
    if (sec === 'malts') setMaltLib(next as MaltLib[]);
    else if (sec === 'hops') setHopLib(next as HopLib[]);
    else if (sec === 'yeast') setYeastLib(next as YeastLib[]);
    else setMiscLib(next as MiscLib[]);
  };

  const openEdit = (entry: LibEntry) => {
    setEditEntry({ section, entry });
  };
  const handleDelete = (entry: LibEntry) => {
    // Snapshot only sectionData. Pre-existing behaviour: this delete
    // does NOT touch inventoryStock or ledgerData (potential orphan
    // stock entries are out of scope for this retrofit). Undo restores
    // exactly what was changed.
    const before = sectionData;
    setSectionData(section, sectionData.filter(e => !sameId(e.id, entry.id)));
    pushToast({
      message: `Deleted "${entry.name}"`,
      undo: () => setSectionData(section, before),
    });
  };

  // Save handler when LibraryEntryModal commits an edit. Mirrors
  // LibrariesPage's saveEntry — same upsert + opening-balance write.
  const inventoryStock    = useStore(s => s.inventoryStock);
  const setInventoryStock = useStore(s => s.setInventoryStock);
  const ledgerData        = useStore(s => s.ledgerData);
  const settings          = useStore(s => s.settings);
  const saveEdit = (patch: Partial<LibEntry>, openingStock: number | null) => {
    if (!editEntry) return;
    const { section: sec, entry } = editEntry;
    const list =
      sec === 'malts' ? maltLib :
      sec === 'hops'  ? hopLib :
      sec === 'yeast' ? yeastLib : miscLib;
    const next = list.map(e => sameId(e.id, entry.id) ? ({ ...e, ...patch, id: entry.id } as LibEntry) : e);
    setSectionData(sec, next);
    if (openingStock != null) {
      const stockKey = `${sec}_${entry.id}`;
      const nextStock = { ...inventoryStock };
      if (openingStock === 0) delete nextStock[stockKey];
      else nextStock[stockKey] = openingStock;
      setInventoryStock(nextStock);
    }
    setEditEntry(null);
  };

  return (
    <div style={pageStyle}>
      {/* TOOLBAR */}
      <div style={toolbarStyle}>
        <span style={titleStyle}>INVENTORY</span>
        <select
          value={showHarvested ? 'harvested' : section}
          onChange={e => {
            const v = e.target.value;
            if (v === 'harvested') {
              setShowHarvested(true);
            } else {
              setShowHarvested(false);
              setSection(v as InvSection);
            }
          }}
          style={{ ...sectionSelectStyle, marginLeft: 14 }}
        >
          <option value="malts">MALTS</option>
          <option value="hops">HOPS</option>
          <option value="yeast">YEAST</option>
          <option value="misc">ADJUNCTS</option>
          <option value="harvested">🧫 HARVESTED</option>
        </select>

        {!showHarvested && (
          <>
            {/* View toggle */}
            <button
              className={`btn sm ${view === 'ledger' ? 'active' : ''}`}
              onClick={() => setView(v => v === 'ledger' ? 'current' : 'ledger')}
              style={{ marginLeft: 16 }}
            >TAX LEDGER</button>

            {view === 'current' && (
              <button
                className={`btn sm ${inStockOnly ? 'active' : ''}`}
                onClick={() => setInStockOnly(v => !v)}
                style={{ marginLeft: 8 }}
                title="Show only ingredients with stock on hand"
              >IN STOCK ONLY</button>
            )}
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
          {!showHarvested && (
            <>
              <div style={{ position: 'relative' }}>
                <button
                  className="btn sm"
                  onClick={() => setExportMenu(v => !v)}
                  title="Export options"
                >⬇ EXPORT ▾</button>
                {exportMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 60 }}
                      onClick={() => setExportMenu(false)}
                    />
                    <div style={exportMenuStyle}>
                      <div
                        style={ctxItemStyle}
                        onClick={() => { setExportMenu(false); setExportModal(true); }}
                      >📊 Export Tax Ledger XLSX</div>
                      <div
                        style={ctxItemStyle}
                        onClick={() => {
                          setExportMenu(false);
                          exportInventoryCurrentXlsx({
                            section,
                            libBySection: { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib },
                            inventoryStock,
                            ledgerData,
                            breweryName: settings.breweryName,
                          });
                        }}
                      >📋 Export Current Page XLSX</div>
                    </div>
                  </>
                )}
              </div>
              <button
                className="btn sm"
                onClick={() => setCorrectionOpen(true)}
                title="Reconcile physical vs digital inventory"
              >⚖ CORRECTION</button>
            </>
          )}
        </div>
      </div>

      {/* BODY */}
      {showHarvested ? (
        <HarvestedYeastView />
      ) : view === 'current' ? (
        <CurrentStockTable
          section={section}
          inStockOnly={inStockOnly}
          onEditEntry={openEdit}
          onDeleteEntry={handleDelete}
        />
      ) : (
        <LedgerView section={section} />
      )}

      {/* MODALS */}
      {exportModal && (
        <LedgerExportModal
          defaultSection={section}
          onClose={() => setExportModal(false)}
        />
      )}
      {correctionOpen && (
        <InventoryCorrectionModal
          section={section}
          onClose={() => setCorrectionOpen(false)}
        />
      )}
      {editEntry && (
        <LibraryEntryModal
          section={editEntry.section}
          entry={editEntry.entry}
          onSave={saveEdit}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  );
}

// `INV_SECTION_LABELS` re-exported from units; keep the import alive
// for any future toolbar tweaks (e.g. section dropdown labels).
void INV_SECTION_LABELS;

const pageStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
  maxWidth: 1024, margin: '0 auto', width: '100%',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 16px', borderBottom: '1px solid var(--border)',
  background: 'var(--panel)', flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, color: 'var(--amber)',
};

const sectionSelectStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10,
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', padding: '3px 8px',
};

const exportMenuStyle: React.CSSProperties = {
  position: 'absolute', right: 0, top: '100%', marginTop: 2,
  background: 'var(--panel)', border: '1px solid var(--border2)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 61,
  minWidth: 220,
};

const ctxItemStyle: React.CSSProperties = {
  padding: '7px 12px', cursor: 'pointer',
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
};
