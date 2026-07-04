/**
 * Recipe Explorer right pane — appears when sidebarTab === 'explorer'.
 *
 * Table-based design: a single sortable, reorderable table of recipes
 * with an inline preview pane on the right.
 *
 * Toolbar filters narrow the list feeding the table:
 *   • Search      — free-text on beerName||name.
 *   • Style       — dropdown of unique recipe styles.
 *   • Origin      — Own / Collab / OEM (own also matches unset).
 *   • Folder      — when a folder is selected in the sidebar, scope to it
 *                   (+ descendants); an "All" toggle expands to everything.
 *
 * Columns (Tax Batch # / Beer Name / Style / Date / Version):
 *   • Click a header to sort by it (click again flips direction).
 *   • Drag a header onto another to reorder columns; order persists in
 *     localStorage (`bl_explorer_cols`).
 *
 * Rows: single-click previews (250ms debounce so a double-click doesn't
 * flash the preview first), double-click opens in the main editor.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Folder, Recipe } from '../../types';
import RecipePreview from './RecipePreview';

// ─── Columns ─────────────────────────────────────────────────────────

type ColKey = 'taxBatch' | 'beerName' | 'style' | 'brewDate' | 'version';

const DEFAULT_COLS: ColKey[] = ['taxBatch', 'beerName', 'style', 'brewDate', 'version'];

const COL_LABELS: Record<ColKey, string> = {
  taxBatch: 'Tax Batch #',
  beerName: 'Beer Name',
  style:    'Style',
  brewDate: 'Date',
  version:  'Version',
};

const COLS_LS_KEY = 'bl_explorer_cols';

/** Read persisted column order. Falls back to DEFAULT_COLS unless the
 *  stored value is an exact permutation of the known columns (guards
 *  against corrupted / stale-schema values). */
function loadColOrder(): ColKey[] {
  try {
    const raw = localStorage.getItem(COLS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed)
        && parsed.length === DEFAULT_COLS.length
        && new Set(parsed).size === DEFAULT_COLS.length
        && parsed.every((c: unknown) => DEFAULT_COLS.includes(c as ColKey))
      ) {
        return parsed as ColKey[];
      }
    }
  } catch { /* localStorage unavailable / invalid JSON — keep default */ }
  return DEFAULT_COLS.slice();
}

const VISIBLE_COLS_LS_KEY = 'bl_explorer_visible_cols';

/** Read the persisted set of visible columns. Falls back to "all columns
 *  visible" unless the stored value is a non-empty array of valid ColKeys. */
function loadVisibleCols(): Set<ColKey> {
  try {
    const raw = localStorage.getItem(VISIBLE_COLS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed)
        && parsed.length > 0
        && parsed.every((c: unknown) => DEFAULT_COLS.includes(c as ColKey))
      ) {
        return new Set(parsed as ColKey[]);
      }
    }
  } catch { /* localStorage unavailable / invalid JSON — keep default */ }
  return new Set(DEFAULT_COLS);
}

/** Sort comparator for a given column + direction. Empty values always
 *  sort last regardless of direction. */
function compareRecipes(a: Recipe, b: Recipe, col: ColKey, dir: 1 | -1): number {
  switch (col) {
    case 'taxBatch': {
      const av = (a.taxBatch || '').trim();
      const bv = (b.taxBatch || '').trim();
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return dir * av.localeCompare(bv, undefined, { numeric: true });
    }
    case 'beerName': {
      const av = (a.beerName || a.name || '').toLowerCase();
      const bv = (b.beerName || b.name || '').toLowerCase();
      return dir * av.localeCompare(bv);
    }
    case 'style': {
      const av = (a.style || '').toLowerCase();
      const bv = (b.style || '').toLowerCase();
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return dir * av.localeCompare(bv);
    }
    case 'brewDate': {
      const av = a.brewDate || '';
      const bv = b.brewDate || '';
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      // Default (dir=1) is descending — newest first.
      return dir * bv.localeCompare(av);
    }
    case 'version': {
      const av = (a.version || '').toLowerCase();
      const bv = (b.version || '').toLowerCase();
      return dir * av.localeCompare(bv);
    }
  }
}

interface Props {
  recipes: Recipe[];
  folders: Folder[];
  setFolders: (folders: Folder[]) => void;
  openRecipe: (recipeId: string) => void;
  /** Right-click on a blank area — Desktop fires the same "+ New Folder"
   *  menu the sidebar uses. (Retained on the interface for callers; the
   *  table view has no folder-tree blank area to hook it to.) */
  onBlankContext: (e: React.MouseEvent) => void;
  /** When set, the explorer defaults to showing only recipes in this folder
   *  (and its descendants). An "All" toggle lets the user expand to all recipes. */
  selectedFolderId?: string | null;
}

export default function RecipeExplorerPanel({
  recipes, folders, openRecipe, selectedFolderId,
}: Props) {
  // Inline preview within the explorer's right pane. Local-only state —
  // intentionally not synced with sidebar `preview`. Resolved to a recipe
  // at render time so a deletion / hydration id change clears it.
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Toolbar filters.
  const [search, setSearch] = useState('');
  const [styleFilter, setStyleFilter] = useState('');
  const [originFilter, setOriginFilter] = useState<'own' | 'collab' | 'oem' | ''>('');

  // Sort + column order.
  const [sort, setSort] = useState<{ col: ColKey; dir: 1 | -1 }>({ col: 'taxBatch', dir: 1 });
  const [colOrder, setColOrder] = useState<ColKey[]>(loadColOrder);
  const [draggingCol, setDraggingCol] = useState<ColKey | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(loadVisibleCols);
  const [colCtxMenu, setColCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Persist column order whenever it changes.
  useEffect(() => {
    try { localStorage.setItem(COLS_LS_KEY, JSON.stringify(colOrder)); } catch { /* ignore */ }
  }, [colOrder]);

  // Persist visible-column set whenever it changes.
  useEffect(() => {
    try { localStorage.setItem(VISIBLE_COLS_LS_KEY, JSON.stringify([...visibleCols])); } catch { /* ignore */ }
  }, [visibleCols]);

  // Close the column context menu on outside mousedown / Escape. Deferred
  // mousedown attach mirrors the recipe/folder ctx-menu pattern in Desktop
  // so the right-click that opened it doesn't immediately close it.
  useEffect(() => {
    if (!colCtxMenu) return;
    const close = () => setColCtxMenu(null);
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [colCtxMenu]);

  const [showAll, setShowAll] = useState(false);
  // Reset showAll when the selected folder changes.
  useEffect(() => { setShowAll(false); }, [selectedFolderId]);

  // Collect all descendant folder ids of a given folder (including itself).
  const getDescendantFolderIds = (folderId: string): Set<string> => {
    const ids = new Set<string>();
    const visit = (id: string) => {
      ids.add(id);
      folders.filter(f => f.parentId === id).forEach(f => visit(f.id));
    };
    visit(folderId);
    return ids;
  };

  const displayedRecipes = useMemo(() => {
    if (!selectedFolderId || showAll) return recipes;
    const ids = getDescendantFolderIds(selectedFolderId);
    return recipes.filter(r => ids.has(r.folder));
  }, [recipes, selectedFolderId, showAll, folders]);

  // Unique, non-blank styles across ALL recipes — feeds the Style filter.
  const styleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) {
      if (r.style && r.style.trim()) set.add(r.style);
    }
    return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [recipes]);

  // Apply search + style + origin filters on top of the folder scope.
  const filteredRecipes = useMemo(() => {
    let out = displayedRecipes;
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(r => (r.beerName || r.name || '').toLowerCase().includes(q));
    }
    if (styleFilter) {
      out = out.filter(r => r.style === styleFilter);
    }
    if (originFilter) {
      // Unset recipeOrigin is treated as 'own' (own-brand by default).
      out = out.filter(r => (r.recipeOrigin ?? 'own') === originFilter);
    }
    return out;
  }, [displayedRecipes, search, styleFilter, originFilter]);

  const sortedRecipes = useMemo(() => {
    return filteredRecipes.slice().sort((a, b) => compareRecipes(a, b, sort.col, sort.dir));
  }, [filteredRecipes, sort]);

  const previewRecipe = useMemo(
    () => previewId ? recipes.find(r => r.id === previewId) ?? null : null,
    [previewId, recipes],
  );

  const handlePreview = (id: string) => setPreviewId(id);
  const handleOpen    = (id: string) => { setPreviewId(null); openRecipe(id); };

  // Click a header: new col → ascending (dir 1); same col → flip direction.
  const onSort = (col: ColKey) =>
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 1 ? -1 : 1 } : { col, dir: 1 });

  // Drop the dragged column immediately before the target column.
  const handleDrop = (target: ColKey) => {
    setColOrder(prev => {
      if (!draggingCol || draggingCol === target) return prev;
      const next = prev.filter(c => c !== draggingCol);
      next.splice(next.indexOf(target), 0, draggingCol);
      return next;
    });
    setDraggingCol(null);
  };

  // Columns actually rendered: ordered by colOrder, filtered to visible.
  const shownCols = useMemo(
    () => colOrder.filter(c => visibleCols.has(c)),
    [colOrder, visibleCols],
  );

  // Toggle a column's visibility. Never allow hiding the last visible
  // column (the checkbox is also disabled in that case).
  const toggleColVisible = (col: ColKey) => setVisibleCols(prev => {
    const next = new Set(prev);
    if (next.has(col)) {
      if (next.size <= 1) return prev;
      next.delete(col);
    } else {
      next.add(col);
    }
    return next;
  });

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <span style={titleStyle}>RECIPE EXPLORER</span>
        <div style={searchWrapStyle}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipes…"
            style={searchInputStyle}
          />
          {search && (
            <button
              className="btn sm"
              style={searchClearStyle}
              onClick={() => setSearch('')}
              title="Clear search"
            >✕</button>
          )}
        </div>
        <select
          value={styleFilter}
          onChange={e => setStyleFilter(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="">All Styles</option>
          {styleOptions.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={originFilter}
          onChange={e => setOriginFilter(e.target.value as 'own' | 'collab' | 'oem' | '')}
          style={filterSelectStyle}
        >
          <option value="">All Origins</option>
          <option value="own">Own Brand</option>
          <option value="collab">Collab</option>
          <option value="oem">OEM</option>
        </select>
        {selectedFolderId && (
          <button
            className={`btn sm ${!showAll ? 'active' : ''}`}
            style={{ marginLeft: 8 }}
            onClick={() => setShowAll(s => !s)}
            title={showAll ? 'Show selected folder only' : 'Show all recipes'}
          >
            {showAll ? 'All' : folders.find(f => f.id === selectedFolderId)?.name ?? 'Folder'}
          </button>
        )}
        <span style={countStyle}>
          {filteredRecipes.length}
          {filteredRecipes.length !== recipes.length
            ? ` of ${recipes.length}`
            : ''
          } {filteredRecipes.length === 1 ? 'recipe' : 'recipes'}
        </span>
      </div>
      <div style={splitStyle}>
        <div style={{ ...bodyStyle, flex: 1, minWidth: 0 }}>
          {sortedRecipes.length === 0 ? (
            <Empty />
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  {shownCols.map(col => (
                    <th
                      key={col}
                      draggable
                      onDragStart={() => setDraggingCol(col)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleDrop(col)}
                      onDragEnd={() => setDraggingCol(null)}
                      onClick={() => onSort(col)}
                      onContextMenu={e => { e.preventDefault(); setColCtxMenu({ x: e.pageX, y: e.pageY }); }}
                      style={{ ...thStyle, opacity: draggingCol === col ? 0.5 : 1 }}
                      title="Click to sort · drag to reorder · right-click for columns"
                    >
                      {COL_LABELS[col]}
                      {sort.col === col && (
                        <span style={sortArrowStyle}>{sort.dir === 1 ? ' ↑' : ' ↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRecipes.map((r, i) => (
                  <ExplorerRow
                    key={r.id}
                    recipe={r}
                    cols={shownCols}
                    selected={r.id === previewId}
                    zebra={i % 2 === 1}
                    onPreview={() => handlePreview(r.id)}
                    onOpen={() => handleOpen(r.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        {previewRecipe && (
          <div style={previewPaneStyle}>
            <button
              className="btn sm"
              style={closeBtnStyle}
              onClick={() => setPreviewId(null)}
              title="Close preview"
            >✕</button>
            <RecipePreview
              recipe={previewRecipe}
              onOpen={() => { setPreviewId(null); openRecipe(previewRecipe.id); }}
            />
          </div>
        )}
      </div>
      {colCtxMenu && (
        <div
          className="ctx-menu open"
          style={{ left: colCtxMenu.x, top: colCtxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {DEFAULT_COLS.map(col => {
            const checked = visibleCols.has(col);
            // Can't hide the last remaining column.
            const disabled = checked && visibleCols.size <= 1;
            return (
              <div
                key={col}
                className="ctx-item"
                onClick={() => { if (!disabled) toggleColVisible(col); }}
                style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  readOnly
                  style={{ marginRight: 8 }}
                />
                {COL_LABELS[col]}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────

/** Cell content for a column. taxBatch/style/date fall back to an em dash;
 *  taxBatch renders amber when set. */
function cellContent(col: ColKey, recipe: Recipe): React.ReactNode {
  switch (col) {
    case 'taxBatch': {
      const v = (recipe.taxBatch || '').trim();
      return v
        ? <span style={{ color: 'var(--amber)' }}>{v}</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>;
    }
    case 'beerName': return recipe.beerName || recipe.name || '(unnamed)';
    case 'style':    return recipe.style || '—';
    case 'brewDate': return recipe.brewDate || '—';
    case 'version':  return `v${recipe.version || '1.0'}`;
  }
}

function ExplorerRow({
  recipe, cols, selected = false, zebra = false, onPreview, onOpen,
}: {
  recipe: Recipe;
  cols: ColKey[];
  selected?: boolean;
  zebra?: boolean;
  onPreview: () => void;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);

  // Debounce single-click. Browsers fire onClick before onDoubleClick
  // (~250-500ms gap), so without this a double-click flashes the preview
  // before the editor takes over. Hold the preview trigger in a 250ms
  // timeout; cancel it if a second click lands. Cleared on unmount so a
  // row that disappears mid-delay doesn't fire a stale preview.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = () => {
    if (clickTimer.current !== null) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };
  useEffect(() => cancelPending, []);

  const background = selected
    ? 'var(--panel2)'
    : hover
      ? 'var(--panel)'
      : zebra
        ? 'rgba(255,255,255,0.03)'
        : 'transparent';

  return (
    <tr
      style={{ background, cursor: 'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        cancelPending();
        clickTimer.current = setTimeout(() => {
          clickTimer.current = null;
          onPreview();
        }, 250);
      }}
      onDoubleClick={() => {
        cancelPending();
        onOpen();
      }}
    >
      {cols.map(col => (
        <td key={col} style={tdStyle}>{cellContent(col, recipe)}</td>
      ))}
    </tr>
  );
}

// ─── Misc ────────────────────────────────────────────────────────────

function Empty() {
  return (
    <div style={emptyStyle}>No recipes yet — use ＋ New in the sidebar to create one.</div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderBottom: '1px solid var(--border)',
  background: 'var(--panel)', flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, color: 'var(--amber)',
};

const countStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
};

const searchWrapStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8,
};

const searchInputStyle: React.CSSProperties = {
  width: 160,
  background: 'var(--panel2)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  padding: '3px 8px',
  height: 24,
  boxSizing: 'border-box',
  borderRadius: 3,
  outline: 'none',
};

const searchClearStyle: React.CSSProperties = {
  padding: '2px 6px', fontSize: 11,
};

const filterSelectStyle: React.CSSProperties = {
  background: 'var(--panel2)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  padding: '3px 6px',
  borderRadius: 3,
  outline: 'none',
};

const splitStyle: React.CSSProperties = {
  flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden',
};

const bodyStyle: React.CSSProperties = {
  overflowY: 'auto',
};

const previewPaneStyle: React.CSSProperties = {
  width: 420, flexShrink: 0,
  borderLeft: '1px solid var(--border)',
  background: 'var(--bg)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  position: 'relative',
};

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute', top: 8, right: 8, zIndex: 5,
  padding: '2px 8px', fontSize: 11,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: 'var(--mono)',
  fontSize: 11,
};

const thStyle: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 1,
  background: 'var(--panel2)',
  borderBottom: '1px solid var(--border)',
  padding: '8px 10px',
  textAlign: 'left',
  color: 'var(--text-muted)',
  fontWeight: 600,
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  color: 'var(--text)',
  whiteSpace: 'nowrap',
};

const sortArrowStyle: React.CSSProperties = {
  color: 'var(--amber)',
};

const emptyStyle: React.CSSProperties = {
  padding: 30, color: 'var(--text-muted)',
  fontFamily: 'var(--mono)', fontSize: 10, textAlign: 'center',
};
