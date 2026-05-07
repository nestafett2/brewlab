/**
 * Brew Checklist tab — port of brewlab-desktop.html lines 1658–1804 (markup)
 * + 5485–5596 (saveChecklist / loadChecklistPage / archiveChanged /
 *   updateChecklistProgress / updateChecklistTabDot / tabCompleteChanged /
 *   syncChecklistToTab / loadTabCompleteStrips).
 *
 * Storage:
 *   - Per-recipe checklist state lives in `bl_checklist_<recipeId>` and is
 *     LOCAL-ONLY by design (SYNC.md: bl_checklist_* is not in sbDispatch's
 *     routing table). Brewer's notes ride in the same blob.
 *   - The "Complete & Archive" checkbox writes ferm_meta.packaged through
 *     the store's setFermMeta → lsSet → sbDispatch → ferm_meta upsert.
 *     That's the one signal that DOES sync; it drives the active-brew
 *     filter on tablet/mobile and `fermStatus === 'Packaged'`.
 *
 * Cross-tab sync:
 *   - Brew Day / Ferm / Packaging tabs each render a small "Mark X complete"
 *     strip that round-trips through the same `bl_checklist_<id>` blob.
 *   - Both directions broadcast a window-level `bl-checklist-changed` event
 *     so the live tabs refresh without needing a Zustand slice (the data
 *     is per-recipe, local-only, and short-lived enough not to warrant one).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { lsLocal } from '../../lib/storage';
import {
  CHECKLIST_KEYS, CHECKLIST_EVENT,
  checklistKey, readChecklist,
} from '../../lib/checklist';
import type { ChecklistData, ChecklistKey, ChecklistChangedDetail } from '../../lib/checklist';
import type { RecipeSubTab } from '../../pages/Desktop';

interface Props {
  recipeId:      string;
  goToSubTab:    (t: RecipeSubTab) => void;
  goToTopLevel:  (t: string) => void;
}

interface RowSpec {
  key:     ChecklistKey;
  title:   string;
  sub:     string;
  go:      () => void;          // resolved at render time
}

export default function ChecklistTab({ recipeId, goToSubTab, goToTopLevel }: Props) {
  const getFermMeta = useStore(s => s.getFermMeta);
  const setFermMeta = useStore(s => s.setFermMeta);

  // ── State ────────────────────────────────────────────────────────────────
  const [data, setData] = useState<ChecklistData>(() => readChecklist(recipeId));
  const [archived, setArchived] = useState<boolean>(() => !!getFermMeta(recipeId).packaged);

  // Listen for cross-tab updates (Brew Day/Ferm/Packaging strips writing
  // through to the same blob). We only refresh when the event names this
  // recipe — other recipes' strip changes are irrelevant.
  useEffect(() => {
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<ChecklistChangedDetail>;
      if (ce.detail?.recipeId === recipeId) {
        setData(readChecklist(recipeId));
      }
    };
    window.addEventListener(CHECKLIST_EVENT, onChange);
    return () => window.removeEventListener(CHECKLIST_EVENT, onChange);
  }, [recipeId]);

  // ── Persist patches ──────────────────────────────────────────────────────
  const persist = useCallback((next: ChecklistData) => {
    lsLocal(checklistKey(recipeId), next);
    window.dispatchEvent(new CustomEvent(CHECKLIST_EVENT, { detail: { recipeId } }));
  }, [recipeId]);

  // Checkbox toggle (immediate write — discrete event)
  const toggle = useCallback((key: ChecklistKey, checked: boolean) => {
    setData(prev => {
      const next: ChecklistData = { ...prev, [key]: checked };
      persist(next);
      return next;
    });
  }, [persist]);

  // Brewer's notes (debounced 400ms, matches FermTab pattern)
  const notesTimer = useRef<number | null>(null);
  const onNotesChange = useCallback((value: string) => {
    setData(prev => ({ ...prev, 'brewers-notes': value }));
    if (notesTimer.current != null) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => {
      const current = readChecklist(recipeId);
      const next: ChecklistData = { ...current, 'brewers-notes': value };
      persist(next);
    }, 400);
  }, [persist, recipeId]);

  useEffect(() => () => {
    if (notesTimer.current != null) window.clearTimeout(notesTimer.current);
  }, []);

  // ── Complete & Archive (the one cross-device write) ─────────────────────
  const onArchiveChange = useCallback((checked: boolean) => {
    setArchived(checked);
    const meta = getFermMeta(recipeId);
    setFermMeta(recipeId, { ...meta, packaged: checked });
  }, [recipeId, getFermMeta, setFermMeta]);

  // ── Progress derived from data ───────────────────────────────────────────
  const { done, total, pct } = useMemo(() => {
    const total = CHECKLIST_KEYS.length;
    const done = CHECKLIST_KEYS.filter(k => !!data[k]).length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [data]);

  // ── Row specs (titles + sub copy verbatim from HTML) ─────────────────────
  // Note: HTML's "Recipe Submitted" Go-button targets subtab-tax — that's a
  // routing bug in the HTML. The row's meaning is "NTA submission filed" =
  // the top-level NTA Submitter (CC1-5610-6) page, not the per-recipe Tax
  // tab. Routing fixed here.
  const rows: RowSpec[] = useMemo(() => [
    { key: 'submitted',  title: 'Recipe Submitted',                  sub: 'NTA recipe submission filed',                go: () => goToTopLevel('submitter') },
    { key: 'brewday',    title: 'Brew Day',                          sub: 'Mash, boil, and pitch logged',               go: () => goToSubTab('brewday') },
    { key: 'ferm',       title: 'Fermentation',                      sub: 'Fermentation complete, FG reached',          go: () => goToSubTab('ferm') },
    { key: 'cold',       title: 'Packaging',                         sub: 'Kegging, canning, and cold side complete',   go: () => goToSubTab('cold') },
    { key: 'tax',        title: 'Tax Updated',                       sub: 'Tax record updated and recorded to master',  go: () => goToSubTab('tax') },
    { key: 'taxsummary', title: 'Tax Summary Updated & Printed',     sub: 'Tax summary reviewed and printed for records', go: () => goToSubTab('taxsummary') },
    { key: 'analysis',   title: 'Analysis Filled Out & Printed',     sub: 'Brew analysis complete and printed',         go: () => goToSubTab('analysis') },
    { key: 'inventory',  title: 'All Inventories Updated',           sub: 'Grain, hop, yeast, and misc inventory reconciled', go: () => goToTopLevel('inventory') },
  ], [goToSubTab, goToTopLevel]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header strip */}
      <div className="tax-header">
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)' }}>
          BREW CHECKLIST
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          Track completion across all stages
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            {done} / {total} complete
          </span>
          <div style={{ width: 120, height: 6, background: 'var(--border2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--amber)', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* Checklist rows */}
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(r => {
            const checked = !!data[r.key];
            return (
              <div key={r.key} className={`checklist-row${checked ? ' done' : ''}`}>
                <label className="checklist-label">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => toggle(r.key, e.target.checked)}
                  />
                  <span className="checklist-check-box" />
                  <div className="checklist-text">
                    <span className="checklist-title">{r.title}</span>
                    <span className="checklist-sub">{r.sub}</span>
                  </div>
                </label>
                <button
                  className="btn sm"
                  onClick={r.go}
                  style={{ fontSize: 9, flexShrink: 0 }}
                >
                  Go →
                </button>
              </div>
            );
          })}
        </div>

        {/* Beer Description */}
        <div style={{ maxWidth: 640, margin: '20px auto 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: 6 }}>
            Beer Description
          </div>
          <textarea
            value={data['brewers-notes'] ?? ''}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Beer description for the sales team — tasting notes, style, food pairings, story..."
            style={{
              width: '100%', height: 100,
              background: 'var(--panel2)', border: '1px solid var(--border2)',
              borderRadius: 8, color: 'var(--text)',
              fontFamily: 'var(--mono)', fontSize: 11,
              padding: '10px 12px', resize: 'vertical' as const, outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>

        {/* Send to Sales Team — stub, mirrors HTML */}
        <div style={{ maxWidth: 640, margin: '16px auto 0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn"
            disabled
            title="Coming soon — send batch summary to sales team"
            style={{ opacity: 0.4, cursor: 'not-allowed' }}
          >
            📤 Send to Sales Team
          </button>
        </div>

        {/* Complete & Archive */}
        <div
          style={{
            maxWidth: 640, margin: '24px auto 0',
            border: '1px solid color-mix(in srgb, var(--amber) 35%, var(--border2))',
            borderRadius: 10,
            padding: '18px 20px',
            background: 'color-mix(in srgb, var(--amber) 6%, var(--panel2))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1 }}>
              <input
                type="checkbox"
                checked={archived}
                onChange={e => onArchiveChange(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--amber)', cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--amber)', letterSpacing: '0.05em' }}>
                  Complete &amp; Archive
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                  Marks this brew as finished. Removed from active brews on all devices after next sync. Can be undone by unchecking.
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

