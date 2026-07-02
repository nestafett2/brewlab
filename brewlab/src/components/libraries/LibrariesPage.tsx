/**
 * Libraries page — top-level component, replaces the LIBRARIES placeholder
 * in Desktop.tsx. Hosts the Malts / Hops / Yeast / Misc sub-sections.
 *
 * NOTE: This page deviates from the HTML reference. The HTML uses
 * per-row Edit/Duplicate/Delete buttons + a leftmost master/per-row
 * checkbox column. This rebuild instead uses a BeerSmith-style
 * click-to-select / right-click-for-actions pattern with a fixed
 * detail pane below the table. Sync layer (lsSet via setMaltLib /
 * setHopLib / setYeastLib / setMiscLib) is unchanged.
 *
 * Selection model — file-explorer style:
 *   • click          → replace selection with {row}, set anchor
 *   • shift+click    → range-select from anchor to clicked row
 *   • ctrl/cmd+click → toggle row in/out of selection, update anchor
 *   • dblclick       → open Edit modal regardless of multi-state
 *   • right-click    → context menu (single OR bulk-delete)
 *
 * Touch: Tablet/Mobile do NOT import this file (verified). Right-click
 * + ctrl/shift+click are desktop-only and don't need fallbacks here.
 *
 * CRUD wiring is unchanged from before:
 *   • Add / Edit → opens LibraryEntryModal; save patches the entry,
 *     persists via setMaltLib / setHopLib / etc., and writes the
 *     opening-balance into bl_inv_stock when present.
 *   • Delete (single)  → confirm + remove from store
 *   • Delete (bulk)    → confirm + filter by libSelectedIds
 *   • Bulk Edit        → opens LibraryBulkEditModal; merges its diff
 *     into every selected entry. Reachable from the inline bulk
 *     toolbar that appears next to the title when items are selected.
 *   • Duplicate        → context-menu item; appends "(copy)" to name.
 *
 * Import / export is routed through libraryImport.ts and
 * libraryExport.ts. The toolbar's Import button triggers a hidden
 * <input type=file accept=".xml,.beerxml,.bsmx"> and dispatches BSMX vs
 * BeerXML by filename / content sniffing per HTML 16972.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { MaltLib, HopLib, YeastLib, MiscLib } from '../../types';
import {
  LIB_HEADERS, LIB_FIELDS, LIB_FIELD_DEFS, LIB_TITLES,
  type LibSection, type LibEntry, type FieldDef,
  sameId, downloadText,
} from './libraryShared';
import LibraryEntryModal from './LibraryEntryModal';
import LibraryBulkEditModal from './LibraryBulkEditModal';
import { importBeerXML, importBSMX, isBSMX } from './libraryImport';
import { fmtNum } from '../../lib/format';
import { exportSection } from './libraryExport';

type CtxMenu =
  | { kind: 'single'; x: number; y: number; entry: LibEntry }
  | { kind: 'bulk';   x: number; y: number; ids: string[] }
  | null;

// Field keys that should sort numerically. Lot # (`lot_num`) is text —
// real-world lot numbers are alphanumeric (e.g. 'UL 9/25'), so numeric
// sort would NaN-cluster them at the bottom.
const NUMERIC_FIELDS: ReadonlySet<string> = new Set([
  'aa', 'beta', 'ebc', 'price', 'atten',
  'temp_min', 'temp_max', 'dbfg', 'max_pct',
  'moisture', 'diastatic_power', 'protein',
  'yield_pct', 'potential',
]);

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
  // Anchor row id for shift-click range selection (null = none). ID-
  // based rather than index-based so sorting/filtering doesn't strand
  // the anchor at a stale row position. Mirrors FolderTree's pattern.
  const anchorIdRef = useRef<string | null>(null);
  const [editing, setEditing] = useState<LibEntry | null>(null);
  const [adding,  setAdding]  = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  // Transient sort — null field = unsorted (insertion order).
  const [sort, setSort] = useState<{ field: string | null; dir: 1 | -1 }>({ field: null, dir: 1 });
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
      fields.some(f => String((e as unknown as Record<string, unknown>)[f] ?? '').toLowerCase().includes(q)),
    );
  }, [sectionData, search, section]);

  // Display order — sort applied to a copy of `filtered`. Empty /
  // non-finite values land at the end regardless of direction.
  const displayed = useMemo(() => {
    if (!sort.field) return filtered;
    const field = sort.field;
    const isNumeric = NUMERIC_FIELDS.has(field);
    const dir = sort.dir;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[field];
      const bv = (b as unknown as Record<string, unknown>)[field];
      const aEmpty = av == null || av === '' || (isNumeric && !isFinite(parseFloat(String(av))));
      const bEmpty = bv == null || bv === '' || (isNumeric && !isFinite(parseFloat(String(bv))));
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;       // empty rows always last
      if (bEmpty) return -1;
      if (isNumeric) {
        const an = parseFloat(String(av));
        const bn = parseFloat(String(bv));
        return (an - bn) * dir;
      }
      return String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * dir;
    });
    return copy;
  }, [filtered, sort]);

  const handleHeaderClick = (field: string) => {
    setSort(prev => prev.field === field
      ? { field, dir: (prev.dir === 1 ? -1 : 1) as 1 | -1 }
      : { field, dir: 1 });
  };

  // ── Switch section: clear selection + search (HTML 16633–16641) ──
  const switchSection = (s: LibSection) => {
    setSection(s);
    setSearch('');
    setSelectedIds(new Set());
    anchorIdRef.current = null;
    setCtxMenu(null);
    setSort({ field: null, dir: 1 });
  };

  // ── Selection — file-explorer semantics ────────────────────────────
  // Anchor is by ID; range computed against the current display order.
  const handleRowClick = (entry: LibEntry, e: React.MouseEvent) => {
    const sid = String(entry.id);
    const idx = displayed.findIndex(x => sameId(x.id, entry.id));
    const ctrl  = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (shift && anchorIdRef.current && idx >= 0) {
      const anchorIdx = displayed.findIndex(x => sameId(x.id, anchorIdRef.current!));
      if (anchorIdx >= 0) {
        const from = Math.min(anchorIdx, idx);
        const to   = Math.max(anchorIdx, idx);
        const range = new Set<string>();
        for (let i = from; i <= to; i++) range.add(String(displayed[i].id));
        // Plain shift replaces; ctrl+shift unions with existing selection.
        setSelectedIds(ctrl ? new Set([...selectedIds, ...range]) : range);
        // Anchor doesn't move on shift (file-explorer convention).
        return;
      }
    }
    if (ctrl) {
      const next = new Set(selectedIds);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      setSelectedIds(next);
      anchorIdRef.current = sid;
      return;
    }
    // Plain click — replace selection, move anchor.
    setSelectedIds(new Set([sid]));
    anchorIdRef.current = sid;
  };

  // ── Right-click (Pattern A — file-explorer):
  //   Selected & multi → bulk menu, selection unchanged
  //   Otherwise        → replace selection with {id}, single menu
  const handleRowContextMenu = (entry: LibEntry, e: React.MouseEvent) => {
    e.preventDefault();
    const sid = String(entry.id);
    if (selectedIds.has(sid) && selectedIds.size > 1) {
      setCtxMenu({ kind: 'bulk', x: e.pageX, y: e.pageY, ids: [...selectedIds] });
      return;
    }
    setSelectedIds(new Set([sid]));
    anchorIdRef.current = sid;
    setCtxMenu({ kind: 'single', x: e.pageX, y: e.pageY, entry });
  };

  // Close context menu on outside-mousedown / Escape (mirrors Desktop.tsx
  // recipeCtxMenu pattern). Defer the mousedown listener so the right-
  // click that opened the menu doesn't immediately close it.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

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

  const bulkDelete = (ids?: string[]) => {
    const targetIds = ids ?? [...selectedIds];
    const count = targetIds.length;
    if (!count) return;
    if (!window.confirm(`Delete ${count} entries? This cannot be undone.`)) return;
    const idSet = new Set(targetIds);
    const beforeData = sectionData;
    const beforeSelected = new Set(selectedIds);
    setSectionData(sectionData.filter(e => !idSet.has(String(e.id))));
    setSelectedIds(new Set());
    pushToast({
      message: `Deleted ${count} entries`,
      undo: () => {
        setSectionData(beforeData);
        setSelectedIds(beforeSelected);
      },
    });
  };

  const bulkDuplicate = (ids?: string[]) => {
    const targetIds = ids ?? [...selectedIds];
    if (!targetIds.length) return;
    const idSet = new Set(targetIds);
    const beforeData = sectionData;
    const beforeNextId = libNextId;
    let counter = libNextId[section];
    const copies: LibEntry[] = sectionData
      .filter(e => idSet.has(String(e.id)))
      .map(e => ({ ...e, id: counter++, name: `${e.name} (copy)` } as LibEntry));
    if (!copies.length) return;
    setSectionData([...sectionData, ...copies]);
    setLibNextId({ ...libNextId, [section]: counter });
    pushToast({
      message: `Duplicated ${copies.length} entries`,
      undo: () => {
        setSectionData(beforeData);
        setLibNextId(beforeNextId);
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
      pushToast({ message: 'Imported ' + parts.join(', '), variant: 'success' });
    } catch (err) {
      pushToast({ message: 'Error parsing file: ' + (err as Error).message, variant: 'error' });
    } finally {
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

  // ── Detail pane: resolve the single selected entry, if any ────────
  const selectedEntries = useMemo(
    () => sectionData.filter(e => selectedIds.has(String(e.id))),
    [sectionData, selectedIds],
  );
  const singleSelected = selectedEntries.length === 1 ? selectedEntries[0] : null;

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
                <button className="btn sm danger" onClick={() => bulkDelete()}>✕ Delete</button>
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
            data={displayed}
            selectedIds={selectedIds}
            sort={sort}
            onSort={handleHeaderClick}
            onRowClick={handleRowClick}
            onRowContextMenu={handleRowContextMenu}
            onEdit={openEdit}
          />
        </div>

        {/* Detail pane */}
        <DetailPane
          section={section}
          selectedCount={selectedIds.size}
          entry={singleSelected}
        />
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

      {/* Context menu — single-row variant. */}
      {ctxMenu?.kind === 'single' && (
        <div
          className="ctx-menu open"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="ctx-item" onClick={() => { openEdit(ctxMenu.entry); setCtxMenu(null); }}>
            ✎ Edit
          </div>
          <div className="ctx-item" onClick={() => { duplicateEntry(ctxMenu.entry); setCtxMenu(null); }}>
            ⧉ Duplicate
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item danger" onClick={() => { deleteEntry(ctxMenu.entry); setCtxMenu(null); }}>
            ✕ Delete
          </div>
        </div>
      )}

      {/* Context menu — bulk variant (right-click on a row that's
          part of a multi-selection). Edit + Duplicate + Delete; same
          actions reachable from the inline bulk toolbar. */}
      {ctxMenu?.kind === 'bulk' && (
        <div
          className="ctx-menu open"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="ctx-item" onClick={() => { setBulkEditing(true); setCtxMenu(null); }}>
            ✎ Bulk Edit ({ctxMenu.ids.length} items)
          </div>
          <div className="ctx-item" onClick={() => { bulkDuplicate(ctxMenu.ids); setCtxMenu(null); }}>
            ⧉ Duplicate ({ctxMenu.ids.length} items)
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item danger" onClick={() => { bulkDelete(ctxMenu.ids); setCtxMenu(null); }}>
            ✕ Delete {ctxMenu.ids.length} items
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline table ───────────────────────────────────────────────────

interface TableProps {
  section: LibSection;
  data: LibEntry[];
  selectedIds: Set<string>;
  sort: { field: string | null; dir: 1 | -1 };
  onSort: (field: string) => void;
  onRowClick: (e: LibEntry, ev: React.MouseEvent) => void;
  onRowContextMenu: (e: LibEntry, ev: React.MouseEvent) => void;
  onEdit: (e: LibEntry) => void;
}

function LibraryTable({
  section, data, selectedIds, sort, onSort,
  onRowClick, onRowContextMenu, onEdit,
}: TableProps) {
  const headers = LIB_HEADERS[section];
  const fields  = LIB_FIELDS[section];

  return (
    <table style={{ width: '100%', userSelect: 'none', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>
          <th style={{ ...thStyle, width: 28 }}>#</th>
          {headers.map((h, i) => {
            const field = fields[i];
            const isSorted = sort.field === field;
            const indicator = isSorted ? (sort.dir === 1 ? ' ▲' : ' ▼') : '';
            return (
              <th
                key={h}
                style={{ ...thStyle, cursor: field ? 'pointer' : 'default' }}
                onClick={() => { if (field) onSort(field); }}
              >
                {h}{indicator}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={headers.length + 1} style={emptyCellStyle}>
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
                background: selected ? 'rgba(255,159,10,0.10)' : undefined,
                borderLeft: selected ? '2px solid var(--amber)' : '2px solid transparent',
                transition: 'background 0.08s',
              }}
              onClick={e => onRowClick(entry, e)}
              onDoubleClick={() => onEdit(entry)}
              onContextMenu={e => onRowContextMenu(entry, e)}
              onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
            >
              <td style={{ ...tdStyle, color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 'var(--lib-fs-header)' }}>
                {idx + 1}
              </td>
              {fields.map(f => {
                const raw = (entry as unknown as Record<string, unknown>)[f];
                let v: string;
                if (raw == null || raw === '') v = '—';
                else if (typeof raw === 'boolean') v = raw ? '✓' : '—';
                else v = String(raw);
                if ((f === 'aa' || f === 'beta') && v !== '—') {
                  v = fmtNum(parseFloat(v), { fallback: v });
                }
                const isNotes = f === 'notes';
                const isName  = f === 'name';
                return (
                  <td
                    key={f}
                    style={{
                      ...tdStyle,
                      maxWidth: isNotes ? 220 : isName ? 240 : undefined,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                    }}
                    title={String(v)}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Detail pane ─────────────────────────────────────────────────────

interface DetailPaneProps {
  section: LibSection;
  selectedCount: number;
  entry: LibEntry | null;
}

function DetailPane({ section, selectedCount, entry }: DetailPaneProps) {
  // 0 selected → placeholder
  if (selectedCount === 0) {
    return (
      <div style={detailPaneStyle}>
        <div style={detailEmptyStyle}>Select an item to view details.</div>
      </div>
    );
  }
  // >1 selected → count
  if (selectedCount > 1 || !entry) {
    return (
      <div style={detailPaneStyle}>
        <div style={detailEmptyStyle}>{selectedCount} items selected.</div>
      </div>
    );
  }

  const defs = LIB_FIELD_DEFS[section];
  const rec = entry as unknown as Record<string, unknown>;
  // Notes lives outside LIB_FIELD_DEFS for all four sections (matches the
  // modal's note: "notes lives outside fieldDefs in HTML — handled
  // separately"). Read directly off the entry; render only when non-empty.
  const gridDefs = defs.filter(d => d.key !== 'name');
  const title = (rec['name'] as string) || '—';
  const notesText = String(rec['notes'] ?? '').trim();

  return (
    <div style={detailPaneStyle}>
      <div style={detailTitleStyle}>{title}</div>
      <div style={detailScrollStyle}>
        <div style={detailGridStyle}>
          {gridDefs.map(def => (
            <DetailField key={def.key} def={def} value={rec[def.key]} />
          ))}
        </div>
        {notesText && (
          <div style={detailNotesBlockStyle}>
            <div style={detailLabelStyle}>Notes</div>
            <div style={detailNotesValueStyle}>{notesText}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailField({ def, value }: { def: FieldDef; value: unknown }) {
  return (
    <div style={detailFieldStyle}>
      <div style={detailLabelStyle}>{def.label}</div>
      <div style={detailValueStyle}>{formatValue(value, def)}</div>
    </div>
  );
}

function formatValue(raw: unknown, def: FieldDef): string {
  if (def.type === 'checkbox') {
    return raw ? '✓ Yes' : '— No';
  }
  if (raw == null || raw === '') return '—';
  if (typeof raw === 'boolean') return raw ? '✓' : '—';
  // Numeric fields: trim trailing zeros via Number().toString().
  // ('9.2000000' → '9.2', '5000.0000' → '5000'). Non-finite passthrough
  // to the raw string. Detail-pane scope only — table cells unchanged.
  if (def.type === 'number') {
    const n = Number(raw);
    if (isFinite(n)) return n.toString();
  }
  return String(raw);
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
  fontFamily: 'var(--mono)', fontSize: 'var(--lib-fs-header)', letterSpacing: 0.8,
  textTransform: 'uppercase', color: 'var(--text-muted)',
  textAlign: 'left', padding: '8px 10px', fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 'var(--lib-fs-row)', color: 'var(--text)',
  padding: '7px 10px',
};

const emptyCellStyle: React.CSSProperties = {
  textAlign: 'center', padding: 24,
  fontFamily: 'var(--mono)', fontSize: 'var(--lib-fs-header)', color: 'var(--text-muted)',
  letterSpacing: 1,
};

// Detail pane — flat (no card chrome). Stronger top divider against the
// table; title bar uses --panel for a BeerSmith-style gray band.
const detailPaneStyle: React.CSSProperties = {
  width: '100%', maxWidth: 1100, alignSelf: 'center',
  height: 240, flexShrink: 0,
  borderTop: '1px solid var(--border2)',
  background: 'var(--bg)',
  boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
};

const detailEmptyStyle: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--mono)', fontSize: 'var(--lib-fs-detail-value)',
  color: 'var(--text-muted)', letterSpacing: 0.5,
};

const detailTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 'var(--lib-fs-detail-title)',
  letterSpacing: 1.5, color: 'var(--text)',
  background: 'var(--panel)',
  padding: '8px 16px',
  borderBottom: '1px solid var(--border2)',
  flexShrink: 0,
};

const detailScrollStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', overflowX: 'hidden',
  padding: '10px 16px 12px',
};

const detailGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  columnGap: 24, rowGap: 6,
  paddingTop: 4,
};

const detailFieldStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 1,
  padding: '3px 0',
};

const detailLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 'var(--lib-fs-detail-label)',
  letterSpacing: 1, textTransform: 'uppercase',
  color: 'var(--text-muted)', fontWeight: 600,
};

const detailValueStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 'var(--lib-fs-detail-value)',
  color: 'var(--text)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const detailNotesBlockStyle: React.CSSProperties = {
  marginTop: 10, paddingTop: 8,
  borderTop: '1px solid var(--border)',
};

const detailNotesValueStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 'var(--lib-fs-detail-value)',
  color: 'var(--text)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  marginTop: 3,
};
