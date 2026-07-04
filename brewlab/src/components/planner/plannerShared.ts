/**
 * Planner shared constants + helpers — port of brewlab-desktop.html
 *   • PLANNER_VESSELS         (line 13469) — vessel groups
 *   • BREW_SWATCHES           (line 13479) — colour palette
 *   • ACTION_TYPES            (line 13485) — DH / CRASH / XFER / CUSTOM
 *   • PLANNER_DAYS / DAY_W /
 *     LABEL_W / row heights   (lines 13493–13501)
 *
 * Vessel groups in HTML are a hardcoded const. The React port derives
 * them from the live `tankCalib` map (which the Tanks settings panel
 * already uses as the canonical tank list — TanksPanel.tsx +
 * BrewDayTab.tsx:248). Brewhouse and Unassigned are constant rows
 * because the HTML has them constant.
 */

import type { TankCalibration } from '../../types';

// Layout — verbatim HTML line 13493 onwards.
export const PLANNER_DAYS = 42;
export const PRIMARY_H    = 28;          // primary brew bar height
export const LANE_H       = 14;          // per-action strip lane
export const ROW_H        = 48;          // compact vessel row (was 58 = 2 action lanes)
export const GROUP_H      = 22;          // vessel-group header strip
export const LABEL_W      = 120;         // sticky vessel-label column
export const DAY_W        = 28;
export const MONTH_H      = 22;
export const DAY_H        = 32;

// Colour palette for new brews (HTML line 13479).
export const BREW_SWATCHES = [
  '#c0392b', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e91e8c', '#00bcd4', '#607d8b',
  '#8d6e63', '#546e7a', '#d4820f', '#52a85e', '#7e57c2',
];

// Action type schema — HTML 13485. Colour values sit on the action
// strip segments; label is what shows up on the bar + upcoming-actions
// panel (replaced by act.label when type === 'custom').
export interface ActionTypeDef {
  label: string;
  color: string;
  /** Bright variant used for the action-list dot (matching HTML's
   *  `replace('0.7','1').replace('0.75','1')` trick at line 13986). */
  dotColor: string;
}

export const ACTION_TYPES: Record<string, ActionTypeDef> = {
  dh:     { label: 'DH',     color: 'rgba(52,168,83,0.75)',  dotColor: 'rgba(52,168,83,1)'   },
  crash:  { label: 'CRASH',  color: 'rgba(66,133,244,0.75)', dotColor: 'rgba(66,133,244,1)'  },
  xfer:   { label: 'XFER',   color: 'rgba(156,39,176,0.7)',  dotColor: 'rgba(156,39,176,1)'  },
  custom: { label: 'CUSTOM', color: 'rgba(120,120,130,0.7)', dotColor: 'rgba(120,120,130,1)' },
};

export interface VesselGroup {
  group: 'BREWHOUSE' | 'FERMENTERS' | 'BRIGHT TANKS' | 'UNASSIGNED';
  vessels: { id: string; name: string }[];
}

/** Sort fv1, fv2, fv10 — not fv1, fv10, fv2. Same helper TanksPanel uses. */
function naturalSort(a: string, b: string): number {
  const re = /^([a-z]+)(\d+)$/i;
  const am = a.match(re), bm = b.match(re);
  if (am && bm && am[1] === bm[1]) return parseInt(am[2], 10) - parseInt(bm[2], 10);
  return a.localeCompare(b);
}

/**
 * Derive the planner's vessel groups from the live tankCalib slice.
 * Brewhouse and Unassigned are constant single-row groups; FERMENTERS
 * and BRIGHT TANKS come from tankCalib keyed `fv*` / `bt*` (matches
 * the convention in TanksPanel.tsx).
 *
 * Names fall back to the uppercased id when calib has no `name` set.
 */
export function deriveVesselGroups(tankCalib: Record<string, TankCalibration>): VesselGroup[] {
  const fvIds = Object.keys(tankCalib).filter(k => k.toLowerCase().startsWith('fv')).sort(naturalSort);
  const btIds = Object.keys(tankCalib).filter(k => k.toLowerCase().startsWith('bt')).sort(naturalSort);
  const named = (id: string): string => tankCalib[id]?.name?.trim() || id.toUpperCase();
  return [
    { group: 'BREWHOUSE',    vessels: [{ id: 'bh', name: 'Brewhouse' }] },
    { group: 'FERMENTERS',   vessels: fvIds.map(id => ({ id, name: named(id) })) },
    { group: 'BRIGHT TANKS', vessels: btIds.map(id => ({ id, name: named(id) })) },
    { group: 'UNASSIGNED',   vessels: [{ id: 'unassigned', name: 'Unassigned' }] },
  ];
}

/** Find a vessel display name across all groups. */
export function findVesselName(groups: VesselGroup[], id: string): string {
  for (const g of groups) for (const v of g.vessels) if (v.id === id) return v.name;
  return id;
}

export const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
