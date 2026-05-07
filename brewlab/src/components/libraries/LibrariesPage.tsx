/**
 * Libraries page — top-level component, replaces the LIBRARIES placeholder
 * in Desktop.tsx. Hosts the Malts / Hops / Yeast / Misc sub-sections.
 *
 * Mirrors the HTML layout at brewlab-desktop.html lines 2412–2450:
 *   • Left settings-nav (4 items)
 *   • Right content: toolbar (title + bulk bar + import/export/add) →
 *     search → table.
 *
 * Selection state and search are local (don't need to persist). The
 * active sub-section lives in the store as `librariesSection` so the
 * menu-bar items in Desktop.tsx can route directly to a section.
 *
 * CRUD wiring:
 *   • Add / Edit → opens LibraryEntryModal; save patches the entry,
 *     persists via setMaltLib / setHopLib / etc., and writes the
 *     opening-balance into bl_inv_stock when present.
 *   • Delete (single)  → confirm + remove from store
 *   • Delete (bulk)    → confirm + filter by libSelectedIds
 *   • Bulk Edit        → opens LibraryBulkEditModal; merges its diff
 *     into every selected entry.
 *   • Duplicate        → button on each row; appends "(copy)" to name.
 *
 * Import / export is routed through libraryImport.ts and
 * libraryExport.ts. The toolbar's Import button triggers a hidden
 * <input type=file accept=".xml,.beerxml,.bsmx"> and dispatches BSMX vs
 * BeerXML by filename / content sniffing per HTML 16972.
 *
 * Toast: HTML uses showUndoToast — not yet ported. Using window.alert
 * for confirmations and minimal feedback for now (flagged in plan).
 */

import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { MaltLib, HopLib, YeastLib, MiscLib } from '../../types';
import {
  LIB_HEADERS, LIB_FIELDS, LIB_TITLES,
  type LibSection, type LibEntry,
  sameId, downloadText,
} from './libraryShared';
import LibraryEntryModal from './LibraryEntryModal';
import LibraryBulkEditModal from './LibraryBulkEditModal';
import { importBeerXML, importBSMX, isBSMX } from './libraryImport';
import { exportSection } from './libraryExport';

export default function LibrariesPage() {
  const section            = useStore(s => s.librariesSection);
  const setSection         = useStore(s => s.setLibrariesSection);
  const maltLib            = useStore(s => s.maltLib);
  const hopLib             = useStore(s => s.hopLib);
  const yeastLib           = useStore(s => s.yeastLib);
  const miscLib            = useStore(s => s.miscLib);
  const setMaltLib         = useStore(s => s.setMaltLib);
  const setHopLib          = useStore(s => s.setHopLib);
  const setYeastLib        = useStore(s => s.setYeastLib);
  const setMiscLib         = useStore(s => s.setMiscLib);
  const inventoryStock     = useStore(s => s.inventoryStock);
  const setInventoryStock  = useStore(s => s.setInventoryStock);
  const libNextId          = useStore(s => s.libNextId);
  const setLibNextId       = useStore(s => s.setLibNextId);
  const pushToast          = useStore(s => s.pushToast);

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Last clicked row index for shift-click range selection.
  const lastClickedIdxRef = useRef<number>(-1);
  const [editing, setEditing] = useState<LibEntry | null>(null);
  const [adding,  setAdding]  = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Section data accessor / setter ────────────────────────────────
  const sectionData: LibEntry[] =
    section === 'malts' ? maltLib :
    section === 'hops'  ? hopLib :
    section === 'yeast' ? yeastLib : miscLib;

  const setSectionData = (next: LibEntry[]) => {
    if (section === 'malts') setMaltLib(next as MaltLib[]);
    else if (section === 'hops') setHopLib(next as HopLib[]);
    else if (section === 'yeast') setYeastLib(next as YeastLib[]);
    else setMiscLib(next as MiscLib[]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sectionData;
    const fields = LIB_FIELDS[section];
    return sectionData.filter(e =>
      fields.some(f => String((e as Record<string, unknown>)[f] ?? '').toLowerCase().includes(q)),
    );
  }, [sectionData, search, section]);

  // ── Switch section: clear selection + search (HTML 16633–16641) ──
  const switchSection = (s: LibSection) => {
    setSection(s);
    setSearch('');
    setSelectedIds(new Set());
    lastClickedIdxRef.current = -1;
  };

  // ── Selection (HTML libRowClick 14388) ────────────────────────────
  const handleRowClick = (entry: LibEntry, e: React.MouseEvent) => {
    const sid = String(entry.id);
    const idx = filtered.findIndex(x => sameId(x.id, entry.id));
    const next = new Set(selectedIds);
    if (e.shiftKey && lastClickedIdxRef.current >= 0 && idx >= 0) {
      const from = Math.min(lastClickedIdxRef.current, idx);
      const to   = Math.max(lastClickedIdxRef.current, idx);
      for (let i = from; i <= to; i++) next.add(String(filtered[i].id));
    } else {
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
    }
    if (idx >= 0) lastClickedIdxRef.current = idx;
    setSelectedIds(next);
  };

  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(filtered.map(e => String(e.id))));
    else setSelectedIds(new Set());
  };

  // ── CRUD ──────────────────────────────────────────────────────────
  const openAdd = () => { setAdding(true); setEditing(null); };
  const openEdit = (entry: LibEntry) => { setAdding(false); setEditing(entry); };

  const saveEntry = (patch: Partial<LibEntry>, openingStock: number | null) => {
    let nextList: LibEntry[];
    let entryId: string | number;
    if (editing) {
      // Update existing
      entryId = editing.id;
      nextList = sectionData.map(e =>
        sameId(e.id, editing.id) ? ({ ...e, ...patch, id: editing.id } as LibEntry) : e,
      );
    } else {
      // Insert new — bump the section's id counter.
      const newId = libNextId[section];
      entryId = newId;
      nextList = [...sectionData, ({ ...patch, id: newId } as LibEntry)];
      setLibNextId({ ...libNextId, [section]: newId + 1 });
    }
    setSectionData(nextList);
    // Opening balance — write into bl_inv_stock when present and non-null.
    if (openingStock != null) {
      const stockKey = `${section}_${entryId}`;
      const nextStock = { ...inventoryStock, [stockKey]: openingStock };
      setInventoryStock(nextStock);
    }
    setEditing(null);
    setAdding(false);
  };

  const deleteEntry = (entry: LibEntry) => {
    if (!window.confirm(`Delete ${entry.name || 'this entry'}?`)) return;
    // Snapshot the slices the action will touch — sectionData and the
    // local selectedIds set. Undo restores both.
    const beforeData = sectionData;
    const beforeSelected = new Set(selectedIds);
    setSectionData(sectionData.filter(e => !sameId(e.id, entry.id)));
    const next = new Set(selectedIds);
    next.delete(String(entry.id));
    setSelectedIds(next);
    pushToast({
      message: `Deleted "${entry.name || 'entry'}"`,
      undo: () => {
        setSectionData(beforeData);
        setSelectedIds(beforeSelected);
      },
    });
  };

  const duplicateEntry = (entry: LibEntry) => {
    // Snapshot sectionData AND libNextId — both change.
    const beforeData = sectionData;
    const beforeNextId = libNextId;
    const newId = libNextId[section];
    const copy = { ...entry, id: newId, name: `${entry.name} (copy)` } as LibEntry;
    setSectionData([...sectionData, copy]);
    setLibNextId({ ...libNextId, [section]: newId + 1 });
    pushToast({
      message: `Duplicated "${entry.name}"`,
      undo: () => {
        setSectionData(beforeData);
        setLibNextId(beforeNextId);
      },
    });
  };

  const bulkDelete = () => {
    const count = selectedIds.size;
    if (!count) return;
    if (!window.confirm(`Delete ${count} entries? This cannot be undone.`)) return;
    const beforeData = sectionData;
    const beforeSelected = new Set(selectedIds);
    setSectionData(sectionData.filter(e => !selectedIds.has(String(e.id))));
    setSelectedIds(new Set());
    pushToast({
      message: `Deleted ${count} entries`,
      undo: () => {
        setSectionData(beforeData);
        setSelectedIds(beforeSelected);
      },
    });
  };

  const bulkEditApply = (changes: Partial<LibEntry>) => {
    if (Object.keys(changes).length === 0) {
      setBulkEditing(false);
      return;
    }
    const next = sectionData.map(e =>
      selectedIds.has(String(e.id)) ? ({ ...e, ...changes } as LibEntry) : e,
    );
    setSectionData(next);
    setBulkEditing(false);
    setSelectedIds(new Set());
  };

  // ── Import / Export ───────────────────────────────────────────────
  const triggerImport = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      pushToast({ message: 'Could not read file: ' + (err as Error).message, variant: 'error' });
      return;
    }

    try {
      const counters = libNextId;
      const result = isBSMX(file.name, text)
        ? importBSMX(text, counters, inventoryStock)
        : importBeerXML(text, section, counters, inventoryStock);

      const total = result.counts.malts + result.counts.hops + result.counts.yeast + result.counts.misc;
      if (total === 0) {
        pushToast({
          message: 'No matching entries found in this file (need FERMENTABLE / HOP / YEAST / MISC elements, or a BeerSmith Ingredients export).',
          variant: 'error',
        });
        return;
      }

      // Merge new entries into existing libs.
      if (result.newEntries.malts.length) setMaltLib([...maltLib, ...result.newEntries.malts]);
      if (result.newEntries.hops.length)  setHopLib([...hopLib,  ...result.newEntries.hops]);
      if (result.newEntries.yeast.length) setYeastLib([...yeastLib, ...result.newEntries.yeast]);
      if (result.newEntries.misc.length)  setMiscLib([...miscLib,  ...result.newEntries.misc]);

      setLibNextId(result.nextId);
      setInventoryStock(result.stockAdditions);

      // Switch to the section that received entries.
      if (result.detectedSection) {
        switchSection(result.detectedSection);
      }

      const parts: string[] = [];
      if (result.counts.malts) parts.push(`${result.counts.malts} grains`);
      if (result.counts.hops)  parts.push(`${result.counts.hops} hops`);
      if (result.counts.yeast) parts.push(`${result.counts.yeast} yeasts`);
      if (result.counts.misc)  parts.push(`${result.counts.misc} misc`);
      // Imports are info-only — no undo per architecture decision (would
      // require tracking which library entries each file created and
      // reversing across sections + libNextId + inventoryStock; not worth
      // the complexity for a low-frequency action).
      pushToast({ message: 'Imported ' + parts.join(', '), variant: 'success' });
    } catch (err) {
      pushToast({ message: 'Error parsing file: ' + (err as Error).message, variant: 'error' });
    } finally {
      // Reset for next click
      e.target.value = '';
    }
  };

  const exportNow = () => {
    if (sectionData.length === 0) {
      pushToast({ message: 'Library is empty — nothing to export.', variant: 'info' });
      return;
    }
    const xml = exportSection(section, { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib });
    downloadText(xml, `brewlab_${section}_library.xml`, 'application/xml');
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      {/* LEFT NAV */}
      <div style={navStyle}>
        {(['malts', 'hops', 'yeast', 'misc'] as LibSection[]).map(s => (
          <div
            key={s}
            className={`settings-nav-item ${section === s ? 'active' : ''}`}
            onClick={() => switchSection(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </div>
        ))}
      </div>

      {/* RIGHT CONTENT */}
      <div style={contentStyle}>
        {/* Toolbar */}
        <div style={toolbarWrapStyle}>
          <div style={toolbarStyle}>
            <span style={titleStyle}>{LIB_TITLES[section]}</span>
            {selectedIds.size > 0 && (
              <div style={bulkBarStyle}>
                <span style={bulkCountStyle}>{selectedIds.size} selected</span>
                <button className="btn sm" onClick={() => setBulkEditing(true)}>✎ Bulk Edit</button>
                <button className="btn sm danger" onClick={bulkDelete}>✕ Delete</button>
                <button className="btn sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
              </div>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn" onClick={triggerImport}>⬆ Import BeerXML</button>
              <button className="btn" onClick={exportNow}>⬇ Export BeerXML</button>
              <button className="btn primary" onClick={openAdd}>＋ Add Entry</button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,.beerxml,.bsmx"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
          </div>
        </div>

        {/* Search */}
        <div style={searchWrapStyle}>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={searchInputStyle}
          />
        </div>

        {/* Table */}
        <div style={tableWrapStyle}>
          <LibraryTable
            section={section}
            data={filtered}
            allSectionData={sectionData}
            selectedIds={selectedIds}
            onRowClick={handleRowClick}
            onToggleAll={toggleAll}
            onEdit={openEdit}
            onDelete={deleteEntry}
            onDuplicate={duplicateEntry}
          />
        </div>
      </div>

      {(adding || editing) && (
        <LibraryEntryModal
          section={section}
          entry={editing}
          onSave={saveEntry}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}

      {bulkEditing && (
        <LibraryBulkEditModal
          section={section}
          selectedCount={selectedIds.size}
          onSave={bulkEditApply}
          onClose={() => setBulkEditing(false)}
        />
      )}
    </div>
  );
}

// ─── Inline table (kept here so it can read selection state directly) ─

interface TableProps {
  section: LibSection;
  data: LibEntry[];
  allSectionData: LibEntry[];
  selectedIds: Set<string>;
  onRowClick: (e: LibEntry, ev: React.MouseEvent) => void;
  onToggleAll: (checked: boolean) => void;
  onEdit: (e: LibEntry) => void;
  onDelete: (e: LibEntry) => void;
  onDuplicate: (e: LibEntry) => void;
}

function LibraryTable({
  section, data, selectedIds,
  onRowClick, onToggleAll, onEdit, onDelete, onDuplicate,
}: TableProps) {
  const headers = LIB_HEADERS[section];
  const fields  = LIB_FIELDS[section];
  const allChecked = data.length > 0 && data.every(e => selectedIds.has(String(e.id)));

  return (
    <table style={{ width: '100%', userSelect: 'none', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>
          <th style={{ ...thStyle, width: 28 }}>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={e => onToggleAll(e.target.checked)}
              style={{ accentColor: 'var(--amber)', cursor: 'pointer' }}
            />
          </th>
          <th style={{ ...thStyle, width: 24 }}>#</th>
          {headers.map(h => <th key={h} style={thStyle}>{h}</th>)}
          <th style={{ ...thStyle, width: 80 }} />
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={headers.length + 3} style={emptyCellStyle}>
              NO ENTRIES — ADD ONE OR IMPORT A BEERXML FILE
            </td>
          </tr>
        ) : data.map((entry, idx) => {
          const sid = String(entry.id);
          const selected = selectedIds.has(sid);
          return (
            <tr
              key={sid}
              data-entry-id={sid}
              style={{
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selected ? 'rgba(255,176,0,0.08)' : undefined,
                transition: 'background 0.08s',
              }}
              onClick={e => {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'BUTTON' || tag === 'INPUT') return;
                onRowClick(entry, e);
              }}
              onDoubleClick={e => {
                if ((e.target as HTMLElement).tagName === 'BUTTON') return;
                onEdit(entry);
              }}
              onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(0,0,0,0.05)'; }}
              onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
            >
              <td style={{ ...tdStyle, padding: '2px 8px' }}>
                <input
                  type="checkbox"
                  checked={selected}
                  readOnly
                  style={{ accentColor: 'var(--amber)', pointerEvents: 'none', cursor: 'pointer' }}
                />
              </td>
              <td style={{ ...tdStyle, color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 9 }}>
                {idx + 1}
              </td>
              {fields.map(f => {
                const raw = (entry as Record<string, unknown>)[f];
                let v: string;
                if (raw == null || raw === '') v = '—';
                else if (typeof raw === 'boolean') v = raw ? '✓' : '—';
                else v = String(raw);
                if ((f === 'aa' || f === 'beta') && v !== '—') {
                  const n = parseFloat(v);
                  if (isFinite(n)) v = n.toFixed(1).replace(/\.0$/, '');
                }
                const isNotes = f === 'notes';
                const isName  = f === 'name';
                return (
                  <td
                    key={f}
                    style={{
                      ...tdStyle,
                      maxWidth: isNotes ? 180 : isName ? 220 : undefined,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                    }}
                    title={String(v)}
                  >
                    {v}
                  </td>
                );
              })}
              <td style={{ ...tdStyle, padding: '2px 6px', whiteSpace: 'nowrap' as const }}>
                <button
                  className="btn sm"
                  onClick={e => { e.stopPropagation(); onEdit(entry); }}
                  style={{ marginRight: 3 }}
                >Edit</button>
                <button
                  className="btn sm"
                  onClick={e => { e.stopPropagation(); onDuplicate(entry); }}
                  style={{ marginRight: 3 }}
                  title="Duplicate"
                >⧉</button>
                <button
                  className="btn sm danger"
                  onClick={e => { e.stopPropagation(); onDelete(entry); }}
                >✕</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  display: 'flex', flex: 1, overflow: 'hidden',
};

const navStyle: React.CSSProperties = {
  width: 160, background: 'var(--panel)', borderRight: '1px solid var(--border)',
  display: 'flex', flexDirection: 'column', flexShrink: 0,
  padding: '8px 0',
};

const contentStyle: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  alignItems: 'center',
};

const toolbarWrapStyle: React.CSSProperties = {
  width: '100%', maxWidth: 1100, alignSelf: 'center',
  background: 'var(--panel)', borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const toolbarStyle: React.CSSProperties = {
  padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8,
  boxSizing: 'border-box',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--amber)',
};

const bulkBarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'rgba(255,176,0,0.1)', border: '1px solid rgba(255,176,0,0.3)',
  borderRadius: 3, padding: '3px 10px',
};

const bulkCountStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', letterSpacing: 1,
};

const searchWrapStyle: React.CSSProperties = {
  width: '100%', maxWidth: 1100, alignSelf: 'center',
  background: 'var(--panel2)', borderBottom: '1px solid var(--border)',
  padding: '6px 12px', flexShrink: 0, boxSizing: 'border-box',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12,
  padding: '5px 10px', outline: 'none',
};

const tableWrapStyle: React.CSSProperties = {
  flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center',
  overflowY: 'auto',
};

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8,
  textTransform: 'uppercase', color: 'var(--text-muted)',
  textAlign: 'left', padding: '6px 8px', fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
  padding: '4px 8px',
};

const emptyCellStyle: React.CSSProperties = {
  textAlign: 'center', padding: 24,
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  letterSpacing: 1,
};
