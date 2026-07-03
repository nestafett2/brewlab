/**
 * Global Zustand store — single source of truth during a session.
 * Reads from localStorage on init. Writes go through lsSet (→ localStorage + Supabase).
 */

import { create } from 'zustand';
import { lsGet, lsSet, lsLocal, lsRemove } from '../lib/storage';
import {
  sbFetchHydration, sbApplyHydration, resetSupabaseClient,
  sbHardDeleteRecipe, sbDispatch,
  PER_RECIPE_KEY_PREFIXES,
  type LocalContext, type PendingFermLogDeletion,
} from '../lib/supabase';
import { newRecipeId, today } from '../lib/utils';
import {
  TOAST_STACK_MAX, UNDO_HISTORY_MAX,
  TOAST_DURATION_DEFAULT, TOAST_DURATION_WITH_UNDO,
  type ToastSpec, type ToastInput, type UndoEntry,
} from '../lib/toast';
import {
  pullIngredientTotals,
  pullTaxDataFromTabs,
  buildSnapshot,
  mergeTaxFieldUpdate,
  applyAutoClassification,
  LIVE_RECOMPUTE_KEYS,
} from '../lib/tax';
import type {
  Recipe, Ingredient, FermLogEntry, FermMeta, BrewDayData, ColdSideData,
  WaterChemData,
  MaltLib, HopLib, YeastLib, MiscLib, TankCalibration, CustomStyle, StyleOverlay, EquipmentProfile,
  WaterProfile, MashProfile, PitchProfile, BreweryNote, Folder,
  BrewSettings, TabVisibility, PlannerBrew, YearlyData, HarvestedYeast,
  LedgerData, OrderEntry,
  TaxRecord, TaxMasterRow, Classification, NtaSubmission,
  RecipeProfileSelections, RecipeProfileKind,
  Template, TariffData,
} from '../types';

// === Toast timer state ===
//
// Timers are tracked outside React state because they're side-effects,
// not data. Map keyed on toast id; each entry is a setTimeout handle
// for the auto-dismiss. Removed when the toast is dismissed (manually
// or via the timer firing). Hover-to-pause is handled in the Toast
// component itself, not here — it clears the entry's timer and reissues
// a fresh one on mouseleave.
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

let _toastIdCounter = 0;
const nextToastId = (): string => `toast_${++_toastIdCounter}`;

// === Helpers ===

/**
 * Parse a version string ("1.7", "2.0", "v1.0") into a `{major, minor}`
 * pair. Tolerant: missing or non-numeric segments default to 0.
 * Used by createNextRecipeFromCurrent to compute the new version.
 */
function parseVersion(v: string | undefined): { major: number; minor: number } {
  const s = String(v ?? '').replace(/^v/i, '').trim();
  const parts = s.split('.');
  const major = parseInt(parts[0] ?? '', 10);
  const minor = parseInt(parts[1] ?? '', 10);
  return {
    major: isFinite(major) ? major : 1,
    minor: isFinite(minor) ? minor : 0,
  };
}

/** Inverse of parseVersion. */
function formatVersion({ major, minor }: { major: number; minor: number }): string {
  return `${major}.${minor}`;
}

/**
 * Format the prompt shown when sbFetchHydration reports ferm log row
 * tombstones from another device. Recipe archival is unprompted under the
 * two-tier deletion model — only ferm log row deletes still require
 * cross-device confirmation (they're individual readings the brewer might
 * not want to lose silently).
 */
function buildDeletionPrompt(fermLogs: PendingFermLogDeletion[]): string {
  const byRecipe = new Map<string, number>();
  for (const e of fermLogs) {
    byRecipe.set(e.recipeId, (byRecipe.get(e.recipeId) ?? 0) + 1);
  }
  const total = fermLogs.length;
  const recipeCount = byRecipe.size;
  return [
    'This sync will remove the following from this device:',
    '',
    `${total} ferm log entr${total === 1 ? 'y' : 'ies'} across ${recipeCount} recipe${recipeCount === 1 ? '' : 's'}.`,
    '',
    'Continue?',
  ].join('\n');
}

// === Default values ===

const DEFAULT_SETTINGS: BrewSettings = {
  breweryName: '',
  sbUrl: '',
  sbAnonKey: '',
  units: 'metric',
  ibuMethod: 'tinseth',
  whirlpoolTemp: 85,
  mashHopAdj: -80,
  leafHopAdj: -10,
  largeBatchUtil: 100,
};

const DEFAULT_TAB_VISIBILITY: TabVisibility = {
  planner: false,
  inventory: false,
  orderPlanner: false,
  submitter: false,
  taxMaster: false,
  tariffReduction: false,
};

// === Snapshot shape for delete/undo ===

/**
 * Frozen pre-delete state of one recipe — recipe row + every per-recipe
 * blob the brewer might have touched. Captured by captureRecipeSnapshot
 * before hardDeleteRecipe fires so toast undo can restore the full state.
 *
 * Tax records and tax_master entries are intentionally absent: the
 * deletion path preserves them, so there's nothing to restore.
 */
export interface RecipeDeleteSnapshot {
  recipe: Recipe;
  ingredients: Ingredient[];
  brewDay: BrewDayData;
  fermMeta: FermMeta;
  coldSide: ColdSideData;
  waterChem: WaterChemData;
  recipeProfiles: RecipeProfileSelections;
  // bl_mash_<id> blob. `null` when the user has no saved profile.
  mash: MashProfile | null;
  fermLog: FermLogEntry[];
  // bl_checklist_<id> — local-only state, restored for completeness.
  checklist: unknown;
}

// === Store shape ===

export interface BrewLabState {
  // Data
  recipes: Recipe[];
  settings: BrewSettings;
  tabVisibility: TabVisibility;
  folders: Folder[];
  maltLib: MaltLib[];
  hopLib: HopLib[];
  yeastLib: YeastLib[];
  miscLib: MiscLib[];
  tankCalib: Record<string, TankCalibration>;
  customStyles: Record<string, CustomStyle>;
  /** Per-style descriptive overlay — keyed by styleKey ('21A' for BJCP,
   *  'custom_<ts>' for custom). Holds the descriptive fields (notes,
   *  description, profile, etc.) for BJCP styles since the BJCP_2021
   *  const isn't writable. Custom styles persist their descriptive
   *  fields directly on CustomStyle and ignore this dict. See type doc
   *  on StyleOverlay for the full rationale. */
  styleOverlays: Record<string, StyleOverlay>;
  equipProfiles: EquipmentProfile[];
  waterProfiles: WaterProfile[];
  mashProfiles: MashProfile[];
  pitchProfiles: PitchProfile[];
  plannerBrews: PlannerBrew[];
  /** bl_yearly — Yearly Overview KPI list, keyed "<year>-<monthIndex>".
   *  Decision (2026-05-04): synced via the settings table. HTML kept
   *  this local-only; the rebuild syncs everything that's brewery-wide. */
  yearlyData: YearlyData;
  breweryNotes: BreweryNote[];
  suppliers: string[];
  /** Strain-keyed dict — see HarvestedYeast in types/index.ts. Replaced
   *  the legacy flat-array shape that was never consumed by UI. */
  harvestedYeast: HarvestedYeast;
  /** bl_ledger — per-ingredient tax ledger keyed by `<sec>_<libId>`.
   *  High-stakes (NTA compliance). Synced via the settings table —
   *  bl_ledger is in SETTINGS_KEYS. */
  ledgerData: LedgerData;
  /** bl_orders — Order Planner entries. Synced via the settings table —
   *  bl_orders is in SETTINGS_KEYS. */
  orders: OrderEntry[];
  /** bl_templates — recipe templates. Synced via the settings table —
   *  bl_templates is in SETTINGS_KEYS. Mirrors HTML brewlab-desktop.html:5119. */
  templates: Template[];
  /** Per-fiscal-year Tariff Reduction blobs, lazy-loaded from
   *  `bl_tariff_<year>`. Synced via the settings table — `bl_tariff_*`
   *  is matched by SETTINGS_KEY_PREFIXES so each FY round-trips as one
   *  settings row. Mirrors HTML brewlab-desktop.html:8910. */
  tariffByYear: Record<number, TariffData>;

  // Per-recipe data (reactive — cached in state)
  ingredientsByRecipe: Record<string, Ingredient[]>;

  // Per-recipe profile selections (Equipment / Water / Pitch / Mash).
  // Mirrors the HTML `bl_recipe_profiles_<recipeId>` blob. Reactive so the
  // recipe-level Profiles bar dropdowns and BrewDayTab/WaterTab consumers
  // recompute live when the user picks a profile.
  recipeProfilesByRecipe: Record<string, RecipeProfileSelections>;

  // Per-recipe MASH profile blob (`bl_mash_<recipeId>`). Reactive cache so
  // BrewDayTab + WaterTab refresh when MashProfileModal saves while they're
  // mounted (they're cross-component readers; MashProfileModal is the
  // writer). `undefined` = not yet loaded into cache; `null` = loaded but
  // user has no saved profile (consumers fall back to DEFAULT_MASH_PROFILE).
  mashByRecipe: Record<string, MashProfile | null>;

  // Tax records — per-recipe working blob, lazy-loaded like ingredientsByRecipe
  taxRecordsByRecipe: Record<string, TaxRecord>;
  // Field-level manual-override flags. recipeId → set of dashed-key fields
  // the user has manually edited on the Tax tab. Mirrors HTML's
  // data-manualOverride DOM attribute. Local-only — never syncs to Supabase.
  taxManualOverrides: Record<string, Record<string, true>>;
  // Committed Tax Master rows (single array, mirrors HTML bl_tax_master).
  taxMaster: TaxMasterRow[];

  // NTA submission register (single array, mirrors HTML bl_nta_register).
  ntaRegister: NtaSubmission[];
  // Persisted free-form "製造見込数量の算出根基等" default text. Used by the
  // submission flow as the basis text on each new entry. Mirrors HTML
  // bl_nta_basis_default (line 11855).
  ntaBasisDefault: string;
  // Per-session current text — saved by the Basis modal's "Save" button.
  // HTML mirrors this at bl_nta_basis_current but never reads it back, so
  // the field is functionally session-scratch storage. Kept for parity.
  ntaBasisCurrent: string;

  // UI state
  activeTab: string;
  // Active sub-tab on the Settings page. Driven by both the side-nav inside
  // SettingsPanel and the menu-bar Settings dropdown — clicking "Bitterness"
  // in the dropdown sets this then navigates to the Settings tab so the panel
  // lands on the requested section instead of the default. Mirrors HTML
  // openSettingsTab(section) (brewlab-desktop.html:16614).
  settingsSection: string;
  // Active sub-section on the Libraries page (malts/hops/yeast/misc). Same
  // pattern as settingsSection: the Libraries menu items in the menu bar
  // set this before navigating so "Hop Library" lands directly on Hops.
  librariesSection: 'malts' | 'hops' | 'yeast' | 'misc';
  // One-shot pre-fill request for the Planner's Add Brew modal. Set by
  // RecipeTab's "Add to Planner" sidebar button (HTML
  // addCurrentRecipeToPlanner, brewlab-desktop.html:13522). PlannerPage
  // consumes it on mount/render and clears it back to null. Local-only —
  // never synced.
  pendingPlannerAdd: { recipeId: string; recipeName: string } | null;
  // bl_inv_stock — opening-balance dictionary keyed by `<sec>_<id>` (e.g.
  // 'malts_42'). Populated by BeerXML / BSMX import (the <INVENTORY> /
  // F_G_INVENTORY field) and by the Libraries entry modal's stock input.
  // Round-trips via the settings table since 'bl_inv_stock' is in
  // SETTINGS_KEYS. The Inventory page (not yet ported) reads this as a
  // pre-ledger starting balance.
  inventoryStock: Record<string, number>;
  // bl_lib_next_id — sequential id counter per library section. HTML uses
  // numeric ids (libNextId.malts++, etc.); React mirrors that so imported
  // / exported BeerXML and BSMX files keep round-tripping cleanly.
  libNextId: { malts: number; hops: number; yeast: number; misc: number };
  selectedRecipeId: string | null;
  syncing: boolean;
  hydrated: boolean;

  // Actions — recipes
  setRecipes: (recipes: Recipe[]) => void;
  updateRecipe: (id: string, updates: Partial<Recipe>) => void;
  addRecipe: (recipe: Recipe) => void;
  /**
   * Hard-delete a recipe. Removes the recipe row, every per-recipe child
   * row (recipe_ingredients, brew_day, ferm_meta, cold_side, water_chem,
   * recipe_profiles, mash, ferm_log), and harvested_yeast entries linked
   * to this recipe — both on Supabase and in localStorage.
   *
   * Preserves: tax_records and tax_master rows (NTA compliance artifacts).
   * The dangling `recipeId` references on tax/yeast rows are surfaced as
   * "(recipe deleted)" labels in TaxMasterPage / HarvestedYeastView.
   *
   * Toast undo (Desktop.tsx) snapshots the full per-recipe state via
   * captureRecipeSnapshot BEFORE this action fires, then calls
   * restoreFromDeleteSnapshots to undo. The restore action handles FK
   * ordering on Supabase (recipe row upsert awaits before children).
   */
  hardDeleteRecipe: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * Capture every per-recipe blob currently in localStorage / store state
   * for one recipe. Used by toast undo closures to snapshot the deletion
   * scope BEFORE hardDeleteRecipe fires (so the snapshot reflects
   * pre-delete state, not the post-delete empty state).
   *
   * Tax records (bl_tax_<id>, bl_tax_master entries) are NOT snapshotted —
   * they survive deletion and don't need restoration.
   */
  captureRecipeSnapshot: (id: string) => RecipeDeleteSnapshot | null;
  /**
   * Restore one or more recipes from snapshots taken before deletion.
   * Pushes everything back to localStorage + Supabase in FK-safe order:
   * recipe rows first (awaited so the recipes-table upsert lands), then
   * child rows in parallel. Also restores the global harvested_yeast dict
   * and planner brews array if the caller passes their pre-delete state.
   */
  restoreFromDeleteSnapshots: (
    snapshots: RecipeDeleteSnapshot[],
    yeastBefore: HarvestedYeast,
    plannerBefore: PlannerBrew[],
  ) => Promise<void>;
  /**
   * Create the next recipe in the source's lineage. Drives all three
   * "+ New Brew" split-button actions on the Brew History tab.
   *
   * Behaviour by versionBump:
   *   • 'none'  — inherit source's version unchanged. The default "+ New
   *               Brew" — same recipe, fresh brew.
   *   • 'minor' — "Amounts Changed". From latest in lineage: bump last
   *               segment (1.7 → 1.8). From non-latest source: jump to
   *               next major from latest (latest 2.3, source 1.0 → 3.0)
   *               — see addendum in the task brief.
   *   • 'major' — "Ingredients Changed". From any source: next major
   *               from latest in lineage (1.7 → 2.0, latest 2.3 → 3.0).
   *
   * In every variant: brewNumber = max(brewNumber in lineage) + 1,
   * lineageId is shared with source (backfilled on source if missing),
   * ingredients + water-chem deep-copied, brew-day / ferm-log / ferm-meta
   * / cold-side blobs cleared. taxBatch reset to '' (unique-constraint-safe).
   *
   * Returns the new recipe id, or null on failure.
   */
  createNextRecipeFromCurrent: (
    sourceId: string,
    opts: {
      versionBump: 'none' | 'minor' | 'major';
      note?: string;
      beerName?: string;
    },
  ) => string | null;
  /**
   * Duplicate a recipe as a brand-new independent recipe. Different from
   * createNextRecipeFromCurrent: a duplicate gets a FRESH lineageId so it
   * doesn't appear under the source's History; it's a new recipe lineage
   * with copied ingredients. Mirrors HTML rbCtxDuplicate
   * (brewlab-desktop.html:4871) plus the deliberate fresh-lineage divergence
   * (HTML's deep-clone accidentally kept the source's lineageId).
   * Returns the new recipe id, or null on failure.
   */
  duplicateRecipe: (sourceId: string) => string | null;

  // Actions — templates (HTML brewlab-desktop.html:5119–5150)
  setTemplates: (templates: Template[]) => void;
  /** Snapshot the active recipe (design fields + deep-copied ingredients)
   *  into a new template. Returns the new template id. */
  saveRecipeAsTemplate: (recipeId: string, name: string) => string | null;
  /** Confirm dialog handled by the caller. */
  deleteTemplate: (templateId: string) => void;
  /** Create a fresh recipe from a template. Allocates a new recipeId,
   *  deep-copies ingredients with React-format ids (`${newId}_${idx}`),
   *  and persists per-recipe blobs. Returns the new recipe id. */
  createRecipeFromTemplate: (templateId: string, opts: { name: string; folderId?: string }) => string | null;

  // Actions — Tariff Reduction (HTML brewlab-desktop.html:8910–8911)
  /** Lazy-load the per-FY blob. Mirrors getIngredients pattern. */
  getTariff: (year: number) => TariffData;
  /** Persist the per-FY blob. Synced via the settings table by way of
   *  the bl_tariff_* prefix in SETTINGS_KEY_PREFIXES. */
  setTariff: (year: number, data: TariffData) => void;

  // Actions — per-recipe data (reactive)
  getIngredients: (recipeId: string) => Ingredient[];
  loadIngredients: (recipeId: string) => void;
  setIngredients: (recipeId: string, ings: Ingredient[]) => void;
  addIngredient: (recipeId: string, ing: Ingredient) => void;
  removeIngredient: (recipeId: string, ingId: string) => void;
  updateIngredient: (recipeId: string, ingId: string, updates: Partial<Ingredient>) => void;
  getFermLog: (recipeId: string) => FermLogEntry[];
  setFermLog: (recipeId: string, entries: FermLogEntry[]) => void;
  addFermLogEntry: (recipeId: string, entry: FermLogEntry) => void;
  getFermMeta: (recipeId: string) => FermMeta;
  setFermMeta: (recipeId: string, meta: FermMeta) => void;
  getBrewDay: (recipeId: string) => BrewDayData;
  setBrewDay: (recipeId: string, data: BrewDayData) => void;
  getColdSide: (recipeId: string) => ColdSideData;
  setColdSide: (recipeId: string, data: ColdSideData) => void;
  getWaterChem: (recipeId: string) => WaterChemData;
  setWaterChem: (recipeId: string, data: WaterChemData) => void;
  getMash: (recipeId: string) => MashProfile | null;
  setMash: (recipeId: string, profile: MashProfile | null) => void;

  // Actions — libraries
  setMaltLib: (lib: MaltLib[]) => void;
  setHopLib: (lib: HopLib[]) => void;
  setYeastLib: (lib: YeastLib[]) => void;
  setMiscLib: (lib: MiscLib[]) => void;

  // Actions — settings/config
  setSettings: (settings: Partial<BrewSettings>) => void;
  setTabVisibility: (vis: Partial<TabVisibility>) => void;
  setFolders: (folders: Folder[]) => void;
  setTankCalib: (calib: Record<string, TankCalibration>) => void;
  setEquipProfiles: (profiles: EquipmentProfile[]) => void;
  setCustomStyles: (styles: Record<string, CustomStyle>) => void;
  setStyleOverlays: (overlays: Record<string, StyleOverlay>) => void;
  setWaterProfiles: (profiles: WaterProfile[]) => void;
  setMashProfiles: (profiles: MashProfile[]) => void;
  setPitchProfiles: (profiles: PitchProfile[]) => void;
  setSuppliers: (suppliers: string[]) => void;

  // Actions — planner & notes
  setPlannerBrews: (brews: PlannerBrew[]) => void;
  setYearlyData: (data: YearlyData) => void;
  setBreweryNotes: (notes: BreweryNote[]) => void;
  addBreweryNote: (note: BreweryNote) => void;
  deleteBreweryNote: (id: string) => void;

  // Actions — harvested yeast
  setHarvestedYeast: (yeast: HarvestedYeast) => void;
  setLedgerData: (data: LedgerData) => void;
  /** Append an entry to the ledger key, persist + sync. */
  addLedgerEntry: (key: string, entry: import('../types').LedgerEntry) => void;
  /** Replace an entry at idx (sorted-by-date order resolved by caller —
   *  HTML resolves it via openEditLedgerEntry's index-mapping). */
  updateLedgerEntry: (key: string, idx: number, entry: import('../types').LedgerEntry) => void;
  deleteLedgerEntry: (key: string, idx: number) => void;
  setOrders: (orders: OrderEntry[]) => void;
  addOrder: (order: OrderEntry) => void;
  updateOrder: (id: string, updates: Partial<OrderEntry>) => void;
  /** Apply the same partial update to every order whose id is in `ids`.
   *  Used by the Orders panel's bulk Mark Ordered / Mark Received actions. */
  bulkUpdateOrders: (ids: string[], updates: Partial<OrderEntry>) => void;
  deleteOrder: (id: string) => void;

  // Actions — per-recipe profile selections
  /** Lazy-load the selections blob for a recipe. Mirrors getIngredients. */
  getRecipeProfiles: (recipeId: string) => RecipeProfileSelections;
  /** Persist a single profile-kind selection for a recipe. */
  setRecipeProfileKind: (recipeId: string, kind: RecipeProfileKind, profileId: string) => void;

  // Actions — tax
  /** Lazy-load tax record. Mirrors getIngredients pattern. */
  getTaxRecord: (recipeId: string) => TaxRecord;
  /**
   * Open the Tax tab for this recipe — caches into state, then runs the
   * live ingredient recompute on the LIVE_RECOMPUTE_KEYS allowlist (HTML
   * loadTaxPage). snap-* fields are physically untouched because the
   * allowlist is disjoint from SNAP_KEYS (asserted at module load).
   */
  loadTaxRecord: (recipeId: string) => void;
  /** Single-field write that marks the field as a manual override. */
  setTaxRecordField: (recipeId: string, key: keyof TaxRecord, value: unknown) => void;
  /**
   * Pull data from recipe + brew-day + cold-side into the tax record
   * (HTML's "Update from Recipe" button). Returns flags so the calling
   * component can prompt with native confirm() before forcing through.
   *
   * If `confirmOverwrite` is supplied and there are manual-override fields
   * about to be replaced, the action calls it. Returning false aborts.
   */
  updateTaxFromRecipe: (recipeId: string, options?: {
    confirmOverwrite?: () => boolean;
  }) => { applied: boolean; blanks: string[] };
  /**
   * Snapshot cold-side packaging into snap-* fields (write-once via
   * buildSnapshot) and append/upsert into tax_master. Mirrors HTML
   * recordToTaxMaster including blank-field warning and overwrite confirm.
   */
  recordToTaxMaster: (recipeId: string, options?: {
    confirmBlanks?: (blanks: string[]) => boolean;
    confirmOverwrite?: (existingRecordedAt: string) => boolean;
  }) => { recorded: boolean };
  setTaxMaster: (rows: TaxMasterRow[]) => void;
  /**
   * Single canonical setter for recipe.classification. Mirrors HTML's
   * syncClassification — every component reads recipe.classification and
   * calls this action; nothing else writes the field. Clears the 'class'
   * manual-override flag for this recipe.
   */
  setRecipeClassification: (recipeId: string, cls: Classification) => void;
  /** Compute auto-classification and apply via setRecipeClassification. */
  autoClassifyRecipe: (recipeId: string) => Classification;

  // Actions — NTA register
  addNtaSubmission: (entry: NtaSubmission) => void;
  deleteNtaSubmission: (idx: number) => void;
  /** Replace the full register — used by toast undo paths to restore a
   *  pre-delete snapshot at exactly the same indices. */
  setNtaRegister: (entries: NtaSubmission[]) => void;
  setNtaBasisDefault: (basis: string) => void;
  setNtaBasisCurrent: (basis: string) => void;

  // Actions — navigation
  setActiveTab: (tab: string) => void;
  setSettingsSection: (section: string) => void;
  setLibrariesSection: (section: 'malts' | 'hops' | 'yeast' | 'misc') => void;
  setPendingPlannerAdd: (req: { recipeId: string; recipeName: string } | null) => void;
  setInventoryStock: (stock: Record<string, number>) => void;
  setLibNextId: (next: { malts: number; hops: number; yeast: number; misc: number }) => void;
  selectRecipe: (id: string | null) => void;

  // --- Toasts + decoupled undo history ---
  //
  // Two parallel slices: `toasts` drives the visible toast stack and
  // auto-dismisses; `undoHistory` retains undo closures past toast
  // dismissal so the persistent top-bar Undo button can reach back
  // beyond the visible window. Closures only leave undoHistory when
  // they're invoked or evicted by the UNDO_HISTORY_MAX cap. The two
  // slices share `id` so an undo invocation can dismiss the matching
  // visible toast (if it's still there).
  toasts: ToastSpec[];
  undoHistory: UndoEntry[];
  /** Appends a toast and (when spec.undo) an undoHistory entry. Schedules
   *  the toast's auto-dismiss. Returns the generated id so callers can
   *  dismiss programmatically. Stack-caps: oldest visible toast is
   *  dropped silently past TOAST_STACK_MAX (its closure stays in
   *  history); oldest undoHistory entry is dropped past UNDO_HISTORY_MAX. */
  pushToast: (spec: ToastInput) => string;
  /** Removes the toast from the visible stack. Idempotent. Does NOT
   *  touch undoHistory — the closure remains reachable via the
   *  persistent Undo button until it's invoked or evicted. */
  dismissToast: (id: string) => void;
  /** Pause auto-dismiss for hover. Clears the timer WITHOUT removing the
   *  toast. Call resumeToastTimer(id, ms) on mouseleave to restart. */
  pauseToastTimer: (id: string) => void;
  /** Restart the auto-dismiss timer for a toast. Used by hover-pause's
   *  mouseleave handler to reschedule with full duration. */
  resumeToastTimer: (id: string, ms: number) => void;
  /** Pop the newest entry from undoHistory, run its closure, and
   *  dismiss the matching visible toast (if any). No-op when
   *  undoHistory is empty. Used by Ctrl+Z and the top-bar Undo button. */
  popMostRecentUndo: () => void;
  /** Run the undo for a specific id (used by the per-toast Undo
   *  button), then remove the entry from undoHistory and dismiss the
   *  toast. No-op if the id isn't in undoHistory. */
  popUndoById: (id: string) => void;

  // Actions — sync
  hydrate: () => Promise<void>;
}

export const useStore = create<BrewLabState>((set, get) => ({
  // --- Initial state from localStorage ---
  recipes: lsGet<Recipe[]>('bl_recipe_list', []),
  settings: { ...DEFAULT_SETTINGS, ...lsGet<Partial<BrewSettings>>('bl_brew_settings', {}) },
  tabVisibility: { ...DEFAULT_TAB_VISIBILITY, ...lsGet<Partial<TabVisibility>>('bl_tab_visibility', {}) },
  folders: lsGet<Folder[]>('bl_folder_list', []),
  maltLib: lsGet<MaltLib[]>('bl_lib_malts', []),
  hopLib: lsGet<HopLib[]>('bl_lib_hops', []),
  yeastLib: lsGet<YeastLib[]>('bl_lib_yeast', []),
  miscLib: lsGet<MiscLib[]>('bl_lib_misc', []),
  tankCalib: lsGet<Record<string, TankCalibration>>('bl_tank_calib', {}),
  customStyles: lsGet<Record<string, CustomStyle>>('bl_custom_styles', {}),
  styleOverlays: lsGet<Record<string, StyleOverlay>>('bl_style_overlays', {}),
  equipProfiles: lsGet<EquipmentProfile[]>('bl_equip_profiles', []),
  waterProfiles: lsGet<WaterProfile[]>('bl_water_profiles', []),
  mashProfiles: lsGet<MashProfile[]>('bl_mash_profiles', []),
  pitchProfiles: lsGet<PitchProfile[]>('bl_pitch_profiles', []),
  plannerBrews: lsGet<PlannerBrew[]>('bl_planner_brews', []),
  yearlyData: lsGet<YearlyData>('bl_yearly', {}),
  breweryNotes: lsGet<BreweryNote[]>('bl_brewery_notes', []),
  suppliers: lsGet<string[]>('bl_suppliers', []),
  harvestedYeast: lsGet<HarvestedYeast>('bl_harvested_yeast', {}),
  ledgerData: lsGet<LedgerData>('bl_ledger', {}),
  orders: lsGet<OrderEntry[]>('bl_orders', []),
  templates: lsGet<Template[]>('bl_templates', []),
  tariffByYear: {},

  ingredientsByRecipe: {},
  recipeProfilesByRecipe: {},
  mashByRecipe: {},
  taxRecordsByRecipe: {},
  taxManualOverrides: {},
  taxMaster: lsGet<TaxMasterRow[]>('bl_tax_master', []),

  ntaRegister: lsGet<NtaSubmission[]>('bl_nta_register', []),
  ntaBasisDefault: lsGet<string>('bl_nta_basis_default', ''),
  ntaBasisCurrent: lsGet<string>('bl_nta_basis_current', ''),

  activeTab: 'recipes',
  settingsSection: 'Units',
  librariesSection: 'malts',
  pendingPlannerAdd: null,
  inventoryStock: lsGet<Record<string, number>>('bl_inv_stock', {}),
  libNextId: lsGet<{ malts: number; hops: number; yeast: number; misc: number }>(
    'bl_lib_next_id',
    { malts: 1, hops: 1, yeast: 1, misc: 1 },
  ),
  selectedRecipeId: null,
  syncing: true,     // start true so App.tsx shows loading screen until hydration completes
  hydrated: false,
  toasts: [],
  undoHistory: [],

  // --- Recipes ---
  setRecipes: (recipes) => {
    lsSet('bl_recipe_list', recipes);
    set({ recipes });
  },
  updateRecipe: (id, updates) => {
    const recipes = get().recipes.map(r => r.id === id ? { ...r, ...updates } : r);
    lsSet('bl_recipe_list', recipes);
    set({ recipes });
  },
  addRecipe: (recipe) => {
    const recipes = [...get().recipes, recipe];
    lsSet('bl_recipe_list', recipes);
    set({ recipes });
  },
  hardDeleteRecipe: async (id) => {
    const state = get();
    if (!state.recipes.find(r => r.id === id)) {
      return { ok: true };
    }
    // Hard-delete is universal under the simplified deletion model. Server
    // DELETEs the recipe row + every per-recipe child row (tax_records and
    // tax_master are excluded — sbHardDeleteRecipe never references them).
    const result = await sbHardDeleteRecipe(id);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    // Apply locally. Remove from bl_recipe_list, wipe per-recipe blobs,
    // drop harvested_yeast entries linked to this recipe, drop in-memory
    // caches. tax_records (bl_tax_<id>) is intentionally NOT cleared;
    // see PER_RECIPE_KEY_PREFIXES.
    const recipes = state.recipes.filter(r => r.id !== id);
    lsLocal('bl_recipe_list', recipes);
    for (const prefix of PER_RECIPE_KEY_PREFIXES) {
      lsRemove(`${prefix}${id}`);
    }

    // Remove harvested_yeast entries pointing to this recipe (strain-keyed
    // dict, so we walk strains and filter their entry lists). Empty strains
    // get pruned. Local writes go through lsLocal — Supabase already had
    // them deleted by sbHardDeleteRecipe.
    const yeastDict = state.harvestedYeast;
    let yeastChanged = false;
    const nextYeast: typeof yeastDict = {};
    for (const strain of Object.keys(yeastDict ?? {})) {
      const sd = (yeastDict as Record<string, { generation?: number; entries?: { recipeId?: string }[] }>)[strain];
      const before = sd?.entries ?? [];
      const after = before.filter(e => e.recipeId !== id);
      if (after.length !== before.length) yeastChanged = true;
      if (after.length > 0) {
        nextYeast[strain] = { ...(sd ?? { generation: 1 }), entries: after } as typeof yeastDict[string];
      } else if (before.length === 0) {
        nextYeast[strain] = sd as typeof yeastDict[string];
      }
      // else: strain pruned (had only entries pointing to deleted recipe).
    }
    if (yeastChanged) lsLocal('bl_harvested_yeast', nextYeast);

    const { [id]: _ings, ...remainingIngs } = state.ingredientsByRecipe;
    void _ings;
    const { [id]: _profs, ...remainingProfs } = state.recipeProfilesByRecipe;
    void _profs;
    const { [id]: _mash, ...remainingMash } = state.mashByRecipe;
    void _mash;
    const { [id]: _tax, ...remainingTax } = state.taxRecordsByRecipe;
    void _tax;
    const { [id]: _ovr, ...remainingOvr } = state.taxManualOverrides;
    void _ovr;
    set({
      recipes,
      ingredientsByRecipe: remainingIngs,
      recipeProfilesByRecipe: remainingProfs,
      mashByRecipe: remainingMash,
      taxRecordsByRecipe: remainingTax,
      taxManualOverrides: remainingOvr,
      ...(yeastChanged ? { harvestedYeast: nextYeast } : {}),
    });
    return { ok: true };
  },

  captureRecipeSnapshot: (id) => {
    const state = get();
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return null;
    return {
      recipe,
      ingredients: state.ingredientsByRecipe[id]
        ?? lsGet<Ingredient[]>(`bl_recipe_ings_${id}`, []),
      brewDay:        lsGet<BrewDayData>(`bl_bd_${id}`,             {}),
      fermMeta:       lsGet<FermMeta>(`bl_ferm_meta_${id}`,         {}),
      coldSide:       lsGet<ColdSideData>(`bl_cold_${id}`,          {}),
      waterChem:      lsGet<WaterChemData>(`bl_water_chem_${id}`,   {}),
      recipeProfiles: state.recipeProfilesByRecipe[id]
        ?? lsGet<RecipeProfileSelections>(`bl_recipe_profiles_${id}`, {}),
      mash:           state.mashByRecipe[id]
        ?? lsGet<MashProfile | null>(`bl_mash_${id}`,                 null),
      fermLog:        lsGet<FermLogEntry[]>(`bl_ferm_log_${id}`,    []),
      checklist:      lsGet<unknown>(`bl_checklist_${id}`,           null),
    };
  },

  restoreFromDeleteSnapshots: async (snapshots, yeastBefore, plannerBefore) => {
    if (snapshots.length === 0) return;

    // 1. Restore the recipe rows first. lsLocal updates localStorage and
    //    in-memory state synchronously; sbDispatch is then awaited so the
    //    Supabase recipes upsert lands BEFORE child rows attempt their
    //    inserts (which would otherwise hit FK violations).
    const state = get();
    const existingIds = new Set(state.recipes.map(r => r.id));
    const restoredRecipes = snapshots
      .map(s => s.recipe)
      .filter(r => !existingIds.has(r.id));
    const recipesNext = [...state.recipes, ...restoredRecipes];
    lsLocal('bl_recipe_list', recipesNext);
    set({ recipes: recipesNext });
    await sbDispatch('bl_recipe_list', recipesNext);

    // 2. Per-recipe blobs in parallel — recipe rows are now in Supabase so
    //    every child upsert's FK resolves. lsSet handles localStorage +
    //    Supabase dispatch (fire-and-forget; failures log to console).
    const ingsNext: Record<string, Ingredient[]> = { ...get().ingredientsByRecipe };
    const profsNext: Record<string, RecipeProfileSelections> = { ...get().recipeProfilesByRecipe };
    const mashNext: Record<string, MashProfile | null> = { ...get().mashByRecipe };
    const childPromises: Promise<unknown>[] = [];
    for (const s of snapshots) {
      const id = s.recipe.id;
      ingsNext[id] = s.ingredients;
      profsNext[id] = s.recipeProfiles;
      mashNext[id] = s.mash;

      // Each child write: lsLocal (sync) + sbDispatch (collected for await).
      lsLocal(`bl_recipe_ings_${id}`,      s.ingredients);
      childPromises.push(sbDispatch(`bl_recipe_ings_${id}`, s.ingredients));

      lsLocal(`bl_bd_${id}`,               s.brewDay);
      childPromises.push(sbDispatch(`bl_bd_${id}`, s.brewDay));

      lsLocal(`bl_ferm_meta_${id}`,        s.fermMeta);
      childPromises.push(sbDispatch(`bl_ferm_meta_${id}`, s.fermMeta));

      lsLocal(`bl_cold_${id}`,             s.coldSide);
      childPromises.push(sbDispatch(`bl_cold_${id}`, s.coldSide));

      lsLocal(`bl_water_chem_${id}`,       s.waterChem);
      childPromises.push(sbDispatch(`bl_water_chem_${id}`, s.waterChem));

      lsLocal(`bl_recipe_profiles_${id}`,  s.recipeProfiles);
      childPromises.push(sbDispatch(`bl_recipe_profiles_${id}`, s.recipeProfiles));

      // Mash and checklist are local-only when null (no dispatch route for
      // null values fires anyway — they no-op safely).
      if (s.mash != null) {
        lsLocal(`bl_mash_${id}`, s.mash);
        childPromises.push(sbDispatch(`bl_mash_${id}`, s.mash));
      }
      if (s.checklist != null) {
        lsLocal(`bl_checklist_${id}`, s.checklist);
        // No Supabase route for bl_checklist_<id> — local-only key per SCHEMA.md.
      }

      // Ferm log uses upsert-by-id internally so a re-write restores rows.
      lsLocal(`bl_ferm_log_${id}`, s.fermLog);
      childPromises.push(sbDispatch(`bl_ferm_log_${id}`, s.fermLog));
    }
    set({
      ingredientsByRecipe: ingsNext,
      recipeProfilesByRecipe: profsNext,
      mashByRecipe: mashNext,
    });

    // 3. Global writes. Harvested yeast uses delete-all+reinsert internally
    //    so passing the pre-delete dict back fully restores it. Planner is
    //    a settings-table key.
    lsLocal('bl_harvested_yeast', yeastBefore);
    set({ harvestedYeast: yeastBefore });
    childPromises.push(sbDispatch('bl_harvested_yeast', yeastBefore));

    lsLocal('bl_planner_brews', plannerBefore);
    set({ plannerBrews: plannerBefore });
    childPromises.push(sbDispatch('bl_planner_brews', plannerBefore));

    await Promise.all(childPromises);
  },

  createNextRecipeFromCurrent: (sourceId, opts) => {
    // Replaces the legacy newVersionFromRecipe. Drives all three
    // "+ New Brew" split-button actions on the Brew History tab.
    // Version-bump rules — see the JSDoc on the interface declaration above.
    const state = get();
    const source = state.recipes.find(r => r.id === sourceId);
    if (!source) return null;

    // Lineage: share with source. If source has no lineageId yet, adopt
    // the source's id as the lineage so the original joins (matches HTML
    // saveRecipeAsNewVersion line 5378).
    const lineageId = source.lineageId || source.id;
    const lineageRecipes = state.recipes.filter(
      r => (r.lineageId || r.id) === lineageId,
    );

    // Latest version in the lineage by (major, minor) compare desc.
    const latestVersion = (() => {
      const parsed = lineageRecipes.map(r => parseVersion(r.version));
      parsed.sort((a, b) => b.major - a.major || b.minor - a.minor);
      return parsed[0] ?? { major: 1, minor: 0 };
    })();

    // Compute the new version per the addendum rules.
    const sourceVersion = parseVersion(source.version);
    const newVersion = (() => {
      if (opts.versionBump === 'none') {
        return formatVersion(sourceVersion);
      }
      const sourceIsLatest =
        sourceVersion.major === latestVersion.major &&
        sourceVersion.minor === latestVersion.minor;
      if (!sourceIsLatest) {
        // Both 'minor' and 'major' from a non-latest source jump to the
        // next major from the lineage's latest version (per addendum).
        return formatVersion({ major: latestVersion.major + 1, minor: 0 });
      }
      if (opts.versionBump === 'minor') {
        return formatVersion({ major: latestVersion.major, minor: latestVersion.minor + 1 });
      }
      // 'major' from latest
      return formatVersion({ major: latestVersion.major + 1, minor: 0 });
    })();

    // Per-lineage brewNumber: max + 1 (treating undefined as 0).
    const maxBrewNumber = lineageRecipes.reduce((m, r) =>
      typeof r.brewNumber === 'number' && r.brewNumber > m ? r.brewNumber : m,
      0,
    );
    const newBrewNumber = maxBrewNumber + 1;

    const newId = newRecipeId(state.recipes.map(r => r.id));
    const newRecipe: Recipe = {
      ...source,
      id: newId,
      lineageId,
      version: newVersion,
      versionNote: opts.note ?? '',
      brewNumber: newBrewNumber,
      locked: false,
      brewDate: today(),
      // taxBatch reset — brewery-wide unique constraint requires each
      // new recipe to start blank until the brewer assigns its serial.
      taxBatch: '',
      // brew-results fields reset — every new brew starts fresh
      // regardless of versionBump intensity (per task brief addendum).
      rating: 0,
      brewAgain: null,
      cost: 0, abv: 0, ibu: 0, ebc: 0, ogPlato: 0, fgPlato: 0,
      // A new version is always active even if cloned from an archived parent.
      archivedAt: null,
    };
    if (opts.beerName !== undefined) {
      newRecipe.beerName = opts.beerName;
    }

    // Deep-copy ingredients with React-format ids. The Supabase ingToRow
    // mapper does the re-key defensively too, but doing it here keeps
    // localStorage and the live cache consistent before dispatch fires.
    const sourceIngs = state.ingredientsByRecipe[sourceId]
      ?? lsGet<Ingredient[]>(`bl_recipe_ings_${sourceId}`, []);
    const newIngs: Ingredient[] = sourceIngs.map((ing, idx) => ({
      ...ing,
      id: `${newId}_${idx}`,
    }));

    const sourceWaterChem = lsGet<WaterChemData>(`bl_water_chem_${sourceId}`, {});
    const hasWaterChem = Object.keys(sourceWaterChem).length > 0;

    // 1. Backfill source's lineageId if missing (HTML line 5378).
    let recipes = state.recipes;
    if (!source.lineageId) {
      recipes = recipes.map(r => r.id === sourceId ? { ...r, lineageId } : r);
    }
    // 2. Append the new recipe.
    recipes = [...recipes, newRecipe];
    lsSet('bl_recipe_list', recipes);

    // 3. Per-recipe blobs for the new id. Recipe upsert must precede
    //    these on Supabase due to FK; lsSet's sbDispatch is
    //    fire-and-forget, so order is best-effort (matches HTML).
    lsSet(`bl_recipe_ings_${newId}`, newIngs);
    if (hasWaterChem) lsSet(`bl_water_chem_${newId}`, sourceWaterChem);
    // Fresh per-brew blobs — cleared explicitly on every variant
    // (none / minor / major) per the task brief addendum.
    lsSet(`bl_bd_${newId}`,        {});
    lsSet(`bl_ferm_log_${newId}`,  []);
    lsSet(`bl_ferm_meta_${newId}`, {});
    lsSet(`bl_cold_${newId}`,      {});

    // 4. Update store state. Cache the new ingredients so the new tab
    //    renders without a localStorage round-trip.
    set({
      recipes,
      ingredientsByRecipe: {
        ...state.ingredientsByRecipe,
        [newId]: newIngs,
      },
    });

    return newId;
  },

  // Duplicate as a NEW recipe lineage. Insert at idx+1 from source so the
  // copy sits next to its source in the recipe browser (HTML behaviour).
  // Fresh lineageId — keeps duplicates out of the source's History tab.
  duplicateRecipe: (sourceId) => {
    const state = get();
    const sourceIdx = state.recipes.findIndex(r => r.id === sourceId);
    if (sourceIdx < 0) return null;
    const source = state.recipes[sourceIdx];

    const newId = newRecipeId(state.recipes.map(r => r.id));
    const newRecipe: Recipe = {
      ...source,
      id: newId,
      lineageId: newId,                            // fresh lineage
      name: '',
      beerName: (source.beerName || source.name || '') + ' (copy)',
      brewDate: today(),
      taxBatch: '',                                // unique-constraint-safe
      brewNumber: 1,                               // fresh lineage starts at brew #1
      version: '1.0',
      versionNote: '',
      locked: false,
      // brew-results fields reset — a fresh duplicate is unbrewed
      rating: 0,
      brewAgain: null,
      cost: 0, abv: 0, ibu: 0, ebc: 0, ogPlato: 0, fgPlato: 0,
      // A duplicate is always active even if duplicated from an archived recipe.
      archivedAt: null,
    };

    // Deep-copy ingredients with React-format ids.
    const sourceIngs = state.ingredientsByRecipe[sourceId]
      ?? lsGet<Ingredient[]>(`bl_recipe_ings_${sourceId}`, []);
    const newIngs: Ingredient[] = sourceIngs.map((ing, idx) => ({
      ...ing,
      id: `${newId}_${idx}`,
    }));

    // Insert directly after the source.
    const recipes = [
      ...state.recipes.slice(0, sourceIdx + 1),
      newRecipe,
      ...state.recipes.slice(sourceIdx + 1),
    ];
    lsSet('bl_recipe_list', recipes);
    lsSet(`bl_recipe_ings_${newId}`, newIngs);

    set({
      recipes,
      ingredientsByRecipe: {
        ...state.ingredientsByRecipe,
        [newId]: newIngs,
      },
    });

    return newId;
  },

  // --- Templates (HTML brewlab-desktop.html:5119–5150) ---
  // Synced via the settings table — bl_templates is in SETTINGS_KEYS.
  setTemplates: (templates) => {
    lsSet('bl_templates', templates);
    set({ templates });
  },

  saveRecipeAsTemplate: (recipeId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const state = get();
    const recipe = state.recipes.find(r => r.id === recipeId);
    if (!recipe) return null;
    const ings = state.ingredientsByRecipe[recipeId]
      ?? lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    const tpl: Template = {
      id: 'tpl' + Date.now(),
      name: trimmed,
      style: recipe.style || '',
      styleKey: recipe.styleKey || '',
      batchL: recipe.batchL || 0,
      bhEff: recipe.bhEff || 0,
      boilTime: recipe.boilTime || 0,
      // Deep-copy so subsequent recipe edits don't mutate the snapshot.
      ingredients: JSON.parse(JSON.stringify(ings)) as Ingredient[],
      savedAt: new Date().toISOString(),
    };
    const next = [...state.templates, tpl];
    lsSet('bl_templates', next);
    set({ templates: next });
    return tpl.id;
  },

  deleteTemplate: (templateId) => {
    const next = get().templates.filter(t => t.id !== templateId);
    lsSet('bl_templates', next);
    set({ templates: next });
  },

  createRecipeFromTemplate: (templateId, opts) => {
    const trimmedName = opts.name.trim();
    if (!trimmedName) return null;
    const state = get();
    const tpl = state.templates.find(t => t.id === templateId);
    if (!tpl) return null;

    const newId = newRecipeId(state.recipes.map(r => r.id));
    const newRecipe: Recipe = {
      id: newId,
      lineageId: newId,
      name: trimmedName,
      beerName: trimmedName,
      style: tpl.style || '',
      styleKey: tpl.styleKey || '',
      folder: opts.folderId || '',
      batchL: tpl.batchL || 1050,
      classification: 'Beer',
      brewDate: today(),
      taxBatch: '',
      brewNumber: 1,         // fresh lineage starts at brew #1
      version: '1.0',
      versionNote: '',
      locked: false,
      rating: 0,
      brewAgain: null,
      cost: 0, abv: 0, ibu: 0, ebc: 0, ogPlato: 0, fgPlato: 0,
      bhEff: tpl.bhEff || 67.60,
      boilTime: tpl.boilTime || 45,
      whirlpoolTemp: 85,
      bdFv: '',
      notes: '',
      extraAdditions: '',
      brewer: '',
      archivedAt: null,
    };
    // Deep-copy ingredients with fresh React-format ids
    // (`${newId}_${idx}` per the SCHEMA.md ingredient ID rule). HTML used
    // sequential `i+1` which would collide on Supabase PK — see CLAUDE.md
    // "Critical Business Rules → Ingredient IDs".
    const newIngs: Ingredient[] = (tpl.ingredients || []).map((ing, idx) => ({
      ...ing,
      id: `${newId}_${idx}`,
    }));

    const recipes = [...state.recipes, newRecipe];
    lsSet('bl_recipe_list', recipes);
    lsSet(`bl_recipe_ings_${newId}`, newIngs);

    set({
      recipes,
      ingredientsByRecipe: {
        ...state.ingredientsByRecipe,
        [newId]: newIngs,
      },
    });

    return newId;
  },

  // --- Tariff Reduction (HTML brewlab-desktop.html:8910–8911) ---
  // Lazy-loaded per-FY. Synced via the settings table — `bl_tariff_*` is
  // matched by SETTINGS_KEY_PREFIXES, so each FY round-trips as one
  // settings row (id="bl_tariff_2026", id="bl_tariff_2027", etc.).
  getTariff: (year) => {
    const cached = get().tariffByYear[year];
    if (cached !== undefined) return cached;
    const fromLs = lsGet<TariffData>(`bl_tariff_${year}`, { planner: [], reservations: [] });
    // Cache async to avoid set-during-render.
    setTimeout(() => {
      const cur = get().tariffByYear[year];
      if (cur === undefined) {
        set({ tariffByYear: { ...get().tariffByYear, [year]: fromLs } });
      }
    }, 0);
    return fromLs;
  },

  setTariff: (year, data) => {
    lsSet(`bl_tariff_${year}`, data);
    set({ tariffByYear: { ...get().tariffByYear, [year]: data } });
  },

  // --- Per-recipe ingredients (reactive) ---
  getIngredients: (recipeId) => {
    const cached = get().ingredientsByRecipe[recipeId];
    if (cached !== undefined) return cached;
    // Lazy-load from localStorage on first access
    const fromLs = lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    // Cache it in state (async to avoid set-during-render)
    setTimeout(() => get().loadIngredients(recipeId), 0);
    return fromLs;
  },
  loadIngredients: (recipeId) => {
    const cached = get().ingredientsByRecipe[recipeId];
    if (cached !== undefined) return;
    const fromLs = lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    set({ ingredientsByRecipe: { ...get().ingredientsByRecipe, [recipeId]: fromLs } });
  },
  setIngredients: (recipeId, ings) => {
    lsSet(`bl_recipe_ings_${recipeId}`, ings);
    set({ ingredientsByRecipe: { ...get().ingredientsByRecipe, [recipeId]: ings } });
  },
  addIngredient: (recipeId, ing) => {
    const current = get().ingredientsByRecipe[recipeId] ?? lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    const updated = [...current, ing];
    lsSet(`bl_recipe_ings_${recipeId}`, updated);
    set({ ingredientsByRecipe: { ...get().ingredientsByRecipe, [recipeId]: updated } });
  },
  removeIngredient: (recipeId, ingId) => {
    const current = get().ingredientsByRecipe[recipeId] ?? [];
    const updated = current.filter(i => i.id !== ingId);
    lsSet(`bl_recipe_ings_${recipeId}`, updated);
    set({ ingredientsByRecipe: { ...get().ingredientsByRecipe, [recipeId]: updated } });
  },
  updateIngredient: (recipeId, ingId, updates) => {
    const current = get().ingredientsByRecipe[recipeId] ?? [];
    const updated = current.map(i => i.id === ingId ? { ...i, ...updates } : i);
    lsSet(`bl_recipe_ings_${recipeId}`, updated);
    set({ ingredientsByRecipe: { ...get().ingredientsByRecipe, [recipeId]: updated } });
  },
  getFermLog: (recipeId) => lsGet<FermLogEntry[]>(`bl_ferm_log_${recipeId}`, []),
  setFermLog: (recipeId, entries) => {
    lsSet(`bl_ferm_log_${recipeId}`, entries);
  },
  addFermLogEntry: (recipeId, entry) => {
    const log = [...get().getFermLog(recipeId), entry];
    lsSet(`bl_ferm_log_${recipeId}`, log);
  },
  // FermMeta is a flat optional-fields blob (matches HTML saveFermMeta).
  // The Ferm component fills fields as the user types.
  getFermMeta: (recipeId) => lsGet<FermMeta>(`bl_ferm_meta_${recipeId}`, {}),
  setFermMeta: (recipeId, meta) => {
    lsSet(`bl_ferm_meta_${recipeId}`, meta);
  },
  // BrewDayData is a flat optional-fields blob — empty default; the BrewDay
  // component fills fields as the user types them.
  getBrewDay: (recipeId) => lsGet<BrewDayData>(`bl_bd_${recipeId}`, {}),
  setBrewDay: (recipeId, data) => {
    lsSet(`bl_bd_${recipeId}`, data);
  },
  // ColdSideData is a flat optional-fields blob (matches HTML saveColdSide).
  // The Packaging component fills fields as the user types.
  getColdSide: (recipeId) => lsGet<ColdSideData>(`bl_cold_${recipeId}`, {}),
  setColdSide: (recipeId, data) => {
    lsSet(`bl_cold_${recipeId}`, data);
  },
  // Water chemistry blob — same flat-blob pattern. HTML originally stored
  // bl_water_chem_<id> local-only; React routes it through sbDispatch to a
  // new water_chem table (recipe_id PK).
  getWaterChem: (recipeId) => lsGet<WaterChemData>(`bl_water_chem_${recipeId}`, {}),
  setWaterChem: (recipeId, data) => {
    lsSet(`bl_water_chem_${recipeId}`, data);
  },
  // Per-recipe MASH profile blob. Reactive map keyed by recipeId — needed
  // because the writer (MashProfileModal) is decoupled from the readers
  // (BrewDayTab + WaterTab + RecipePreview). Same lazy-cache pattern as
  // recipeProfilesByRecipe: getter populates the map via setTimeout to
  // avoid set-during-render; setter writes lsSet + updates the map so
  // every subscriber re-renders.
  getMash: (recipeId) => {
    const cached = get().mashByRecipe[recipeId];
    if (cached !== undefined) return cached;
    const fromLs = lsGet<MashProfile | null>(`bl_mash_${recipeId}`, null);
    setTimeout(() => {
      if (get().mashByRecipe[recipeId] === undefined) {
        set({
          mashByRecipe: { ...get().mashByRecipe, [recipeId]: fromLs },
        });
      }
    }, 0);
    return fromLs;
  },
  setMash: (recipeId, profile) => {
    lsSet(`bl_mash_${recipeId}`, profile);
    set({
      mashByRecipe: { ...get().mashByRecipe, [recipeId]: profile },
    });
  },

  // --- Libraries ---
  setMaltLib: (lib) => { lsSet('bl_lib_malts', lib); set({ maltLib: lib }); },
  setHopLib: (lib) => { lsSet('bl_lib_hops', lib); set({ hopLib: lib }); },
  setYeastLib: (lib) => { lsSet('bl_lib_yeast', lib); set({ yeastLib: lib }); },
  setMiscLib: (lib) => { lsSet('bl_lib_misc', lib); set({ miscLib: lib }); },

  // --- Settings ---
  setSettings: (updates) => {
    const prev = get().settings;
    const settings = { ...prev, ...updates };
    lsSet('bl_brew_settings', settings);
    set({ settings });
    // If Supabase credentials changed, force the client to be re-created
    // on next call so subsequent dispatches/hydrates use the new values.
    if (
      ('sbUrl' in updates && updates.sbUrl !== prev.sbUrl) ||
      ('sbAnonKey' in updates && updates.sbAnonKey !== prev.sbAnonKey)
    ) {
      resetSupabaseClient();
    }
  },
  setTabVisibility: (vis) => {
    const tabVisibility = { ...get().tabVisibility, ...vis };
    lsSet('bl_tab_visibility', tabVisibility);
    set({ tabVisibility });
  },
  setFolders: (folders) => { lsSet('bl_folder_list', folders); set({ folders }); },
  setTankCalib: (calib) => { lsSet('bl_tank_calib', calib); set({ tankCalib: calib }); },
  setCustomStyles: (styles) => { lsSet('bl_custom_styles', styles); set({ customStyles: styles }); },
  setStyleOverlays: (overlays) => { lsSet('bl_style_overlays', overlays); set({ styleOverlays: overlays }); },
  setEquipProfiles: (profiles) => { lsSet('bl_equip_profiles', profiles); set({ equipProfiles: profiles }); },
  setWaterProfiles: (profiles) => { lsSet('bl_water_profiles', profiles); set({ waterProfiles: profiles }); },
  setMashProfiles: (profiles) => { lsSet('bl_mash_profiles', profiles); set({ mashProfiles: profiles }); },
  setPitchProfiles: (profiles) => { lsSet('bl_pitch_profiles', profiles); set({ pitchProfiles: profiles }); },
  setSuppliers: (suppliers) => { lsSet('bl_suppliers', suppliers); set({ suppliers }); },

  // --- Planner & Notes ---
  setPlannerBrews: (brews) => { lsSet('bl_planner_brews', brews); set({ plannerBrews: brews }); },
  setYearlyData: (data) => { lsSet('bl_yearly', data); set({ yearlyData: data }); },
  setBreweryNotes: (notes) => { lsSet('bl_brewery_notes', notes); set({ breweryNotes: notes }); },
  addBreweryNote: (note) => {
    const notes = [note, ...get().breweryNotes];
    lsSet('bl_brewery_notes', notes);
    set({ breweryNotes: notes });
  },
  deleteBreweryNote: (id) => {
    const notes = get().breweryNotes.filter(n => n.id !== id);
    lsSet('bl_brewery_notes', notes);
    set({ breweryNotes: notes });
  },

  // --- Harvested Yeast ---
  setHarvestedYeast: (yeast) => { lsSet('bl_harvested_yeast', yeast); set({ harvestedYeast: yeast }); },
  setLedgerData: (data) => { lsSet('bl_ledger', data); set({ ledgerData: data }); },
  addLedgerEntry: (key, entry) => {
    const next = { ...get().ledgerData };
    next[key] = [...(next[key] ?? []), entry];
    lsSet('bl_ledger', next);
    set({ ledgerData: next });
  },
  updateLedgerEntry: (key, idx, entry) => {
    const list = get().ledgerData[key] ?? [];
    if (idx < 0 || idx >= list.length) return;
    const updated = list.slice();
    updated[idx] = entry;
    const next = { ...get().ledgerData, [key]: updated };
    lsSet('bl_ledger', next);
    set({ ledgerData: next });
  },
  deleteLedgerEntry: (key, idx) => {
    const list = get().ledgerData[key] ?? [];
    if (idx < 0 || idx >= list.length) return;
    const updated = list.slice();
    updated.splice(idx, 1);
    const next = { ...get().ledgerData, [key]: updated };
    lsSet('bl_ledger', next);
    set({ ledgerData: next });
  },
  setOrders: (orders) => { lsSet('bl_orders', orders); set({ orders }); },
  addOrder: (order) => {
    const next = [...get().orders, order];
    lsSet('bl_orders', next);
    set({ orders: next });
  },
  updateOrder: (id, updates) => {
    const next = get().orders.map(o => o.id === id ? { ...o, ...updates } : o);
    lsSet('bl_orders', next);
    set({ orders: next });
  },
  bulkUpdateOrders: (ids, updates) => {
    const idSet = new Set(ids);
    const next = get().orders.map(o => idSet.has(o.id) ? { ...o, ...updates } : o);
    lsSet('bl_orders', next);
    set({ orders: next });
  },
  deleteOrder: (id) => {
    const next = get().orders.filter(o => o.id !== id);
    lsSet('bl_orders', next);
    set({ orders: next });
  },

  // --- Per-recipe profile selections ---
  getRecipeProfiles: (recipeId) => {
    const cached = get().recipeProfilesByRecipe[recipeId];
    if (cached !== undefined) return cached;
    const fromLs = lsGet<RecipeProfileSelections>(`bl_recipe_profiles_${recipeId}`, {});
    // Lazy-cache async (avoid set-during-render — same pattern as
    // getIngredients / getTaxRecord).
    setTimeout(() => {
      if (get().recipeProfilesByRecipe[recipeId] === undefined) {
        set({
          recipeProfilesByRecipe: { ...get().recipeProfilesByRecipe, [recipeId]: fromLs },
        });
      }
    }, 0);
    return fromLs;
  },
  setRecipeProfileKind: (recipeId, kind, profileId) => {
    const current = get().recipeProfilesByRecipe[recipeId]
      ?? lsGet<RecipeProfileSelections>(`bl_recipe_profiles_${recipeId}`, {});
    const next: RecipeProfileSelections = { ...current, [kind]: profileId };
    // Cross-device sync: routed to the `recipe_profiles` Supabase table
    // (recipe_id PK, JSONB data) — same shape as brew_day / ferm_meta /
    // cold_side / water_chem. Requires the migration
    //   migrations/2026-05-04_add_recipe_profiles_table.sql
    // to be applied. Until applied, the upsert errors silently and the
    // local lsLocal write still succeeds — single-device mode keeps working.
    lsSet(`bl_recipe_profiles_${recipeId}`, next);
    set({
      recipeProfilesByRecipe: { ...get().recipeProfilesByRecipe, [recipeId]: next },
    });
  },

  // --- Tax records ---
  getTaxRecord: (recipeId) => {
    const cached = get().taxRecordsByRecipe[recipeId];
    if (cached !== undefined) return cached;
    const fromLs = lsGet<TaxRecord>(`bl_tax_${recipeId}`, {});
    // Lazy-cache async (avoid set-during-render — same pattern as getIngredients)
    setTimeout(() => {
      if (get().taxRecordsByRecipe[recipeId] === undefined) {
        set({ taxRecordsByRecipe: { ...get().taxRecordsByRecipe, [recipeId]: fromLs } });
      }
    }, 0);
    return fromLs;
  },

  loadTaxRecord: (recipeId) => {
    const stored = lsGet<TaxRecord>(`bl_tax_${recipeId}`, {});
    const ings = get().ingredientsByRecipe[recipeId]
      ?? lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    const settings = get().settings;

    // HTML loadTaxPage: always overwrite the live-recompute fields with
    // freshly computed totals. The allowlist (LIVE_RECOMPUTE_KEYS) is
    // disjoint from SNAP_KEYS by module-load assertion in lib/tax.ts, so
    // snap-* values are physically untouched.
    const live = pullIngredientTotals(ings, settings);
    const next: TaxRecord = { ...stored };
    for (const key of LIVE_RECOMPUTE_KEYS) {
      const v = live[key as keyof typeof live];
      if (v !== undefined) {
        (next as Record<string, unknown>)[key] = v;
      }
    }

    // Auto-fill 'class' from recipe.classification if not already set
    if (!next['class']) {
      const r = get().recipes.find(x => x.id === recipeId);
      if (r?.classification) next['class'] = r.classification;
    }

    lsSet(`bl_tax_${recipeId}`, next);
    set({ taxRecordsByRecipe: { ...get().taxRecordsByRecipe, [recipeId]: next } });
  },

  setTaxRecordField: (recipeId, key, value) => {
    const current = get().taxRecordsByRecipe[recipeId]
      ?? lsGet<TaxRecord>(`bl_tax_${recipeId}`, {});
    const next: TaxRecord = { ...current, [key]: value } as TaxRecord;
    lsSet(`bl_tax_${recipeId}`, next);
    // Mark this field as a manual override so updateTaxFromRecipe skips it.
    const overridesForRecipe = { ...(get().taxManualOverrides[recipeId] ?? {}) };
    overridesForRecipe[key as string] = true;
    set({
      taxRecordsByRecipe: { ...get().taxRecordsByRecipe, [recipeId]: next },
      taxManualOverrides: { ...get().taxManualOverrides, [recipeId]: overridesForRecipe },
    });
  },

  updateTaxFromRecipe: (recipeId, options) => {
    const recipe = get().recipes.find(r => r.id === recipeId);
    if (!recipe) return { applied: false, blanks: [] };
    const ings = get().ingredientsByRecipe[recipeId]
      ?? lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    const brewDay = get().getBrewDay(recipeId);
    const waterChem = get().getWaterChem(recipeId);
    const coldSide = get().getColdSide(recipeId);
    const settings = get().settings;
    const tankCalib = get().tankCalib;

    const pulled = pullTaxDataFromTabs({
      recipe, ings, brewDay, waterChem, coldSide, settings, tankCalib,
    });

    // Detect manual-override conflicts (HTML hasManual check, lines 8548–8551)
    const overrides = get().taxManualOverrides[recipeId] ?? {};
    const hasOverrides = Object.keys(pulled).some(k => overrides[k]);
    if (hasOverrides && options?.confirmOverwrite) {
      if (!options.confirmOverwrite()) {
        return { applied: false, blanks: [] };
      }
    }

    // Blank warning list (HTML lines 8554–8560)
    const blanks: string[] = [];
    if (!pulled['fv-num']) blanks.push('FV #');
    if (!pulled['in-fv']) blanks.push('In FV (L)');
    if (!pulled['start-brix']) blanks.push('Start Brix / OG');
    if (!pulled['finish-brix']) blanks.push('Finish Brix / FG');
    if (!pulled.abv) blanks.push('ABV');
    if (!pulled['keg-total'] && !pulled['can-total']) blanks.push('Packaging (kegs/cans)');

    // Force-merge: confirm passed → ignore overrides for this update
    const prev = get().taxRecordsByRecipe[recipeId]
      ?? lsGet<TaxRecord>(`bl_tax_${recipeId}`, {});
    const merged = mergeTaxFieldUpdate(prev, pulled, overrides, !hasOverrides);

    lsSet(`bl_tax_${recipeId}`, merged);
    // Clear overrides for the keys we just overwrote (they now match the
    // pulled value, so further "Update from Recipe" calls won't re-prompt).
    const clearedOverrides = { ...overrides };
    for (const k of Object.keys(pulled)) delete clearedOverrides[k];
    set({
      taxRecordsByRecipe: { ...get().taxRecordsByRecipe, [recipeId]: merged },
      taxManualOverrides: { ...get().taxManualOverrides, [recipeId]: clearedOverrides },
    });
    return { applied: true, blanks };
  },

  recordToTaxMaster: (recipeId, options) => {
    const prev = get().taxRecordsByRecipe[recipeId]
      ?? lsGet<TaxRecord>(`bl_tax_${recipeId}`, {});
    const coldSide = get().getColdSide(recipeId);

    // Snapshot — the only function permitted to write SNAP_KEYS
    const snap = buildSnapshot(coldSide, prev);
    const withSnap: TaxRecord = { ...prev, ...snap };

    // Required-field check (HTML lines 8866–8882)
    const requiredFields: Array<[keyof TaxRecord, string]> = [
      ['brew-num',    'Tax Batch #'],
      ['recipe-name', 'Recipe Name'],
      ['date',        'Brew Date'],
      ['malt',        'Malt (kg)'],
      ['hops',        'Hops (kg)'],
      ['water',       'Water (L)'],
      ['tank',        'Tank #'],
      ['in-fv',       'In FV (L)'],
      ['start-brix',  'Start Brix / OG'],
      ['finish-brix', 'Finish Brix / FG'],
      ['abv',         'ABV'],
    ];
    const blanks = requiredFields
      .filter(([k]) => {
        const v = withSnap[k];
        return v == null || String(v).trim() === '';
      })
      .map(([, label]) => label);

    if (blanks.length > 0 && options?.confirmBlanks) {
      if (!options.confirmBlanks(blanks)) return { recorded: false };
    }

    // Stamp identity for tax_master (HTML lines 8884–8885)
    withSnap.recipeId = recipeId;
    withSnap.recordedAt = new Date().toISOString();

    // Persist updated tax record (with snap-* baked in)
    lsSet(`bl_tax_${recipeId}`, withSnap);

    // Upsert into master (HTML lines 8887–8901)
    const master = [...get().taxMaster];
    const existing = master.findIndex(m => m.recipeId === recipeId);
    if (existing >= 0) {
      const existingRecordedAt = (master[existing].recordedAt ?? '').slice(0, 10);
      if (options?.confirmOverwrite && !options.confirmOverwrite(existingRecordedAt)) {
        return { recorded: false };
      }
      master[existing] = withSnap as TaxMasterRow;
    } else {
      master.push(withSnap as TaxMasterRow);
    }
    master.sort((a, b) => {
      const na = parseInt(String(a['brew-num'] ?? '')) || 0;
      const nb = parseInt(String(b['brew-num'] ?? '')) || 0;
      return na - nb || (String(a['brew-num'] ?? '')).localeCompare(String(b['brew-num'] ?? ''));
    });
    lsSet('bl_tax_master', master);
    set({
      taxMaster: master,
      taxRecordsByRecipe: { ...get().taxRecordsByRecipe, [recipeId]: withSnap },
    });
    return { recorded: true };
  },

  setTaxMaster: (rows) => {
    lsSet('bl_tax_master', rows);
    set({ taxMaster: rows });
  },

  setRecipeClassification: (recipeId, cls) => {
    // Update recipe (single source of truth)
    const recipes = get().recipes.map(r =>
      r.id === recipeId ? { ...r, classification: cls } : r
    );
    lsSet('bl_recipe_list', recipes);

    // Mirror onto tax record's `class` and `classification` fields and
    // clear any manual-override flags on those keys (mirrors HTML
    // syncClassification's `delete dataset.manualOverride` at lines 12124/26).
    const prev = get().taxRecordsByRecipe[recipeId]
      ?? lsGet<TaxRecord>(`bl_tax_${recipeId}`, {});
    const next: TaxRecord = { ...prev, class: cls, classification: cls };
    lsSet(`bl_tax_${recipeId}`, next);

    const overrides = { ...(get().taxManualOverrides[recipeId] ?? {}) };
    delete overrides['class'];
    delete overrides['classification'];

    set({
      recipes,
      taxRecordsByRecipe: { ...get().taxRecordsByRecipe, [recipeId]: next },
      taxManualOverrides: { ...get().taxManualOverrides, [recipeId]: overrides },
    });
  },

  autoClassifyRecipe: (recipeId) => {
    const ings = get().ingredientsByRecipe[recipeId]
      ?? lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    const cls = applyAutoClassification(ings, get().miscLib, get().maltLib);
    get().setRecipeClassification(recipeId, cls);
    return cls;
  },

  // --- NTA register ---
  addNtaSubmission: (entry) => {
    const next = [...get().ntaRegister, entry];
    lsSet('bl_nta_register', next);
    set({ ntaRegister: next });
  },
  deleteNtaSubmission: (idx) => {
    const next = get().ntaRegister.filter((_, i) => i !== idx);
    lsSet('bl_nta_register', next);
    set({ ntaRegister: next });
  },
  setNtaRegister: (entries) => {
    lsSet('bl_nta_register', entries);
    set({ ntaRegister: entries });
  },
  setNtaBasisDefault: (basis) => {
    // Mirrors HTML ntaSaveBasisDefault (line 11925) — writes BOTH default
    // and current so the modal opens with the same value next time.
    lsSet('bl_nta_basis_default', basis);
    lsSet('bl_nta_basis_current', basis);
    set({ ntaBasisDefault: basis, ntaBasisCurrent: basis });
  },
  setNtaBasisCurrent: (basis) => {
    lsSet('bl_nta_basis_current', basis);
    set({ ntaBasisCurrent: basis });
  },

  // --- Navigation ---
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSettingsSection: (section) => set({ settingsSection: section }),
  setLibrariesSection: (section) => set({ librariesSection: section }),
  setPendingPlannerAdd: (req) => set({ pendingPlannerAdd: req }),
  setInventoryStock: (stock) => { lsSet('bl_inv_stock', stock); set({ inventoryStock: stock }); },
  setLibNextId: (next) => { lsSet('bl_lib_next_id', next); set({ libNextId: next }); },
  selectRecipe: (id) => set({ selectedRecipeId: id }),

  // --- Toasts + undo history ---
  pushToast: (input: ToastInput) => {
    const id = nextToastId();
    const spec: ToastSpec = { id, ...input };
    const duration =
      spec.duration
        ?? (spec.undo ? TOAST_DURATION_WITH_UNDO : TOAST_DURATION_DEFAULT);

    set(state => {
      // Visible stack: cap at TOAST_STACK_MAX, drop oldest. Dropped
      // visible toasts have their auto-dismiss timer cleared, but
      // their closure stays in undoHistory until that cap evicts it.
      const nextToasts = [...state.toasts, spec];
      while (nextToasts.length > TOAST_STACK_MAX) {
        const dropped = nextToasts.shift();
        if (dropped) {
          const t = toastTimers.get(dropped.id);
          if (t) clearTimeout(t);
          toastTimers.delete(dropped.id);
        }
      }

      // Undo history: only entries with `undo` are recorded. Cap at
      // UNDO_HISTORY_MAX, drop oldest closure (the closure goes out of
      // reach but the user is unlikely to need to undo something 20+
      // actions back — and we don't want unbounded retention).
      let nextHistory = state.undoHistory;
      if (spec.undo) {
        const entry: UndoEntry = {
          id, message: spec.message, undo: spec.undo, ts: Date.now(),
        };
        nextHistory = [...state.undoHistory, entry];
        while (nextHistory.length > UNDO_HISTORY_MAX) nextHistory.shift();
      }

      return { toasts: nextToasts, undoHistory: nextHistory };
    });

    // Schedule auto-dismiss. Stored in module-scoped Map so the Toast
    // component can clear+reissue on hover-pause. Note: this only
    // removes the toast from the visible stack — the undoHistory
    // entry stays put (the whole point of the decoupling).
    toastTimers.set(id, setTimeout(() => {
      get().dismissToast(id);
    }, duration));

    return id;
  },

  dismissToast: (id: string) => {
    const t = toastTimers.get(id);
    if (t) clearTimeout(t);
    toastTimers.delete(id);
    set(state => ({ toasts: state.toasts.filter(s => s.id !== id) }));
    // undoHistory intentionally untouched — closures persist past
    // toast dismissal so the persistent Undo button can still reach
    // them. Eviction is governed solely by UNDO_HISTORY_MAX in
    // pushToast and by explicit pop in popMostRecentUndo / popUndoById.
  },

  pauseToastTimer: (id: string) => {
    const t = toastTimers.get(id);
    if (t) clearTimeout(t);
    toastTimers.delete(id);
    // Toast stays in the array — only the timer goes.
  },

  resumeToastTimer: (id: string, ms: number) => {
    // Replace any existing timer (defensive) then schedule fresh dismiss.
    const prev = toastTimers.get(id);
    if (prev) clearTimeout(prev);
    toastTimers.set(id, setTimeout(() => {
      get().dismissToast(id);
    }, ms));
  },

  popMostRecentUndo: () => {
    const history = get().undoHistory;
    if (history.length === 0) return;
    const entry = history[history.length - 1];
    // Run the closure first; if it throws, the entry stays put so the
    // user can retry. Same ordering rule as the per-toast Undo click.
    entry.undo();
    set(state => ({
      undoHistory: state.undoHistory.slice(0, -1),
      toasts: state.toasts.filter(s => s.id !== entry.id),
    }));
    const t = toastTimers.get(entry.id);
    if (t) clearTimeout(t);
    toastTimers.delete(entry.id);
  },

  popUndoById: (id: string) => {
    const history = get().undoHistory;
    const entry = history.find(e => e.id === id);
    if (!entry) return;
    entry.undo();
    set(state => ({
      undoHistory: state.undoHistory.filter(e => e.id !== id),
      toasts: state.toasts.filter(s => s.id !== id),
    }));
    const t = toastTimers.get(id);
    if (t) clearTimeout(t);
    toastTimers.delete(id);
  },

  // --- Sync ---
  hydrate: async () => {
    set({ syncing: true });
    const lastSync = lsGet<string | null>('bl_last_sync', null);

    // Build LocalContext for the ferm log self-deletion filter (a
    // tombstoned ferm log entry whose id this device already removed
    // locally is its own deletion echoing back — skip the prompt). Recipe
    // archival no longer prompts under the two-tier model.
    const localRecipes = lsGet<Recipe[]>('bl_recipe_list', []);
    const fermLogIdsByRecipe = new Map<string, Set<string>>();
    for (const r of localRecipes) {
      const log = lsGet<FermLogEntry[]>(`bl_ferm_log_${r.id}`, []);
      fermLogIdsByRecipe.set(r.id, new Set(log.map(e => e.id)));
    }
    const localCtx: LocalContext = { lastSync, fermLogIdsByRecipe };

    const plan = await sbFetchHydration(localCtx);

    // First-hydrate-silent: a brand-new device with empty bl_last_sync
    // shouldn't be greeted with "remove N ferm log entries?" for tombstones
    // that accumulated before it joined.
    let applyDeletions = true;
    if (plan.pendingFermLogDeletions.length > 0 && lastSync) {
      applyDeletions = window.confirm(buildDeletionPrompt(plan.pendingFermLogDeletions));
    }

    sbApplyHydration(plan, lsLocal, lsRemove, { applyDeletions });

    if (plan.success) {
      // Reload all state from localStorage after hydration.
      // Clear ingredientsByRecipe so loadIngredients re-reads from
      // freshly hydrated localStorage instead of serving stale cache.
      set({
        recipes: lsGet<Recipe[]>('bl_recipe_list', []),
        maltLib: lsGet<MaltLib[]>('bl_lib_malts', []),
        hopLib: lsGet<HopLib[]>('bl_lib_hops', []),
        yeastLib: lsGet<YeastLib[]>('bl_lib_yeast', []),
        miscLib: lsGet<MiscLib[]>('bl_lib_misc', []),
        tankCalib: lsGet<Record<string, TankCalibration>>('bl_tank_calib', {}),
        customStyles: lsGet<Record<string, CustomStyle>>('bl_custom_styles', {}),
        styleOverlays: lsGet<Record<string, StyleOverlay>>('bl_style_overlays', {}),
        folders: lsGet<Folder[]>('bl_folder_list', []),
        equipProfiles: lsGet<EquipmentProfile[]>('bl_equip_profiles', []),
        waterProfiles: lsGet<WaterProfile[]>('bl_water_profiles', []),
        mashProfiles: lsGet<MashProfile[]>('bl_mash_profiles', []),
        pitchProfiles: lsGet<PitchProfile[]>('bl_pitch_profiles', []),
        plannerBrews: lsGet<PlannerBrew[]>('bl_planner_brews', []),
        yearlyData: lsGet<YearlyData>('bl_yearly', {}),
        breweryNotes: lsGet<BreweryNote[]>('bl_brewery_notes', []),
        suppliers: lsGet<string[]>('bl_suppliers', []),
        harvestedYeast: lsGet<HarvestedYeast>('bl_harvested_yeast', {}),
        ledgerData: lsGet<LedgerData>('bl_ledger', {}),
        orders: lsGet<OrderEntry[]>('bl_orders', []),
        templates: lsGet<Template[]>('bl_templates', []),
        // Per-FY blobs are lazy-loaded — clear the cache so getTariff()
        // re-reads from localStorage (which sbHydrate has populated from
        // the settings table for any bl_tariff_<year> rows).
        tariffByYear: {},
        inventoryStock: lsGet<Record<string, number>>('bl_inv_stock', {}),
        libNextId: lsGet<{ malts: number; hops: number; yeast: number; misc: number }>(
          'bl_lib_next_id',
          { malts: 1, hops: 1, yeast: 1, misc: 1 },
        ),
        tabVisibility: { ...DEFAULT_TAB_VISIBILITY, ...lsGet<Partial<TabVisibility>>('bl_tab_visibility', {}) },
        ingredientsByRecipe: {},      // ← clear cache so ingredients reload from hydrated localStorage
        recipeProfilesByRecipe: {},   // ← clear cache so per-recipe profile selections reload
        mashByRecipe: {},             // ← clear cache so per-recipe mash blobs reload
        taxRecordsByRecipe: {},   // ← clear cache so tax records reload from hydrated localStorage
        taxManualOverrides: {},   // ← override flags are local-only; reset on hydrate
        taxMaster: lsGet<TaxMasterRow[]>('bl_tax_master', []),
        ntaRegister: lsGet<NtaSubmission[]>('bl_nta_register', []),
        ntaBasisDefault: lsGet<string>('bl_nta_basis_default', ''),
        ntaBasisCurrent: lsGet<string>('bl_nta_basis_current', ''),
      });
    }

    set({ syncing: false, hydrated: true });
  },
}));
