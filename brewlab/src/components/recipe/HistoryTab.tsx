/**
 * Brew History tab — port of brewlab-desktop.html lines 1637–1653 (markup)
 * + 5599–5731 (loadHistoryPage) + 5733–5740 (toggleBatchCard, HTML name) +
 * 5742–5746 (openHistoryRecipe).
 *
 * Shows every recipe in the active recipe's lineage (matched by `lineageId`,
 * fall-through to recipe.id if missing) as a stack of expand/collapse cards.
 * Newest brew first. The active recipe is highlighted with an amber border
 * and a CURRENT badge.
 *
 * Brew numbering:
 *   - Prefer recipe.brewNumber (column brew_number — per-lineage sequential
 *     counter set by + New Brew). HTML's r.batchNumber semantics; not the
 *     tax serial.
 *   - Fall back to derived 1..N (sorted by brewDate ascending, ties by id)
 *     when brewNumber is null.
 *
 * Past-brew blobs (brew_day / cold_side / ingredients) are NOT in the
 * Zustand store — only the active recipe's blobs are hot. We read other
 * brews from localStorage (`bl_bd_<id>`, `bl_cold_<id>`,
 * `bl_recipe_ings_<id>`). Matches the HTML's behaviour exactly.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { fmtNum } from '../../lib/format';
import { lsGet } from '../../lib/storage';
import { calcABV, platoToSg } from '../../lib/calculations';
import type { Recipe, Ingredient, BrewDayData, ColdSideData } from '../../types';
import NewBrewModal, { type NewBrewAction } from './NewBrewModal';

interface Props {
  recipeId: string;
  /** Open a recipe in the main tab strip — adds to openRecipeTabs +
   *  selectRecipe + setActiveTab in one go. Wired from Desktop.tsx so
   *  HistoryTab doesn't have to reach into Desktop's local tab-strip
   *  state. Used by both the brew-card "Open Recipe" button and the
   *  post-create navigation after NewBrewModal submits. Without this,
   *  setActiveTab alone changes the content area but leaves the tab
   *  strip showing only the source recipe — visually "stays on the
   *  old recipe". */
  onOpenRecipe: (id: string) => void;
}

interface BrewRow {
  recipe:     Recipe;
  brewLabel:  string;        // "#5" or derived "#3"
  ings:       Ingredient[];
  bd:         BrewDayData;
  cold:       ColdSideData;
  brewDate:   string;
  ogStr:      string;        // Plato or '—'
  fgStr:      string;
  abvStr:     string;        // 'X.X%' or '—'
  isCurrent:  boolean;
  /** True when this row's version differs from the chronologically
   *  prior row's version (the row immediately below it in the
   *  newest-first sorted list). The very last row has this false. */
  versionChanged: boolean;
}

interface BrewGroup {
  /** Major version (1, 2, …) or null for rows with unparseable version. */
  major: number | null;
  rows:  BrewRow[];
}

const parseMajor = (v: string | undefined): number | null => {
  // Empty / null / undefined → v1.x (matches the row's display fallback,
  // which renders empty version as "v1.0"). Only TRULY unparseable
  // non-empty strings (e.g. "alpha") return null and land in the
  // "Unversioned" group. Keeps grouping consistent with what the user sees.
  const s = String(v ?? '').replace(/^v/i, '').trim();
  if (s === '') return 1;
  const m = parseInt(s.split('.')[0] ?? '', 10);
  return isFinite(m) ? m : null;
};

const fmtAbv = (ogStr: string, fgStr: string): string => {
  const ogP = parseFloat(ogStr);
  const fgP = parseFloat(fgStr);
  if (!isFinite(ogP) || !isFinite(fgP) || ogP <= 0 || fgP <= 0) return '—';
  const abv = calcABV(platoToSg(ogP), platoToSg(fgP));
  return isFinite(abv) && abv >= 0 ? fmtNum(abv, { dp: 1, suffix: '%' }) : '—';
};

export default function HistoryTab({ recipeId, onOpenRecipe }: Props) {
  const recipes              = useStore(s => s.recipes);

  const recipe = recipes.find(r => r.id === recipeId);
  const lineageId = recipe?.lineageId || recipe?.id;

  // ── New Brew modal state (3-action split button) ────────────────────────
  const [modalAction, setModalAction] = useState<NewBrewAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the caret dropdown on outside-mousedown / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // After NewBrewModal creates a new recipe, navigate to it in full —
  // tab strip + content area + selected-recipe state. Same handler for
  // all three modal variants (none / minor / major) since they all
  // funnel through onCreated.
  const onCreated = (newId: string) => {
    onOpenRecipe(newId);
  };

  // ── Lineage rows ─────────────────────────────────────────────────────────
  const rows: BrewRow[] = useMemo(() => {
    if (!recipe || !lineageId) return [];

    const lineage = recipes.filter(r => (r.lineageId || r.id) === lineageId);

    // Derived brew numbers: stable sort by brewDate ascending, ties by id.
    const derivedOrder = [...lineage].sort((a, b) => {
      const da = a.brewDate || '';
      const db = b.brewDate || '';
      if (da !== db) return da.localeCompare(db);
      return a.id.localeCompare(b.id);
    });
    const derivedIndex = new Map<string, number>();
    derivedOrder.forEach((r, i) => derivedIndex.set(r.id, i + 1));

    const labelFor = (r: Recipe): string => {
      if (typeof r.brewNumber === 'number' && r.brewNumber > 0) {
        return `#${r.brewNumber}`;
      }
      const idx = derivedIndex.get(r.id);
      return idx ? `#${idx}` : '#—';
    };

    // Display order: newest first. Prefer brewNumber desc; fall back to
    // derived index desc (which already encodes brewDate order).
    const sorted = [...lineage].sort((a, b) => {
      const an = a.brewNumber;
      const bn = b.brewNumber;
      const aHas = typeof an === 'number' && isFinite(an);
      const bHas = typeof bn === 'number' && isFinite(bn);
      if (aHas && bHas) return (bn as number) - (an as number);
      if (aHas) return -1;
      if (bHas) return 1;
      return (derivedIndex.get(b.id) ?? 0) - (derivedIndex.get(a.id) ?? 0);
    });

    // Build base rows first; versionChanged annotation comes after so it
    // can compare against the chronologically-prior row.
    const base = sorted.map(r => {
      const ings: Ingredient[] = lsGet(`bl_recipe_ings_${r.id}`, []);
      const bd:   BrewDayData  = lsGet(`bl_bd_${r.id}`,           {});
      const cold: ColdSideData = lsGet(`bl_cold_${r.id}`,         {});
      const brewDate = r.brewDate || '—';
      const ogStr = bd.measOg || bd.preboilGrav || '—';
      const fgStr = cold['cs-fg'] || '—';
      return {
        recipe: r,
        brewLabel: labelFor(r),
        ings, bd, cold,
        brewDate,
        ogStr, fgStr,
        abvStr: fmtAbv(ogStr, fgStr),
        isCurrent: r.id === recipeId,
        versionChanged: false,  // patched below
      } as BrewRow;
    });

    // Annotate versionChanged: row[i] differs from row[i+1] (older).
    // The very last row has nothing below it → versionChanged stays false.
    for (let i = 0; i < base.length - 1; i++) {
      const cur = base[i].recipe.version || '';
      const prev = base[i + 1].recipe.version || '';
      base[i].versionChanged = cur !== prev;
    }
    return base;
  }, [recipe, recipes, lineageId, recipeId]);

  // ── Group by major version ────────────────────────────────────────────
  // Most-recent major group first; nulls (unparseable version) last.
  const groups: BrewGroup[] = useMemo(() => {
    const map = new Map<number | null, BrewRow[]>();
    for (const r of rows) {
      const major = parseMajor(r.recipe.version);
      if (!map.has(major)) map.set(major, []);
      map.get(major)!.push(r);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return b - a;
    });
    return keys.map(major => ({ major, rows: map.get(major)! }));
  }, [rows]);

  // ── Expand/collapse state ────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Group expansion state — overrides the default (most-recent group only).
  // Map-keyed by major (number | null); presence in the map means the user
  // has explicitly toggled.
  const [groupOverrides, setGroupOverrides] = useState<Map<number | null, boolean>>(() => new Map());
  // Reset overrides when the recipe (lineage) changes so the new lineage
  // gets the most-recent-only default.
  const lineageRef = useRef<string | undefined>(lineageId);
  useEffect(() => {
    if (lineageRef.current !== lineageId) {
      lineageRef.current = lineageId;
      setGroupOverrides(new Map());
    }
  }, [lineageId]);
  const isGroupExpanded = (major: number | null, idx: number): boolean => {
    const ov = groupOverrides.get(major);
    if (ov !== undefined) return ov;
    return idx === 0;  // most-recent group expanded by default
  };
  const toggleGroup = (major: number | null, idx: number) => {
    setGroupOverrides(prev => {
      const next = new Map(prev);
      next.set(major, !isGroupExpanded(major, idx));
      return next;
    });
  };

  // Open a recipe via the same path Desktop's "+ New" / right-click /
  // recipe-list-click flows use — adds to the tab strip if needed,
  // updates selectedRecipeId, switches activeTab. Aliased for readability
  // in the JSX below.
  const openRecipe = onOpenRecipe;

  if (!recipe) return null;

  const beerName = (recipe.beerName || recipe.name || 'BREW HISTORY').toUpperCase();
  const countText = rows.length
    ? `${rows.length} brew${rows.length !== 1 ? 's' : ''}`
    : '';

  // Single-group case → render rows flat without a group header.
  const showGroupHeaders = groups.length > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 24px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 2, color: 'var(--amber)' }}>
            {beerName === 'BREW HISTORY' ? 'BREW HISTORY' : `${beerName} — BREW HISTORY`}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, marginTop: 2 }}>
            {recipe.name || ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
            {countText}
          </span>
          {/* Split button: primary "+ New Brew" + caret dropdown */}
          <div style={{ position: 'relative', display: 'flex' }} onMouseDown={e => e.stopPropagation()}>
            <button
              className="btn sm primary"
              onClick={() => setModalAction('none')}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
              title="New brew of this recipe — version unchanged. Ingredients and water chemistry copy over; brew day, fermentation and packaging start fresh."
            >
              ＋ New Brew
            </button>
            <button
              className="btn sm primary"
              onClick={() => setMenuOpen(o => !o)}
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '0 8px' }}
              title="Version-bump variants"
              aria-label="More new-brew actions"
            >
              ▼
            </button>
            {menuOpen && (
              <div
                className="ctx-menu open"
                style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 200 }}
              >
                <div
                  className="ctx-item"
                  onClick={() => { setModalAction('minor'); setMenuOpen(false); }}
                  title="Minor version bump (e.g. 1.0 → 1.1). Use when amounts changed."
                >
                  Amounts Changed
                </div>
                <div
                  className="ctx-item"
                  onClick={() => { setModalAction('major'); setMenuOpen(false); }}
                  title="Major version bump (e.g. 1.7 → 2.0). Use when the ingredient list changed."
                >
                  Ingredients Changed
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 800 }}>
          {rows.length === 0 ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' as const, padding: '40px 20px', lineHeight: 2 }}>
              No brew history yet.
              <br />
              Click{' '}
              <span style={{ color: 'var(--amber)' }}>＋ New Brew</span> to start a fresh brew of this recipe.
            </div>
          ) : showGroupHeaders ? (
            groups.map((g, idx) => (
              <BrewGroupBlock
                key={g.major === null ? '?' : g.major}
                group={g}
                expanded={isGroupExpanded(g.major, idx)}
                onToggleGroup={() => toggleGroup(g.major, idx)}
                cardExpanded={expanded}
                onToggleCard={toggle}
                onOpenRecipe={openRecipe}
              />
            ))
          ) : (
            // Single-group case — flat render, no header.
            groups[0]?.rows.map(row => (
              <BrewCard
                key={row.recipe.id}
                row={row}
                expanded={expanded.has(row.recipe.id)}
                onToggle={() => toggle(row.recipe.id)}
                onOpen={() => openRecipe(row.recipe.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* New Brew modal (3 actions: none / minor / major) */}
      {modalAction !== null && (
        <NewBrewModal
          recipeId={recipeId}
          action={modalAction}
          onClose={() => setModalAction(null)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// BrewGroupBlock — collapsible "v2.x (3 brews)" wrapper around BrewCards
// ──────────────────────────────────────────────────────────────────────────

interface GroupProps {
  group:         BrewGroup;
  expanded:      boolean;
  onToggleGroup: () => void;
  cardExpanded:  Set<string>;
  onToggleCard:  (id: string) => void;
  onOpenRecipe:  (id: string) => void;
}

function BrewGroupBlock({ group, expanded, onToggleGroup, cardExpanded, onToggleCard, onOpenRecipe }: GroupProps) {
  const label = group.major === null ? 'Unversioned' : `v${group.major}.x`;
  const count = group.rows.length;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={onToggleGroup}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none' as const,
          background: 'var(--panel2)',
          border: '1px solid var(--border2)',
          borderRadius: 8,
          marginBottom: expanded ? 8 : 0,
        }}
      >
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: 10,
            transition: 'transform 0.15s',
            transform: expanded ? 'rotate(90deg)' : undefined,
          }}
        >▶</span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--amber)', letterSpacing: 1 }}>
          {label}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
          ({count} brew{count !== 1 ? 's' : ''})
        </span>
      </div>
      {expanded && group.rows.map(row => (
        <BrewCard
          key={row.recipe.id}
          row={row}
          expanded={cardExpanded.has(row.recipe.id)}
          onToggle={() => onToggleCard(row.recipe.id)}
          onOpen={() => onOpenRecipe(row.recipe.id)}
        />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// BrewCard
// ──────────────────────────────────────────────────────────────────────────

interface CardProps {
  row:       BrewRow;
  expanded:  boolean;
  onToggle:  () => void;
  onOpen:    () => void;
}

function BrewCard({ row, expanded, onToggle, onOpen }: CardProps) {
  const { recipe: r, brewLabel, ings, cold, brewDate, ogStr, fgStr, abvStr, isCurrent, versionChanged } = row;
  const grains = ings.filter(i => i.type === 'grain');
  const hops   = ings.filter(i => i.type === 'hop');
  const yeasts = ings.filter(i => i.type === 'yeast');

  const tastingNotes = cold['cs-tasting-notes'] || '';
  const changeNotes  = cold['cs-changes-notes'] || '';
  const rating       = r.rating || 0;
  const stars        = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '';
  const hasNote      = !!(r.versionNote && r.versionNote.trim());
  const hasNotesSection = !!(stars || tastingNotes || changeNotes);

  const batchLDisp = recipeBatchLDisplay(r);

  return (
    <div
      style={{
        background: 'var(--panel)',
        border: `1px solid ${isCurrent ? 'var(--amber)' : 'var(--border2)'}`,
        borderRadius: 10,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      {/* Header — click toggles expand */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
          userSelect: 'none' as const,
        }}
      >
        <span style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--amber)', letterSpacing: 1, minWidth: 32 }}>
          {brewLabel}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              onClick={e => { e.stopPropagation(); onOpen(); }}
              title="Open this recipe"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
                textDecorationColor: 'rgba(255,255,255,0.2)',
              }}
            >
              {r.name || r.beerName || '—'}
            </span>
            {isCurrent && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 8,
                  color: 'var(--amber)',
                  background: 'rgba(192,112,16,0.15)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  letterSpacing: 0.5,
                }}
              >
                CURRENT
              </span>
            )}
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              color: 'var(--text-muted)',
              marginTop: 2,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap' as const,
            }}
          >
            <span style={versionChanged ? { color: 'var(--amber)', fontWeight: 600 } : undefined}>
              v{r.version || '1.0'}{versionChanged && ' ✏'}
            </span>
            {brewDate !== '—' && <span>{brewDate}</span>}
            <span>{batchLDisp}</span>
            {ogStr !== '—' && <span>OG {ogStr}</span>}
            {fgStr !== '—' && <span>FG {fgStr}</span>}
            {abvStr !== '—' && <span>ABV {abvStr}</span>}
          </div>
          {hasNote && (
            <div
              style={{
                marginTop: 4,
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: 'var(--amber)',
                background: 'rgba(192,112,16,0.1)',
                padding: '2px 8px',
                borderRadius: 4,
                display: 'inline-block',
              }}
            >
              {r.versionNote}
            </div>
          )}
        </div>
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: 12,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(90deg)' : undefined,
          }}
        >
          ▶
        </span>
      </div>

      {/* Body — collapsible */}
      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
          {/* Vitals grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, paddingTop: 12 }}>
            {([
              ['Brew Date', brewDate],
              ['OG',        ogStr],
              ['FG',        fgStr],
              ['ABV',       abvStr],
              ['Batch Size', batchLDisp],
              ['Style',     r.style || '—'],
              ['IBU',       r.ibu > 0 ? fmtNum(r.ibu, { dp: 0 }) : '—'],
              ['EBC',       r.ebc > 0 ? fmtNum(r.ebc, { dp: 0 }) : '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ background: 'var(--panel2)', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                  {label}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', marginTop: 2 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Ingredients */}
          {(grains.length || hops.length || yeasts.length) > 0 && (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {grains.length > 0 && (
                <div>
                  <SectionLabel>Grain Bill</SectionLabel>
                  <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                    <tbody>
                      {grains.map(g => (
                        <tr key={g.id}>
                          <td style={{ padding: '2px 8px 2px 0', color: 'var(--text)', fontSize: 10 }}>{g.name}</td>
                          <td style={{ padding: '2px 0', color: 'var(--amber)', fontSize: 10, textAlign: 'right' as const, whiteSpace: 'nowrap' as const }}>
                            {(g.amt ?? 0)} kg
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div>
                {hops.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <SectionLabel>Hops</SectionLabel>
                    <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                      <tbody>
                        {hops.map(h => (
                          <tr key={h.id}>
                            <td style={{ padding: '2px 8px 2px 0', color: 'var(--text)', fontSize: 10 }}>{h.name}</td>
                            <td style={{ padding: '2px 0', color: 'var(--text-muted)', fontSize: 9 }}>{h.use || ''}</td>
                            <td style={{ padding: '2px 0', color: 'var(--amber)', fontSize: 10, textAlign: 'right' as const, whiteSpace: 'nowrap' as const }}>
                              {(h.amt ?? 0)} g
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {yeasts.length > 0 && (
                  <div>
                    <SectionLabel>Yeast</SectionLabel>
                    <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                      <tbody>
                        {yeasts.map(y => (
                          <tr key={y.id}>
                            <td style={{ padding: '2px 8px 2px 0', color: 'var(--text)', fontSize: 10 }} colSpan={3}>
                              {y.name}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes / rating */}
          {hasNotesSection && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stars && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--amber)' }}>{stars}</div>
              )}
              {tastingNotes && (
                <div>
                  <SectionLabel>Tasting Notes</SectionLabel>
                  <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {tastingNotes}
                  </div>
                </div>
              )}
              {changeNotes && (
                <div>
                  <SectionLabel>Changes for Next Time</SectionLabel>
                  <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {changeNotes}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              className="btn sm"
              onClick={e => { e.stopPropagation(); onOpen(); }}
              disabled={isCurrent}
              title={isCurrent ? 'Already viewing this recipe' : 'Open this recipe in the main tab'}
              style={isCurrent ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              Open Recipe
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8,
        color: 'var(--amber)',
        textTransform: 'uppercase' as const,
        letterSpacing: 1,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function recipeBatchLDisplay(r: Recipe): string {
  const n = r.batchL;
  return n != null && isFinite(n) && n > 0 ? `${n}L` : '—';
}
