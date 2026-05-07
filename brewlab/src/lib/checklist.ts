/**
 * Per-recipe checklist storage helpers.
 *
 * `bl_checklist_<recipeId>` is local-only by design (SYNC.md — not in
 * sbDispatch's routing table). Brewer's notes ride in the same blob.
 *
 * The "Complete & Archive" checkbox is the only checklist control that
 * also writes to a synced location: it patches `ferm_meta.packaged`
 * through the store's setFermMeta path. That lives in ChecklistTab.
 *
 * Cross-tab sync inside one device: writes to this blob (from the
 * Checklist tab or from per-tab "Mark X complete" strips) dispatch a
 * window-level CustomEvent so any open tab can refresh without us
 * having to thread the data through Zustand.
 */

import { lsGet, lsLocal } from './storage';

export const CHECKLIST_KEYS = [
  'submitted',
  'brewday',
  'ferm',
  'cold',
  'tax',
  'taxsummary',
  'analysis',
  'inventory',
] as const;

export type ChecklistKey = typeof CHECKLIST_KEYS[number];

export type ChecklistData = Partial<Record<ChecklistKey, boolean>> & {
  'brewers-notes'?: string;
};

/** localStorage key for a recipe's checklist blob. */
export const checklistKey = (recipeId: string) => `bl_checklist_${recipeId}`;

/** Read the blob for a recipe (empty object if none yet). */
export const readChecklist = (recipeId: string): ChecklistData =>
  lsGet<ChecklistData>(checklistKey(recipeId), {});

/** Window event fired after any checklist mutation. */
export const CHECKLIST_EVENT = 'bl-checklist-changed';

export interface ChecklistChangedDetail { recipeId: string; }

/**
 * Patch a single key on the checklist blob (used by per-tab "Mark X complete"
 * strips). Writes via lsLocal — never lsSet — so we don't accidentally
 * route this key into Supabase. Broadcasts CHECKLIST_EVENT so the
 * Checklist tab re-reads if open.
 */
export function setChecklistFlag(
  recipeId: string,
  key: ChecklistKey,
  value: boolean,
): void {
  const current = readChecklist(recipeId);
  const next: ChecklistData = { ...current, [key]: value };
  lsLocal(checklistKey(recipeId), next);
  window.dispatchEvent(
    new CustomEvent<ChecklistChangedDetail>(CHECKLIST_EVENT, { detail: { recipeId } }),
  );
}
