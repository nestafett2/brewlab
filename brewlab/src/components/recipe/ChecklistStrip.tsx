/**
 * Per-tab "Mark X complete" strip — the bottom-of-stage checkbox shared by
 * Brew Day, Fermentation, and Packaging tabs. Round-trips through the same
 * `bl_checklist_<recipeId>` blob the Checklist tab uses (local-only — see
 * SYNC.md and lib/checklist.ts).
 *
 * HTML reference: brewlab-desktop.html `tabCompleteChanged` /
 * `loadTabCompleteStrips` (lines 5567–5596).
 */

import { useEffect, useState } from 'react';
import {
  CHECKLIST_EVENT,
  readChecklist,
  setChecklistFlag,
} from '../../lib/checklist';
import type { ChecklistKey, ChecklistChangedDetail } from '../../lib/checklist';

interface Props {
  recipeId: string;
  clKey:    ChecklistKey;
  label:    string;
}

export default function ChecklistStrip({ recipeId, clKey, label }: Props) {
  const [checked, setChecked] = useState<boolean>(
    () => !!readChecklist(recipeId)[clKey],
  );

  // Refresh from blob whenever any source mutates the checklist for this recipe
  // (Checklist tab, sibling strip on another tab — both fire CHECKLIST_EVENT).
  useEffect(() => {
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<ChecklistChangedDetail>;
      if (ce.detail?.recipeId === recipeId) {
        setChecked(!!readChecklist(recipeId)[clKey]);
      }
    };
    window.addEventListener(CHECKLIST_EVENT, onChange);
    return () => window.removeEventListener(CHECKLIST_EVENT, onChange);
  }, [recipeId, clKey]);

  const id = `${clKey}-complete-${recipeId}`;

  return (
    <div className="stage-complete-strip">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => {
          setChecked(e.target.checked);
          setChecklistFlag(recipeId, clKey, e.target.checked);
        }}
      />
      <label htmlFor={id} style={{ cursor: 'pointer' }}>{label}</label>
    </div>
  );
}
