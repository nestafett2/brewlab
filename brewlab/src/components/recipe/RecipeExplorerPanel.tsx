/**
 * Recipe Explorer right pane — appears when sidebarTab === 'explorer'.
 * Five mutually-exclusive view modes (chips at the top):
 *   • By Date    — flat, brewDate descending; "No brew date" subgroup last.
 *   • By Folder  — folder tree mirroring the sidebar (shared folder.open
 *                  state); right-click blank area → "+ New Folder".
 *   • By Style   — grouped by styleKey ("BJCP 21A") with display label;
 *                  recipes sorted alphabetically by beerName within group.
 *   • By Name    — flat, alphabetical case-insensitive on beerName||name.
 *   • By Tax #   — flat by taxBatch ascending; "No tax batch" subgroup last.
 *
 * A free-text search box and Own/Collab/OEM origin-filter chips in the
 * toolbar narrow the recipe list feeding every mode (applied before the
 * mode subcomponent groups/sorts).
 *
 * Mode persistence: localStorage key `bl_explorer_mode`. Survives tab
 * switches and page reloads. Default 'date'.
 *
 * Row format matches the sidebar 3-line shape from FolderTree's
 * RecipeSidebarRow:
 *   #brewNumber beerName
 *   style · BJCP code
 *   v1.x
 * Click anywhere on a row → opens the recipe in the main editor (same
 * `openRecipe` handler the sidebar uses).
 *
 * Drag/drop and multi-select are intentionally NOT included here — those
 * stay in the left sidebar. The explorer is read-mostly; only blank-area
 * folder creation in the By Folder view writes anything.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Folder, Recipe } from '../../types';
import { formatRecipeStyleLine } from '../../lib/utils';
import RecipePreview from './RecipePreview';

export type ExplorerMode = 'date' | 'folder' | 'style' | 'name' | 'tax';

const MODE_LABELS: Record<ExplorerMode, string> = {
  date:   'By Date',
  folder: 'By Folder',
  style:  'By Style',
  name:   'By Name',
  tax:    'By Tax #',
};
const MODE_ORDER: ExplorerMode[] = ['date', 'folder', 'style', 'name', 'tax'];

const LS_KEY = 'bl_explorer_mode';

/** Read the persisted mode, defaulting to 'date'. Tolerant of missing
 *  / corrupted values — any unexpected string falls back to default. */
function loadMode(): ExplorerMode {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw && MODE_ORDER.includes(raw as ExplorerMode)) return raw as ExplorerMode;
  } catch { /* localStorage unavailable — keep default */ }
  return 'date';
}

interface Props {
  recipes: Recipe[];
  folders: Folder[];
  setFolders: (folders: Folder[]) => void;
  openRecipe: (recipeId: string) => void;
  /** Right-click on the By Folder view's blank area — Desktop fires the
   *  same "+ New Folder" menu the sidebar uses. */
  onBlankContext: (e: React.MouseEvent) => void;
  /** When set, the explorer defaults to showing only recipes in this folder
   *  (and its descendants). An "All" toggle lets the user expand to all recipes. */
  selectedFolderId?: string | null;
}

export default function RecipeExplorerPanel({
  recipes, folders, setFolders, openRecipe, onBlankContext, selectedFolderId,
}: Props) {
  const [mode, setMode] = useState<ExplorerMode>(loadMode);
  // Inline preview within the explorer's right pane. Local-only state —
  // intentionally not synced with sidebar `preview` (which drives
  // Overview-mode behaviour). Cleared on mode switch (different list
  // shapes — keeping the same recipe pinned across mode changes is
  // confusing) and naturally on tab switch (panel unmounts).
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Toolbar filters — narrow the list feeding every mode. Free-text
  // search matches beerName||name; origin chips ('own' also matches
  // unset). Both persist across mode switches (list contents don't
  // change shape, so keeping the filter is less surprising than the
  // preview pinning we clear on mode switch below).
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState<'own' | 'collab' | 'oem' | null>(null);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, mode); } catch { /* ignore */ }
  }, [mode]);
  useEffect(() => { setPreviewId(null); }, [mode]);

  const [showAll, setShowAll] = useState(false);
  // Reset showAll when the selected folder changes
  useEffect(() => { setShowAll(false); }, [selectedFolderId]);

  // Collect all descendant folder ids of a given folder (including itself)
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

  // Apply the toolbar search + origin filters on top of the folder scope.
  // This is what feeds the mode subcomponents (not displayedRecipes).
  const filteredRecipes = useMemo(() => {
    let out = displayedRecipes;
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(r => (r.beerName || r.name || '').toLowerCase().includes(q));
    }
    if (originFilter) {
      // Unset recipeOrigin is treated as 'own' (own-brand by default).
      out = out.filter(r => (r.recipeOrigin ?? 'own') === originFilter);
    }
    return out;
  }, [displayedRecipes, search, originFilter]);

  // Resolve preview id → recipe at render time so a deletion or
  // hydration-driven id change clears the pane gracefully.
  const previewRecipe = useMemo(
    () => previewId ? recipes.find(r => r.id === previewId) ?? null : null,
    [previewId, recipes],
  );

  const handlePreview = (id: string) => setPreviewId(id);
  const handleOpen    = (id: string) => { setPreviewId(null); openRecipe(id); };

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <span style={titleStyle}>RECIPE EXPLORER</span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 14 }}>
          {MODE_ORDER.map(m => (
            <button
              key={m}
              className={`btn sm ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
            >{MODE_LABELS[m]}</button>
          ))}
        </div>
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
        <div style={{ display: 'flex', gap: 4 }}>
          {(['own', 'collab', 'oem'] as const).map(o => (
            <button
              key={o}
              className={`btn sm ${originFilter === o ? 'active' : ''}`}
              onClick={() => setOriginFilter(prev => (prev === o ? null : o))}
            >{o === 'own' ? 'Own' : o === 'collab' ? 'Collab' : 'OEM'}</button>
          ))}
        </div>
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
          {mode === 'date'   && <ByDate    recipes={filteredRecipes} onPreview={handlePreview} onOpen={handleOpen} previewId={previewId} />}
          {mode === 'folder' && <ByFolder
            recipes={filteredRecipes} folders={folders}
            setFolders={setFolders}
            onPreview={handlePreview}
            onOpen={handleOpen}
            previewId={previewId}
            onBlankContext={onBlankContext}
          />}
          {mode === 'style'  && <ByStyle   recipes={filteredRecipes} onPreview={handlePreview} onOpen={handleOpen} previewId={previewId} />}
          {mode === 'name'   && <ByName    recipes={filteredRecipes} onPreview={handlePreview} onOpen={handleOpen} previewId={previewId} />}
          {mode === 'tax'    && <ByTax     recipes={filteredRecipes} onPreview={handlePreview} onOpen={handleOpen} previewId={previewId} />}
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
    </div>
  );
}

// Mode subcomponents share these click props — single-click previews,
// double-click opens, previewId drives the row's selected styling.
interface ModeProps {
  recipes: Recipe[];
  onPreview: (id: string) => void;
  onOpen: (id: string) => void;
  previewId: string | null;
}

// ─── Mode: By Date ───────────────────────────────────────────────────

function ByDate({ recipes, onPreview, onOpen, previewId }: ModeProps) {
  const { dated, undated } = useMemo(() => {
    const dated:   Recipe[] = [];
    const undated: Recipe[] = [];
    for (const r of recipes) {
      if (r.brewDate) dated.push(r); else undated.push(r);
    }
    // Most recent first (descending). String compare is correct for ISO YYYY-MM-DD.
    dated.sort((a, b) => b.brewDate.localeCompare(a.brewDate));
    return { dated, undated };
  }, [recipes]);

  if (recipes.length === 0) return <Empty />;
  return (
    <div style={listStyle}>
      {dated.map(r => (
        <ExplorerRow key={r.id} recipe={r} selected={r.id === previewId}
          onPreview={() => onPreview(r.id)} onOpen={() => onOpen(r.id)} />
      ))}
      {undated.length > 0 && (
        <>
          <SubHeader label="No brew date" count={undated.length} />
          {undated.map(r => (
            <ExplorerRow key={r.id} recipe={r} selected={r.id === previewId}
              onPreview={() => onPreview(r.id)} onOpen={() => onOpen(r.id)} />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Mode: By Name ───────────────────────────────────────────────────

function ByName({ recipes, onPreview, onOpen, previewId }: ModeProps) {
  const sorted = useMemo(() => {
    const out = recipes.slice();
    out.sort((a, b) =>
      (a.beerName || a.name || '').toLowerCase()
        .localeCompare((b.beerName || b.name || '').toLowerCase()));
    return out;
  }, [recipes]);
  if (sorted.length === 0) return <Empty />;
  return (
    <div style={listStyle}>
      {sorted.map(r => (
        <ExplorerRow key={r.id} recipe={r} selected={r.id === previewId}
          onPreview={() => onPreview(r.id)} onOpen={() => onOpen(r.id)} />
      ))}
    </div>
  );
}

// ─── Mode: By Tax # ──────────────────────────────────────────────────

function ByTax({ recipes, onPreview, onOpen, previewId }: ModeProps) {
  const { tagged, untagged } = useMemo(() => {
    const tagged:   Recipe[] = [];
    const untagged: Recipe[] = [];
    for (const r of recipes) {
      if (r.taxBatch && r.taxBatch.trim()) tagged.push(r); else untagged.push(r);
    }
    // Numeric-aware compare for "23" < "100" ordering.
    tagged.sort((a, b) =>
      a.taxBatch.localeCompare(b.taxBatch, undefined, { numeric: true }));
    return { tagged, untagged };
  }, [recipes]);
  if (recipes.length === 0) return <Empty />;
  return (
    <div style={listStyle}>
      {tagged.map(r => (
        <ExplorerRow key={r.id} recipe={r} selected={r.id === previewId}
          onPreview={() => onPreview(r.id)} onOpen={() => onOpen(r.id)} />
      ))}
      {untagged.length > 0 && (
        <>
          <SubHeader label="No tax batch" count={untagged.length} />
          {untagged.map(r => (
            <ExplorerRow key={r.id} recipe={r} selected={r.id === previewId}
              onPreview={() => onPreview(r.id)} onOpen={() => onOpen(r.id)} />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Mode: By Style ──────────────────────────────────────────────────

interface StyleGroup {
  key: string;             // styleKey or stripped style name
  label: string;           // display label
  recipes: Recipe[];
}

function ByStyle({ recipes, onPreview, onOpen, previewId }: ModeProps) {
  const groups = useMemo<StyleGroup[]>(() => {
    const m = new Map<string, StyleGroup>();
    for (const r of recipes) {
      // Group key: BJCP code (`r.styleKey`) when set, else the bare
      // style name with any trailing "(Custom)" stripped. Recipes with
      // neither bucket under the literal label "(no style)" so they're
      // discoverable rather than silently dropped.
      const key = (r.styleKey || '').trim()
        || (r.style || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
        || '(no style)';
      const label = formatRecipeStyleLine(r.style) || key;
      const g = m.get(key);
      if (g) g.recipes.push(r);
      else m.set(key, { key, label, recipes: [r] });
    }
    const out = Array.from(m.values());
    // Sort groups by display label, recipes within each group by beerName.
    out.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    for (const g of out) {
      g.recipes.sort((a, b) =>
        (a.beerName || a.name || '').toLowerCase()
          .localeCompare((b.beerName || b.name || '').toLowerCase()));
    }
    return out;
  }, [recipes]);

  // Per-group collapsed state. Default open. Local-only (different from
  // folder.open which is persisted) — style groups have no model object.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (groups.length === 0) return <Empty />;
  return (
    <div style={listStyle}>
      {groups.map(g => (
        <div key={g.key}>
          <div
            className="rb-folder-header"
            style={{ paddingLeft: 8, cursor: 'pointer' }}
            onClick={() => toggle(g.key)}
          >
            <span className={`rb-folder-arrow${!collapsed.has(g.key) ? ' open' : ''}`}>▶</span>
            <span className="rb-folder-icon">🍺</span>
            <span className="rb-folder-name">{g.label}</span>
            <span className="rb-folder-count">{g.recipes.length}</span>
          </div>
          {!collapsed.has(g.key) && (
            <div className="rb-folder-body">
              {g.recipes.map(r => (
                <ExplorerRow key={r.id} recipe={r} selected={r.id === previewId}
                  onPreview={() => onPreview(r.id)} onOpen={() => onOpen(r.id)}
                  indentPx={12} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Mode: By Folder ────────────────────────────────────────────────
//
// Mirrors the sidebar tree's hierarchy + open state. No drag/drop, no
// multi-select — click-to-open only. Right-click on blank area fires
// the same "+ New Folder" menu the sidebar uses. Folder right-click is
// not wired in this view (rename/delete stay in the sidebar to keep
// surface area small).

interface FolderViewProps extends ModeProps {
  folders: Folder[];
  setFolders: (folders: Folder[]) => void;
  onBlankContext: (e: React.MouseEvent) => void;
}

function ByFolder({
  recipes, folders, setFolders, onPreview, onOpen, previewId, onBlankContext,
}: FolderViewProps) {
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const list = m.get(f.parentId) ?? [];
      list.push(f);
      m.set(f.parentId, list);
    }
    return m;
  }, [folders]);
  const recipesByFolder = useMemo(() => {
    const m = new Map<string, Recipe[]>();
    for (const r of recipes) {
      const list = m.get(r.folder) ?? [];
      list.push(r);
      m.set(r.folder, list);
    }
    return m;
  }, [recipes]);
  const descendantCount = useMemo(() => {
    const m = new Map<string, number>();
    const visit = (id: string): number => {
      const cached = m.get(id);
      if (cached !== undefined) return cached;
      let n = recipesByFolder.get(id)?.length ?? 0;
      for (const sub of childrenByParent.get(id) ?? []) n += visit(sub.id);
      m.set(id, n);
      return n;
    };
    for (const f of folders) visit(f.id);
    return m;
  }, [folders, childrenByParent, recipesByFolder]);
  const unfiledRecipes = useMemo(() => {
    const ids = new Set(folders.map(f => f.id));
    return recipes.filter(r => !ids.has(r.folder));
  }, [folders, recipes]);

  const toggleOpen = (folderId: string) => {
    setFolders(folders.map(f => f.id === folderId ? { ...f, open: !f.open } : f));
  };

  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    const indent = depth * 12;
    const subs = childrenByParent.get(folder.id) ?? [];
    const direct = recipesByFolder.get(folder.id) ?? [];
    const empty = subs.length === 0 && direct.length === 0;
    return (
      <div key={folder.id} className="rb-folder">
        <div
          className="rb-folder-header"
          style={{ paddingLeft: 8 + indent, cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); toggleOpen(folder.id); }}
          onContextMenu={e => e.stopPropagation() /* leave folder ctx to sidebar */}
        >
          <span className={`rb-folder-arrow${folder.open ? ' open' : ''}`}>▶</span>
          <span className="rb-folder-icon">📁</span>
          <span className="rb-folder-name">{folder.name}</span>
          <span className="rb-folder-count">{descendantCount.get(folder.id) ?? 0}</span>
        </div>
        {folder.open && (
          <div className="rb-folder-body">
            {empty && <div className="rb-folder-empty" style={{ paddingLeft: 22 + indent }}>Empty</div>}
            {subs.map(s => renderFolder(s, depth + 1))}
            {direct.map(r => (
              <ExplorerRow
                key={r.id} recipe={r}
                selected={r.id === previewId}
                onPreview={() => onPreview(r.id)}
                onOpen={() => onOpen(r.id)}
                indentPx={(depth + 1) * 12}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = childrenByParent.get(null) ?? [];

  return (
    <div
      style={listStyle}
      onContextMenu={e => {
        e.preventDefault();
        onBlankContext(e);
      }}
    >
      {rootFolders.map(f => renderFolder(f, 0))}
      {unfiledRecipes.length > 0 && (
        <div className="rb-folder">
          <div className="rb-folder-header rb-folder-header-static" style={{ paddingLeft: 8 }}>
            <span className="rb-folder-arrow rb-folder-arrow-spacer" />
            <span className="rb-folder-icon">📁</span>
            <span className="rb-folder-name">Unfiled</span>
            <span className="rb-folder-count">{unfiledRecipes.length}</span>
          </div>
          {unfiledRecipes.map(r => (
            <ExplorerRow
              key={r.id} recipe={r}
              selected={r.id === previewId}
              onPreview={() => onPreview(r.id)}
              onOpen={() => onOpen(r.id)}
              indentPx={12}
            />
          ))}
        </div>
      )}
      {folders.length === 0 && unfiledRecipes.length === 0 && recipes.length === 0 && (
        <Empty />
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────

function ExplorerRow({
  recipe, selected = false, onPreview, onOpen, indentPx = 0,
}: {
  recipe: Recipe;
  selected?: boolean;
  onPreview: () => void;
  onOpen: () => void;
  indentPx?: number;
}) {
  const hasNum = typeof recipe.brewNumber === 'number' && recipe.brewNumber > 0;
  const nameLine = hasNum
    ? `#${recipe.brewNumber} ${recipe.beerName || recipe.name}`
    : (recipe.beerName || recipe.name);
  const styleLine = formatRecipeStyleLine(recipe.style);
  const versionLine = `v${recipe.version || '1.0'}`;

  // Debounce single-click. Browsers fire onClick before onDoubleClick
  // (~250-500ms gap), so without this, a double-click flashes the
  // preview before the editor takes over. Hold the preview trigger in a
  // 250ms timeout; cancel it if a second click lands and let onOpen
  // run instead. Cleared on unmount so a row that disappears mid-delay
  // (mode switch, recipe deleted) doesn't fire a stale preview.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = () => {
    if (clickTimer.current !== null) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };
  useEffect(() => cancelPending, []);

  return (
    <div
      className={`recipe-item${selected ? ' selected' : ''}`}
      style={{ paddingLeft: 10 + indentPx, cursor: 'pointer' }}
      onClick={e => {
        e.stopPropagation();
        cancelPending();
        clickTimer.current = setTimeout(() => {
          clickTimer.current = null;
          onPreview();
        }, 250);
      }}
      onDoubleClick={e => {
        e.stopPropagation();
        cancelPending();
        onOpen();
      }}
    >
      <div className="recipe-item-info">
        <div className="recipe-item-name">{nameLine}</div>
        {styleLine && <div className="recipe-item-meta">{styleLine}</div>}
        <div className="recipe-item-version">{versionLine}</div>
      </div>
    </div>
  );
}

// ─── Misc ────────────────────────────────────────────────────────────

function SubHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={subHeaderStyle}>
      {label} <span style={{ color: 'var(--text-muted)' }}>· {count}</span>
    </div>
  );
}

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

const listStyle: React.CSSProperties = {
  padding: '4px 0',
};

const subHeaderStyle: React.CSSProperties = {
  padding: '8px 14px 4px',
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
  color: 'var(--text-muted)', textTransform: 'uppercase',
};

const emptyStyle: React.CSSProperties = {
  padding: 30, color: 'var(--text-muted)',
  fontFamily: 'var(--mono)', fontSize: 10, textAlign: 'center',
};
