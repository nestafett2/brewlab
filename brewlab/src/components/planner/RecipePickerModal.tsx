/**
 * Recipe Picker overlay — port of brewlab-desktop.html lines 13648–13708
 * (openRecipePicker / renderRecipePicker / rpRecipeRow / rpSelect).
 *
 * Two views:
 *   • Empty search → folder tree (folder-grouped) + Unfiled section.
 *   • Non-empty search → flat filtered list across all recipes.
 *
 * Yields the chosen recipe id + display name (uses beerName, falling
 * back to internal name) — matches HTML's rpSelect signature.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';

interface Props {
  selectedId: string | null;
  onPick: (id: string, displayName: string) => void;
  onClose: () => void;
}

export default function RecipePickerModal({ selectedId, onPick, onClose }: Props) {
  const recipes = useStore(s => s.recipes);
  const folders = useStore(s => s.folders);
  const [search, setSearch] = useState('');

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = search.trim().toLowerCase();

  const flatMatches = useMemo(() => {
    if (!q) return null;
    return recipes.filter(r => {
      const name = (r.beerName || r.name || '').toLowerCase();
      return name.includes(q);
    });
  }, [recipes, q]);

  const filedIds = new Set(folders.map(f => f.id));
  const unfiled = recipes.filter(r => !r.folder || !filedIds.has(r.folder));

  const displayName = (r: { beerName?: string | null; name: string | null | undefined }) =>
    (r.beerName?.trim() || r.name || 'Unnamed');

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>LINK RECIPE</div>
        <div style={searchWrapStyle}>
          <input
            type="text"
            autoFocus
            placeholder="Search recipes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={searchInputStyle}
          />
        </div>
        <div style={listStyle}>
          {flatMatches !== null ? (
            flatMatches.length === 0 ? (
              <div style={emptyStyle}>No recipes found</div>
            ) : flatMatches.map(r => (
              <Row
                key={r.id} recipe={r} selected={r.id === selectedId} indent={0}
                onPick={() => onPick(r.id, displayName(r))}
              />
            ))
          ) : (
            <>
              {folders.map(folder => {
                const recs = recipes.filter(r => r.folder === folder.id);
                if (!recs.length) return null;
                return (
                  <div key={folder.id}>
                    <div style={folderHeaderStyle}>
                      📁 {folder.name} <span style={{ opacity: 0.6 }}>({recs.length})</span>
                    </div>
                    {recs.map(r => (
                      <Row
                        key={r.id} recipe={r} selected={r.id === selectedId} indent={12}
                        onPick={() => onPick(r.id, displayName(r))}
                      />
                    ))}
                  </div>
                );
              })}
              {unfiled.length > 0 && (
                <div>
                  <div style={folderHeaderStyle}>📁 Unfiled</div>
                  {unfiled.map(r => (
                    <Row
                      key={r.id} recipe={r} selected={r.id === selectedId} indent={12}
                      onPick={() => onPick(r.id, displayName(r))}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div style={footerStyle}>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Row({
  recipe, selected, indent, onPick,
}: {
  recipe: { id: string; name: string | null | undefined; beerName?: string | null; style?: string | null | undefined };
  selected: boolean;
  indent: number;
  onPick: () => void;
}) {
  const name = (recipe.beerName?.trim() || recipe.name || 'Unnamed');
  return (
    <div
      onClick={onPick}
      style={{
        padding: `6px 10px 6px ${10 + indent}px`,
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: selected ? 'rgba(43,108,176,0.15)' : undefined,
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.05)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = selected ? 'rgba(43,108,176,0.15)' : ''; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowNameStyle}>{name}</div>
        {recipe.style && <div style={rowStyleStyle}>{recipe.style}</div>}
      </div>
      {selected && <span style={{ color: 'var(--amber)', fontSize: 14 }}>✓</span>}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  width: 460, maxWidth: '95vw', maxHeight: '80vh',
  display: 'flex', flexDirection: 'column',
};

const titleStyle: React.CSSProperties = {
  padding: '12px 16px', borderBottom: '1px solid var(--border)',
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
};

const searchWrapStyle: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid var(--border)',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '5px 8px', outline: 'none',
};

const listStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto',
};

const emptyStyle: React.CSSProperties = {
  padding: 20, textAlign: 'center',
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
};

const folderHeaderStyle: React.CSSProperties = {
  padding: '5px 10px 3px', background: 'var(--panel2)',
  borderBottom: '1px solid var(--border)',
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.5,
  color: 'var(--text-muted)', textTransform: 'uppercase',
};

const rowNameStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const rowStyleStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
};

const footerStyle: React.CSSProperties = {
  padding: '8px 12px', borderTop: '1px solid var(--border)',
  display: 'flex', justifyContent: 'flex-end',
};
