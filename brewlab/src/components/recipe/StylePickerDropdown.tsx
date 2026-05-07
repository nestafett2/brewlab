/**
 * Unified Style Picker — BeerSmith-style tabular dropdown showing every
 * BJCP_2021 entry plus every customStyles entry in one combined list.
 *
 * Columns: Name · Style Guide · # (key) · Category · OG · FG.
 * Search filters across Name / Style Guide / Key / Category.
 *
 * Replaces the two HTML-style dropdowns we used to render in StatsSidebar
 * (recipe tab "Style") and StyleGuideModal (the comparison modal). Same
 * widget, same callback shape, two embed sites — keeps the picker
 * behaviour identical wherever a style is chosen.
 *
 * BrewSettings.styleGuide is a no-op here by design — see types/index.ts.
 *
 * Selection: on click we yield (key, label) where label is computed via
 * formatStyleLabel() so consumers don't reimplement the BJCP/Custom
 * format split. The caller writes both fields onto the recipe.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { getAllUnifiedStyles, formatStyleLabel } from '../../lib/styles';
import type { UnifiedStyle } from '../../lib/styles';

interface Props {
  /** Currently-selected style key (BJCP or custom). May be null. */
  selectedKey: string | null | undefined;
  onSelect: (key: string, label: string, style: UnifiedStyle) => void;
  /** Closes the dropdown — called after a row is clicked. */
  onClose: () => void;
  /** When true (e.g. New Recipe modal), prepend a "— Choose Later —" row
   *  that yields ('', '— Choose Later —'). HTML's filterNewRecipeStyles
   *  (line 4973) — kept as opt-in for the future modal. */
  includeChooseLater?: boolean;
  /** Width-constraining wrapper — defaults to filling the parent. */
  width?: number | string;
  /** Max list height before scroll. */
  maxListHeight?: number;
  /** Auto-focus the search input on mount. Default true. */
  autoFocus?: boolean;
}

export default function StylePickerDropdown({
  selectedKey, onSelect, onClose,
  includeChooseLater, width, maxListHeight = 320, autoFocus = true,
}: Props) {
  const customStyles = useStore(s => s.customStyles);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const allStyles = useMemo(
    () => getAllUnifiedStyles(customStyles),
    [customStyles],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStyles;
    return allStyles.filter(s =>
      s.name.toLowerCase().includes(q)
      || s.guide.toLowerCase().includes(q)
      || s.key.toLowerCase().includes(q)
      || s.cat.toLowerCase().includes(q));
  }, [allStyles, search]);

  const handleSelect = (s: UnifiedStyle) => {
    onSelect(s.key, formatStyleLabel(s), s);
    onClose();
  };

  return (
    <div style={{ ...panelStyle, width }} onMouseDown={e => e.stopPropagation()}>
      {/* Search */}
      <div style={searchWrapStyle}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search styles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      {/* Header row */}
      <div style={headerRowStyle}>
        <div style={{ ...colStyle, ...colName,  ...colHeader }}>Name</div>
        <div style={{ ...colStyle, ...colGuide, ...colHeader }}>Style Guide</div>
        <div style={{ ...colStyle, ...colKey,   ...colHeader }}>#</div>
        <div style={{ ...colStyle, ...colCat,   ...colHeader }}>Category</div>
        <div style={{ ...colStyle, ...colRange, ...colHeader }}>OG</div>
        <div style={{ ...colStyle, ...colRange, ...colHeader, paddingRight: 16 }}>FG</div>
      </div>

      {/* List — paddingBottom keeps the last row off the panel edge so the
          dropdown doesn't feel pinned to the modal's chrome. */}
      <div style={{ maxHeight: maxListHeight, overflowY: 'auto', paddingBottom: 6 }}>
        {includeChooseLater && (
          <Row
            highlight={selectedKey === '' || selectedKey == null}
            onClick={() => { onSelect('', '— Choose Later —', placeholderStyle()); onClose(); }}
            cells={['— Choose Later —', '', '', '', '', '']}
            isPlaceholder
          />
        )}

        {filtered.length === 0 ? (
          <div style={emptyStyle}>No match</div>
        ) : filtered.map(s => (
          <Row
            key={s.source + ':' + s.key}
            highlight={selectedKey === s.key}
            onClick={() => handleSelect(s)}
            cells={[
              s.name,
              s.guide,
              s.key,
              s.cat,
              fmtRange(s.og, 3),
              fmtRange(s.fg, 3),
            ]}
          />
        ))}
      </div>
    </div>
  );
}

function placeholderStyle(): UnifiedStyle {
  return {
    key: '', name: '', cat: '', guide: '', source: 'bjcp',
    og: null, fg: null, ibu: null, srm: null, abv: null,
  };
}

function fmtRange(r: [number, number] | null, decimals: number): string {
  if (!r) return '—';
  // BJCP gravity is shown as 1.040 (3 decimals); IBU/ABV/SRM not used in
  // this picker — kept simple per BeerSmith picker layout.
  return `${r[0].toFixed(decimals)}–${r[1].toFixed(decimals)}`;
}

function Row({
  cells, onClick, highlight, isPlaceholder,
}: {
  cells: [string, string, string, string, string, string];
  onClick: () => void;
  highlight: boolean;
  isPlaceholder?: boolean;
}) {
  const [name, guide, key, cat, og, fg] = cells;
  return (
    <div
      // onMouseDown so click fires before the document-level click-outside
      // handler closes the dropdown (matches HTML pattern).
      onMouseDown={onClick}
      style={{
        ...rowStyle,
        background: highlight ? 'rgba(180,130,60,0.18)' : undefined,
        color: isPlaceholder ? 'var(--text-muted)' : 'var(--text)',
        fontStyle: isPlaceholder ? 'italic' : undefined,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
      onMouseEnter={e => { if (!highlight) e.currentTarget.style.background = 'rgba(180,130,60,0.10)'; }}
      onMouseLeave={e => { if (!highlight) e.currentTarget.style.background = ''; }}
    >
      <div style={{ ...colStyle, ...colName }}  title={name}>{name}</div>
      <div style={{ ...colStyle, ...colGuide }} title={guide}>{guide}</div>
      <div style={{ ...colStyle, ...colKey,   color: highlight ? 'var(--amber)' : 'var(--text-muted)' }}>{key}</div>
      <div style={{ ...colStyle, ...colCat }}   title={cat}>{cat}</div>
      <div style={{ ...colStyle, ...colRange }} title={og}>{og}</div>
      <div style={{ ...colStyle, ...colRange, paddingRight: 16 }} title={fg}>{fg}</div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border2)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
  borderRadius: 6,
  fontFamily: 'var(--mono)',
};

// Search input gets a generous wrapper so it sits comfortably and there's
// visible breathing room before the column header below.
const searchWrapStyle: React.CSSProperties = {
  padding: '12px 16px 10px',
  borderBottom: '1px solid var(--border)',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '6px 10px', outline: 'none', borderRadius: 4,
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  background: 'var(--panel2)',
  borderBottom: '1px solid var(--border2)',
  fontSize: 8, letterSpacing: 1, textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const colHeader: React.CSSProperties = {
  fontWeight: 600,
  padding: '7px 10px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  fontSize: 10, cursor: 'pointer',
  padding: 0,
};

const colStyle: React.CSSProperties = {
  padding: '7px 10px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

// Approximate BeerSmith proportions: Name wide, then guide / # / cat
// medium, OG/FG narrow. Edge columns get extra padding so cells don't sit
// flush against the panel border.
const colName:  React.CSSProperties = { flex: 2.2, minWidth: 0, paddingLeft: 16 };
const colGuide: React.CSSProperties = { flex: 1.2, minWidth: 0 };
const colKey:   React.CSSProperties = { width: 50, flexShrink: 0, fontWeight: 600 };
const colCat:   React.CSSProperties = { flex: 2,   minWidth: 0, color: 'var(--text-muted)' };
const colRange: React.CSSProperties = { width: 88, flexShrink: 0, color: 'var(--text-muted)' };

const emptyStyle: React.CSSProperties = {
  padding: '14px 16px', fontSize: 11, color: 'var(--text-muted)',
};
