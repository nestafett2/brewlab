/**
 * Supabase client and sync functions.
 * See SYNC.md for the full dispatch/hydrate protocol.
 *
 * Credentials live in localStorage under `bl_brew_settings` (sbUrl + sbAnonKey).
 * The client is lazy — created on first use and recreated when credentials change.
 * If no credentials are configured, every Supabase call is a silent no-op
 * and the app keeps working in fully local mode.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Recipe, RecipeBrewAgain, Ingredient, FermLogEntry } from '../types';

let client: SupabaseClient | null = null;
let clientUrl = '';
let clientKey = '';

interface Credentials { url: string; key: string; }

/** Read sbUrl + sbAnonKey from localStorage. Mirrors HTML sbConfig(). */
function getCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem('bl_brew_settings');
    if (!raw) return null;
    const s = JSON.parse(raw) as { sbUrl?: string; sbAnonKey?: string };
    const url = (s.sbUrl ?? '').replace(/\/$/, '');
    const key = s.sbAnonKey ?? '';
    if (!url || !key) return null;
    return { url, key };
  } catch {
    return null;
  }
}

/** True if Supabase credentials are present. */
export function hasSupabase(): boolean {
  return getCredentials() !== null;
}

/** Get or create the Supabase client. Returns null if not configured. */
export function getSupabase(): SupabaseClient | null {
  const cfg = getCredentials();
  if (!cfg) {
    client = null;
    clientUrl = '';
    clientKey = '';
    return null;
  }
  if (client && cfg.url === clientUrl && cfg.key === clientKey) return client;
  client = createClient(cfg.url, cfg.key);
  clientUrl = cfg.url;
  clientKey = cfg.key;
  return client;
}

/** Force the client to be re-created on next call (e.g. after credentials change). */
export function resetSupabaseClient(): void {
  client = null;
  clientUrl = '';
  clientKey = '';
}

// === Dispatch Routing (localStorage key → Supabase table) ===

/**
 * Push a localStorage value to the correct Supabase table.
 * Called by lsSet() — never call during hydration.
 */
export async function sbDispatch(key: string, value: unknown): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  // supabase-js does NOT throw on 4xx — it resolves with { error }.
  // Without this helper every Postgres rejection slipped through silently.
  const logIfError = (
    op: string,
    table: string,
    res: { error: unknown },
    sample?: unknown,
  ) => {
    if (res.error) {
      console.error(
        `[sbDispatch] ${op} ${table} failed for key=${key}`,
        res.error,
        sample !== undefined ? { sampleRow: sample } : undefined,
      );
    }
  };

  try {
    if (key === 'bl_recipe_list') {
      // Plain upsert. Recipe deletion goes through sbHardDeleteRecipe
      // (DELETEs the row + every per-recipe child); a plain bl_recipe_list
      // save carries no deletion intent. Per the simplified deletion model
      // (2026-05-07), there's no soft-delete state to track here — the
      // archived_at column is vestigial and always NULL going forward.
      const recipes = value as Recipe[];
      const rows = recipes.map(recipeToRow);
      const res = await sb.from('recipes').upsert(rows, { onConflict: 'id' });
      logIfError('upsert', 'recipes', res, rows[0]);
    } else if (key.startsWith('bl_recipe_ings_')) {
      const recipeId = key.replace('bl_recipe_ings_', '');
      const delRes = await sb.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      logIfError('delete', 'recipe_ingredients', delRes);
      const ings = value as Ingredient[];
      if (ings.length > 0) {
        const rows = ings.map((ing, idx) => ingToRow(recipeId, ing, idx));
        const insRes = await sb.from('recipe_ingredients').insert(rows);
        logIfError('insert', 'recipe_ingredients', insRes, rows[0]);
      }
    } else if (key.startsWith('bl_ferm_log_')) {
      const recipeId = key.replace('bl_ferm_log_', '');
      const entries = value as FermLogEntry[];
      if (entries.length > 0) {
        const rows = entries.map(e => ({
          id: e.id,
          recipe_id: recipeId,
          entry_date: e.date,
          plato: e.plato,
          ph: e.ph,
          temp: e.temp,
          notes: e.notes,
        }));
        const res = await sb.from('ferm_log').upsert(rows, { onConflict: 'id' });
        logIfError('upsert', 'ferm_log', res, rows[0]);
      }

      // Soft-delete diff: any active ferm_log row for this recipe that
      // disappeared from the local array gets `deleted_at = now()`.
      // Scoped to this recipe so other recipes' logs aren't affected.
      const localIds = new Set(entries.map(e => e.id));
      const { data: active } = await sb
        .from('ferm_log')
        .select('id')
        .eq('recipe_id', recipeId)
        .is('deleted_at', null)
        .limit(1000000);
      if (active) {
        const tombstoneIds = (active as { id: string }[])
          .map(r => r.id)
          .filter(id => !localIds.has(id));
        if (tombstoneIds.length > 0) {
          const tsRes = await sb
            .from('ferm_log')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', tombstoneIds);
          logIfError('soft-delete', 'ferm_log', tsRes, { recipeId, tombstoneIds });
        }
      }
    } else if (key.startsWith('bl_bd_')) {
      // updated_at is managed by the database trigger — do not write it.
      const recipeId = key.replace('bl_bd_', '');
      const row = { recipe_id: recipeId, data: value };
      const res = await sb.from('brew_day').upsert(row, { onConflict: 'recipe_id' });
      logIfError('upsert', 'brew_day', res, { recipe_id: recipeId });
    } else if (key.startsWith('bl_ferm_meta_')) {
      const recipeId = key.replace('bl_ferm_meta_', '');
      const row = { recipe_id: recipeId, data: value };
      const res = await sb.from('ferm_meta').upsert(row, { onConflict: 'recipe_id' });
      logIfError('upsert', 'ferm_meta', res, { recipe_id: recipeId });
    } else if (key.startsWith('bl_cold_')) {
      const recipeId = key.replace('bl_cold_', '');
      const row = { recipe_id: recipeId, data: value };
      const res = await sb.from('cold_side').upsert(row, { onConflict: 'recipe_id' });
      logIfError('upsert', 'cold_side', res, { recipe_id: recipeId });
    } else if (key.startsWith('bl_water_chem_')) {
      // HTML stored bl_water_chem_<id> in localStorage only (not in its
      // sbSet routing). React routes it to the new water_chem JSONB blob
      // table — recipe_id PK, same pattern as brew_day / ferm_meta / cold_side.
      const recipeId = key.replace('bl_water_chem_', '');
      const row = { recipe_id: recipeId, data: value };
      const res = await sb.from('water_chem').upsert(row, { onConflict: 'recipe_id' });
      logIfError('upsert', 'water_chem', res, { recipe_id: recipeId });
    } else if (key.startsWith('bl_recipe_profiles_')) {
      // Per-recipe Equipment / Water / Pitch / Mash profile selections.
      // Recipe-id PK, JSONB blob — same pattern as brew_day / ferm_meta /
      // cold_side / water_chem. Requires the recipe_profiles table; if the
      // user hasn't applied the migration yet, supabase-js logs the error
      // and the local write at lsSet still succeeds, so the app keeps
      // working in single-device mode. See migrations/2026-05-04_add_recipe_profiles_table.sql.
      const recipeId = key.replace('bl_recipe_profiles_', '');
      const row = { recipe_id: recipeId, data: value };
      const res = await sb.from('recipe_profiles').upsert(row, { onConflict: 'recipe_id' });
      logIfError('upsert', 'recipe_profiles', res, { recipe_id: recipeId });
    } else if (key.startsWith('bl_mash_') && !key.startsWith('bl_mash_profiles')) {
      // Per-recipe MASH profile blob — distinct from bl_mash_profiles
      // (the global library, which is a settings-table key). The guard
      // above keeps the prefix specific to bl_mash_<recipeId>.
      // Same JSONB-blob pattern as the four neighbours above. Requires
      // the mash table from migrations/2026-05-06_add_mash_table.sql.
      const recipeId = key.replace('bl_mash_', '');
      const row = { recipe_id: recipeId, data: value };
      const res = await sb.from('mash').upsert(row, { onConflict: 'recipe_id' });
      logIfError('upsert', 'mash', res, { recipe_id: recipeId });
    } else if (key === 'bl_harvested_yeast') {
      // Mirrors HTML sbSyncHarvestedYeast (line 6857). Delete-all + reinsert.
      // Input shape: { [strain]: { generation: number, entries: Entry[] } }.
      // The hydrate path (sbHydrate, below) reverses this — strain-keyed
      // object is the localStorage source of truth; AddIngredientModal and
      // any future UI consume it directly via lsGet.
      const yeastData = value as Record<
        string,
        { generation?: number; entries?: Array<Record<string, unknown>> }
      > | null;
      if (yeastData && typeof yeastData === 'object') {
        // HTML uses ?id=neq.'' — equivalent to "every row" since id is a uuid PK.
        // .not('id','is',null) is the supabase-js-safe form (matches sbWipeAll).
        const delRes = await sb.from('harvested_yeast').delete().not('id', 'is', null);
        logIfError('delete', 'harvested_yeast', delRes);
        const rows: Record<string, unknown>[] = [];
        for (const [strain, strainData] of Object.entries(yeastData)) {
          const entries = strainData?.entries ?? [];
          for (const e of entries) {
            // Two of the table's free-text columns are row-type
            // dependent. The split mirrors the in-memory entry shape:
            //   beer_name  ─ usage:   destination brew's beer name (e.beer)
            //              ─ harvest: source brew's beer name      (e.harvestedFrom)
            //   tax_batch  ─ usage:   destination brew's tax batch (e.taxBatch)
            //              ─ harvest: source brew's tax batch      (e.harvestedFromTaxBatch)
            //
            // The `tax_batch` column was added by
            // migrations/2026-05-07_add_tax_batch_to_harvested_yeast.sql;
            // before that migration the same data was overloaded into
            // the legacy `brew_num` column (which was previously the
            // dead-on-write e.brewNum field). New writes leave brew_num
            // NULL — see the migration header comment for the
            // long-form story.
            const isUsage = (e.type as string) === 'usage';
            const beerCol = isUsage
              ? ((e.beer as string) || null)
              : ((e.harvestedFrom as string) || null);
            const taxCol  = isUsage
              ? ((e.taxBatch as string) || null)
              : ((e.harvestedFromTaxBatch as string) || null);
            rows.push({
              id:         String(e.id ?? crypto.randomUUID()),
              strain,
              entry_type: (e.type as string) || 'harvest',
              entry_date: (e.date as string) || (e.harvestDate as string) || null,
              amount_l:   parseFloat(String(e.got ?? e.used ?? '')) || null,
              recipe_id:  (e.recipeId as string) || null,
              beer_name:  beerCol,
              tax_batch:  taxCol,
              generation: parseInt(String(e.generation ?? ''), 10) || null,
              container:  (e.container as string) || null,
              note:       (e.note as string) || null,
            });
          }
        }
        if (rows.length > 0) {
          const insRes = await sb.from('harvested_yeast').insert(rows);
          logIfError('insert', 'harvested_yeast', insRes, rows[0]);
        }
      }
    } else if (key === 'bl_tax_master') {
      // Mirrors HTML sbSyncTaxMaster (line 6835). Upsert by recipe_id.
      // Read side: sbFetchHydration pulls tax_master rows back into
      // bl_tax_master.
      const arr = value as Array<Record<string, unknown>>;
      if (Array.isArray(arr) && arr.length > 0) {
        const rows = arr
          .filter(rec => rec.recipeId)
          .map(rec => ({ recipe_id: rec.recipeId as string, ...sbBuildTaxRow(rec) }));
        if (rows.length > 0) {
          const res = await sb.from('tax_master').upsert(rows, { onConflict: 'recipe_id' });
          logIfError('upsert', 'tax_master', res, rows[0]);
        }
      }
    } else if (key.startsWith('bl_tax_')) {
      // Mirrors HTML sbSyncTaxRecord (line 6826). Upsert one row by recipe_id.
      // Note: 'bl_tax_master' is handled above, so this branch only catches
      // per-recipe tax keys like bl_tax_r1, bl_tax_r17, etc. Read side:
      // sbFetchHydration pulls tax_records rows back into bl_tax_<id>.
      const recipeId = key.replace('bl_tax_', '');
      const rec = value as Record<string, unknown>;
      if (recipeId && rec) {
        const row = { recipe_id: recipeId, ...sbBuildTaxRow(rec) };
        const res = await sb.from('tax_records').upsert(row, { onConflict: 'recipe_id' });
        logIfError('upsert', 'tax_records', res, { recipe_id: recipeId });
      }
    } else if (isSettingsKey(key)) {
      const res = await sb.from('settings').upsert({ id: key, data: value }, { onConflict: 'id' });
      logIfError('upsert', 'settings', res, { id: key });
    }
  } catch (err) {
    console.error('[sbDispatch] Threw for key:', key, err);
    // Local data is still safe in localStorage; surface the error so we can fix it.
  }
}

// === Recipe hard-delete ===

/**
 * Hard-delete a recipe and every per-recipe child row. Universal — no
 * predicate gate. tax_records and tax_master are EXCLUDED (NTA compliance
 * artifacts must survive recipe deletion); the dangling `recipeId`
 * references on those rows are surfaced as "(recipe deleted)" labels in
 * TaxMasterPage.
 *
 * Errors on individual child DELETEs are logged but don't abort the
 * cascade — partial cleanup is better than rolled-back-but-still-orphaned.
 * The recipe row DELETE is the last step; if that fails we surface the
 * error so the caller can react (the local store keeps the row, undo
 * still works).
 */
export async function sbHardDeleteRecipe(
  recipeId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: true }; // local-only mode — nothing to do server-side

  // Per-recipe child rows. recipe_ingredients / brew_day / ferm_meta /
  // cold_side / water_chem / recipe_profiles / mash / ferm_log come from
  // PER_RECIPE_TABLES; harvested_yeast is added inline because it's also
  // managed via a global delete-all+reinsert path (lib/supabase.ts dispatch
  // for bl_harvested_yeast) and isn't in PER_RECIPE_TABLES for that reason.
  const childTables = [...PER_RECIPE_TABLES, 'harvested_yeast'];
  for (const table of childTables) {
    const r = await sb.from(table).delete().eq('recipe_id', recipeId);
    if (r.error) {
      console.warn(`[sbHardDeleteRecipe] delete on ${table} failed`, {
        recipeId, error: r.error,
      });
    }
  }

  // Finally the recipe row itself.
  const r = await sb.from('recipes').delete().eq('id', recipeId);
  if (r.error) {
    console.error('[sbHardDeleteRecipe] delete on recipes failed', {
      recipeId, error: r.error,
    });
    return { ok: false, reason: r.error.message };
  }
  return { ok: true };
}

// === Hydration (Supabase → localStorage) ===

/**
 * Per-recipe localStorage prefixes. Used by the store's hardDeleteRecipe
 * action to wipe a recipe's local blobs alongside the recipe row itself.
 *
 * `bl_tax_<id>` is intentionally NOT in this list. Tax records are NTA
 * compliance artifacts that survive recipe deletion — the dangling
 * recipe_id reference is surfaced in TaxMasterPage as "(recipe deleted)".
 */
export const PER_RECIPE_KEY_PREFIXES: readonly string[] = [
  'bl_recipe_ings_',
  'bl_bd_',
  'bl_ferm_meta_',
  'bl_cold_',
  'bl_water_chem_',
  'bl_recipe_profiles_',
  'bl_mash_',
  'bl_checklist_',
  'bl_ferm_log_',
];

/**
 * Per-recipe Supabase tables that the hard-delete path explicitly clears
 * before removing the recipe row itself. Defense in depth — the live DB
 * may or may not have ON DELETE CASCADE on each FK (recipe_profiles and
 * mash do; the others were created in Table Editor and aren't visible
 * from migrations). Issuing the DELETEs ourselves makes the code correct
 * regardless.
 *
 * `tax_records` and `tax_master` are NEVER in this list. They are NTA
 * compliance artifacts and the predicate forbids hard-deleting any recipe
 * that has them.
 */
export const PER_RECIPE_TABLES: readonly string[] = [
  'recipe_ingredients',
  'brew_day',
  'ferm_meta',
  'cold_side',
  'water_chem',
  'recipe_profiles',
  'mash',
  'ferm_log',
];

/** Concise ferm log entry summary for the deletion confirm prompt. */
export interface PendingFermLogDeletion {
  id: string;
  recipeId: string;
}

/** One localStorage write to be applied during sbApplyHydration. */
interface HydrationWrite {
  key: string;
  value: unknown;
  /** Skip this write when applyDeletions=false (i.e. user declined the
   *  ferm log deletion prompt). Used only for ferm log writes whose
   *  recipe has pending row tombstones; recipe archival no longer prompts. */
  deletionGated?: boolean;
}

/**
 * Plan returned by sbFetchHydration. Holds everything sbApplyHydration
 * needs to write.
 *
 * `success: false` indicates a fetch error; `configured: false`
 * indicates no Supabase credentials are set. Either way, applying the
 * plan is a no-op.
 *
 * Recipe-level tombstones (archived) are no longer prompted — `bl_recipe_list`
 * receives all recipes, active and archived, with `archivedAt` set on each.
 * Active-only views filter at render time. Per-recipe blobs for archived
 * recipes stay in localStorage so the archive view can render without a
 * round-trip.
 */
export interface HydrationPlan {
  success: boolean;
  configured: boolean;
  recipesCount: number;
  /** Ferm log row tombstones still prompt (single-row deletes via the
   *  Ferm tab's toast/undo system are infrequent enough to warrant
   *  cross-device confirmation). */
  pendingFermLogDeletions: PendingFermLogDeletion[];
  writes: HydrationWrite[];
  /** ISO timestamp to write to bl_last_sync on apply. */
  syncTimestamp: string;
}

/**
 * Local-state inputs to sbFetchHydration. The store builds these from
 * its current state so the fetch can compute the prompt without reading
 * localStorage directly (keeps supabase.ts and storage.ts acyclic).
 */
export interface LocalContext {
  /** ISO of last successful hydrate, or null on first run. */
  lastSync: string | null;
  /** Per-recipe ferm_log entry ids currently in localStorage. Used to
   *  filter out self-deletion echoes from the ferm log deletion prompt
   *  (a tombstone for an entry this device already removed locally is
   *  its own deletion coming back, not an incoming one). */
  fermLogIdsByRecipe: Map<string, Set<string>>;
}

const HYDRATION_EMPTY: HydrationPlan = {
  success: false,
  configured: false,
  recipesCount: 0,
  pendingFermLogDeletions: [],
  writes: [],
  syncTimestamp: '',
};

/**
 * Fetch all hydratable data from Supabase. Read-only — does NOT write
 * localStorage. Caller passes the plan to sbApplyHydration after
 * (optionally) prompting the user about pending ferm log deletions.
 *
 * Recipe state: every recipe row (active and archived) flows into
 * `bl_recipe_list` with `archivedAt` set per row. The Recipe type carries
 * `archivedAt: string | null`; UI surfaces filter by it. Per-recipe blobs
 * for archived recipes hydrate too, so the archive view renders without
 * extra round-trips.
 */
export async function sbFetchHydration(local: LocalContext): Promise<HydrationPlan> {
  const sb = getSupabase();
  if (!sb) return { ...HYDRATION_EMPTY };

  const writes: HydrationWrite[] = [];
  const pendingFermLogDeletions: PendingFermLogDeletion[] = [];
  let recipesCount = 0;
  const { lastSync } = local;

  try {
    // ── Recipes (active + archived in one list) ──────────────────────
    const { data: recipes } = await sb
      .from('recipes')
      .select('*')
      .order('id')
      .limit(1000000);

    if (recipes) {
      const all = recipes.map(rowToRecipe);
      recipesCount = all.filter(r => !r.archivedAt).length;
      writes.push({ key: 'bl_recipe_list', value: all });
    }

    // ── Ingredients ─────────────────────────────────────────────────
    const { data: ings } = await sb
      .from('recipe_ingredients')
      .select('*')
      .order('sort_order')
      .limit(1000000);

    if (ings) {
      const byRecipe = new Map<string, Ingredient[]>();
      for (const row of ings) {
        const recipeId = row.recipe_id;
        if (!byRecipe.has(recipeId)) byRecipe.set(recipeId, []);
        byRecipe.get(recipeId)!.push(rowToIng(row));
      }
      for (const [recipeId, ingredients] of byRecipe) {
        writes.push({ key: `bl_recipe_ings_${recipeId}`, value: ingredients });
      }
    }

    // ── Ferm log (with deleted_at filter) ───────────────────────────
    const { data: fermLogs } = await sb
      .from('ferm_log')
      .select('*')
      .order('entry_date', { ascending: true })
      .limit(1000000);

    // Track which recipes have pending tombstoned entries — those
    // recipes' ferm log writes get deletion-gated.
    const fermLogPendingRecipeIds = new Set<string>();

    if (fermLogs) {
      const active = fermLogs.filter(r => !r.deleted_at);
      const deletedSinceLast = fermLogs.filter(r =>
        r.deleted_at && (!lastSync || r.deleted_at > lastSync)
      );

      for (const r of deletedSinceLast) {
        const local_ids = local.fermLogIdsByRecipe.get(r.recipe_id);
        if (local_ids && local_ids.has(r.id)) {
          pendingFermLogDeletions.push({ id: r.id, recipeId: r.recipe_id });
          fermLogPendingRecipeIds.add(r.recipe_id);
        }
        // Otherwise: self-deletion echo — already gone locally. No-op.
      }

      const byRecipe = new Map<string, FermLogEntry[]>();
      for (const row of active) {
        const recipeId = row.recipe_id;
        if (!byRecipe.has(recipeId)) byRecipe.set(recipeId, []);
        byRecipe.get(recipeId)!.push({
          id: row.id,
          date: row.entry_date,
          plato: row.plato,
          ph: row.ph,
          temp: row.temp,
          notes: row.notes ?? '',
        });
      }
      for (const [recipeId, entries] of byRecipe) {
        writes.push({
          key: `bl_ferm_log_${recipeId}`,
          value: entries,
          // Gate only the recipes with pending tombstones — others get
          // their other-device additions even if user declines the
          // deletion prompt.
          deletionGated: fermLogPendingRecipeIds.has(recipeId),
        });
      }
    }

    // ── JSONB blob tables ───────────────────────────────────────────
    // brew_day / ferm_meta / cold_side / water_chem / recipe_profiles / mash.
    for (const table of ['brew_day', 'ferm_meta', 'cold_side', 'water_chem', 'recipe_profiles', 'mash'] as const) {
      const prefix =
        table === 'brew_day'        ? 'bl_bd_'              :
        table === 'ferm_meta'       ? 'bl_ferm_meta_'       :
        table === 'cold_side'       ? 'bl_cold_'            :
        table === 'water_chem'      ? 'bl_water_chem_'      :
        table === 'recipe_profiles' ? 'bl_recipe_profiles_' :
                                      'bl_mash_';
      const { data } = await sb.from(table).select('*').limit(1000000);
      if (data) {
        for (const row of data) {
          writes.push({ key: `${prefix}${row.recipe_id}`, value: row.data });
        }
      }
    }

    // ── Settings (skip bl_brew_settings to protect credentials) ─────
    const { data: settings } = await sb.from('settings').select('*').limit(1000000);
    if (settings) {
      for (const row of settings) {
        if (row.id === 'bl_brew_settings') continue;
        writes.push({ key: row.id, value: row.data });
      }
    }

    // ── Harvested yeast (strain-keyed object reassembly) ────────────
    const { data: yeast } = await sb
      .from('harvested_yeast')
      .select('*')
      .order('entry_date', { ascending: true })
      .limit(1000000);
    if (yeast && yeast.length > 0) {
      const yeastData: Record<string, {
        generation: number;
        entries: Record<string, unknown>[];
      }> = {};
      for (const r of yeast) {
        const strain = String(r.strain ?? '');
        if (!strain) continue;
        if (!yeastData[strain]) {
          const g = typeof r.generation === 'number' && r.generation > 0 ? r.generation : 1;
          yeastData[strain] = { generation: g, entries: [] };
        }
        // Mirror the dispatch path: harvest rows pull
        //   beer_name → harvestedFrom, tax_batch → harvestedFromTaxBatch
        // and usage rows pull
        //   beer_name → beer,           tax_batch → taxBatch.
        // Legacy rows where tax_batch IS NULL hydrate gracefully —
        // both `harvestedFromTaxBatch` and `taxBatch` are optional and
        // HarvestedYeastView's formatPair helper falls back to
        // single-value rendering when one side is missing.
        //
        // The deprecated `brew_num` column is intentionally NOT read.
        // Any value sitting there is the dead-on-write `e.brewNum`
        // field — semantically NOT a tax batch, so reading it as one
        // would surface bogus values in the inventory display.
        const isUsage = r.entry_type === 'usage';
        yeastData[strain].entries.push({
          id:          r.id,
          type:        r.entry_type,
          date:        r.entry_date,
          harvestDate: r.entry_date,
          got:         r.entry_type === 'harvest' ? r.amount_l : 0,
          used:        isUsage                    ? r.amount_l : 0,
          // Usage row → e.beer / e.taxBatch carry the destination brew.
          beer:                  isUsage ? (r.beer_name ?? undefined) : undefined,
          taxBatch:              isUsage ? (r.tax_batch ?? undefined) : undefined,
          // Harvest row → e.harvestedFrom / e.harvestedFromTaxBatch.
          harvestedFrom:         isUsage ? undefined : (r.beer_name ?? undefined),
          harvestedFromTaxBatch: isUsage ? undefined : (r.tax_batch ?? undefined),
          generation:  r.generation,
          container:   r.container,
          note:        r.note,
          recipeId:    r.recipe_id,
        });
      }
      writes.push({ key: 'bl_harvested_yeast', value: yeastData });
    }
    // (Conservative-write: skip the write when Supabase returned no
    //  rows — matches HTML line 7026.)

    // ── Tax records (per-recipe working blob) ───────────────────────
    const { data: taxRecords } = await sb.from('tax_records').select('*').limit(1000000);
    if (taxRecords) {
      for (const row of taxRecords) {
        const unpacked = sbUnpackTaxRow(row);
        const recipeId = unpacked.recipeId as string | undefined;
        if (!recipeId) continue;
        writes.push({ key: `bl_tax_${recipeId}`, value: unpacked });
      }
    }

    // ── Tax master (single array) ───────────────────────────────────
    const { data: taxMaster } = await sb.from('tax_master').select('*').limit(1000000);
    if (taxMaster) {
      const rows = taxMaster
        .map(sbUnpackTaxRow)
        .filter((r): r is Record<string, unknown> & { recipeId: string } =>
          typeof r.recipeId === 'string' && r.recipeId.length > 0,
        );
      writes.push({ key: 'bl_tax_master', value: rows });
    }

    return {
      success: true,
      configured: true,
      recipesCount,
      pendingFermLogDeletions,
      writes,
      syncTimestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[sbFetchHydration] Error:', err);
    return { ...HYDRATION_EMPTY, configured: true };
  }
}

export interface ApplyHydrationOptions {
  /** When false, ferm log writes for recipes with pending row-tombstones
   *  are skipped and bl_last_sync is NOT advanced (so the next hydrate
   *  re-prompts). When true (or no pending deletions), everything applies. */
  applyDeletions: boolean;
}

/**
 * Apply a fetched hydration plan to localStorage. Idempotent — calling
 * twice with the same plan is harmless.
 *
 * Deletion gating now applies only to ferm log row tombstones; recipe
 * archival is unprompted (an archived recipe stays in `bl_recipe_list`
 * with `archivedAt` set, and the UI filters it out of active views).
 */
export function sbApplyHydration(
  plan: HydrationPlan,
  lsLocal: (key: string, value: unknown) => void,
  _lsRemove: (key: string) => void,
  opts: ApplyHydrationOptions,
): void {
  if (!plan.configured || !plan.success) return;

  for (const w of plan.writes) {
    if (w.deletionGated && !opts.applyDeletions) continue;
    lsLocal(w.key, w.value);
  }

  if (opts.applyDeletions) {
    lsLocal('bl_last_sync', plan.syncTimestamp);
  }
}

// === Connection test ===

/**
 * Test arbitrary Supabase credentials by hitting /rest/v1/recipes?limit=1.
 * Mirrors HTML sbTestConnection(). Returns { ok, msg } so callers can show
 * the same status text the desktop HTML shows.
 */
export async function sbTestConnection(
  url?: string,
  key?: string
): Promise<{ ok: boolean; msg: string }> {
  let testUrl = url;
  let testKey = key;
  if (testUrl === undefined || testKey === undefined) {
    const cfg = getCredentials();
    if (!cfg) return { ok: false, msg: 'No URL or key configured' };
    testUrl = cfg.url;
    testKey = cfg.key;
  }
  testUrl = (testUrl ?? '').replace(/\/$/, '');
  if (!testUrl || !testKey) return { ok: false, msg: 'No URL or key configured' };
  try {
    const res = await fetch(`${testUrl}/rest/v1/recipes?limit=1`, {
      headers: {
        apikey: testKey,
        Authorization: 'Bearer ' + testKey,
      },
    });
    if (res.ok) return { ok: true, msg: 'Connected' };
    const err = await res.json().catch(() => ({} as { message?: string }));
    return { ok: false, msg: err.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}

// === Push all local → Supabase ===

/**
 * Push every bl_ key in localStorage to Supabase via sbDispatch.
 * Mirrors HTML sbPushAll(). Returns the number of records pushed.
 * No-op when credentials are missing.
 */
export async function sbPushAll(): Promise<number> {
  if (!getSupabase()) return 0;
  let count = 0;
  let failed = 0;
  console.info('[sbPushAll] starting');

  const dispatch = async (k: string, val: unknown) => {
    try {
      await sbDispatch(k, val);
      count++;
    } catch (err) {
      console.error('[sbPushAll] dispatch threw for key', k, err);
      failed++;
    }
  };

  // Push bl_recipe_list FIRST so per-recipe rows (ingredients, ferm log,
  // brew_day, ferm_meta, cold_side) don't fail FK against a recipe that
  // hasn't been upserted yet. Mirrors HTML sbPushAll line 7058.
  const recipeListRaw = localStorage.getItem('bl_recipe_list');
  if (recipeListRaw) {
    try {
      const rl = JSON.parse(recipeListRaw);
      if (Array.isArray(rl) && rl.length > 0) {
        await dispatch('bl_recipe_list', rl);
      }
    } catch (err) {
      console.error('[sbPushAll] JSON parse failed for bl_recipe_list', err);
      failed++;
    }
  }

  // Then everything else.
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('bl_')) continue;
    if (k === 'bl_recipe_list') continue; // already pushed
    const raw = localStorage.getItem(k);
    if (raw === null) continue;
    let val: unknown;
    try { val = JSON.parse(raw); } catch (err) {
      console.error('[sbPushAll] JSON parse failed for key', k, err);
      failed++;
      continue;
    }
    if (val === null || val === undefined) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    await dispatch(k, val);
  }
  console.info(`[sbPushAll] done — dispatched ${count}, threw ${failed}. Per-row Postgres errors are logged separately by sbDispatch.`);
  return count;
}

// === Reset / wipe ===

/**
 * Wipe every BrewLab table on Supabase. Used by Reset All Data.
 * Mirrors HTML resetAllData() but uses the correct PK filter per table
 * (HTML uses ?id=neq.XXX uniformly, which silently skips brew_day /
 * ferm_meta / cold_side because those tables key on recipe_id).
 */
export async function sbWipeAll(): Promise<void> {
  const cfg = getCredentials();
  if (!cfg) return;
  const headers = {
    apikey: cfg.key,
    Authorization: 'Bearer ' + cfg.key,
    'Content-Type': 'application/json',
  };
  const idTables = ['recipe_ingredients', 'ferm_log', 'harvested_yeast', 'tax_records', 'tax_master', 'recipes', 'settings'];
  const recipeIdTables = ['brew_day', 'ferm_meta', 'cold_side', 'water_chem', 'recipe_profiles', 'mash'];
  for (const t of idTables) {
    try {
      await fetch(`${cfg.url}/rest/v1/${t}?id=not.is.null`, { method: 'DELETE', headers });
    } catch (e) { console.warn('Could not delete ' + t, e); }
  }
  for (const t of recipeIdTables) {
    try {
      await fetch(`${cfg.url}/rest/v1/${t}?recipe_id=not.is.null`, { method: 'DELETE', headers });
    } catch (e) { console.warn('Could not delete ' + t, e); }
  }
}

// === Row mapping helpers ===

function recipeToRow(r: Recipe) {
  // brew_again accepts only 'yes' | 'no' | 'maybe' (HTML guard at line 6592 of
  // brewlab-desktop.html); anything else becomes null.
  const brewAgainValue =
    r.brewAgain && ['yes', 'no', 'maybe'].includes(r.brewAgain)
      ? r.brewAgain
      : null;
  return {
    id: r.id,
    lineage_id: r.lineageId,
    name: r.name,
    beer_name: r.beerName,
    style: r.style,
    style_key: r.styleKey,
    folder_id: r.folder,
    batch_size_l: r.batchL,
    classification: r.classification,
    brew_date: r.brewDate,
    // tax_batch has a UNIQUE constraint on the Supabase side (column
    // renamed from brew_num in 2026-05-06 migration; constraint renamed
    // to recipes_tax_batch_key to match). Two recipes with taxBatch=''
    // would collide (empty strings ARE equal under unique). Postgres
    // treats NULL ≠ NULL for uniqueness, so converting empty/whitespace
    // to null lets unsubmitted-yet recipes coexist. Real tax-batch
    // values (e.g. "384") still pass through and remain enforced as unique.
    tax_batch: r.taxBatch && r.taxBatch.trim() !== '' ? r.taxBatch : null,
    // brew_number column added in the same migration. Per-lineage
    // sequential counter; nullable; no unique constraint.
    // GATE: comment this line out before the migration is applied —
    // supabase-js otherwise returns PGRST204 ("column does not exist")
    // and the upsert fails (lsLocal still succeeds, so local writes are
    // safe but cross-device sync of brewNumber is degraded). Once the
    // user has run the migration, leave the line uncommented.
    brew_number: r.brewNumber ?? null,
    version: r.version,
    version_note: r.versionNote || null,
    locked: r.locked,
    rating: r.rating,
    brew_again: brewAgainValue,
    cost: r.cost ?? null,
    abv: r.abv,
    ibu: r.ibu,
    ebc: r.ebc,
    og_plato: r.ogPlato,
    fg_plato: r.fgPlato,
    bd_fv: r.bdFv,
    notes: r.notes,
    // extra_additions and brewer columns added to Supabase schema
    // 2026-05-12. Read side has been live since these fields landed in
    // the Recipe interface; write side flipped on the same date so
    // edits round-trip across devices.
    extra_additions: r.extraAdditions || '',
    brewer: r.brewer || '',
    // Vestigial column — see Recipe.archivedAt JSDoc. Always null under
    // the simplified hard-delete-only model; round-tripped so the DB
    // column doesn't drift.
    archived_at: r.archivedAt ?? null,
  };
}

function rowToRecipe(row: Record<string, unknown>): Recipe {
  // bhEff / boilTime / whirlpoolTemp are local-only (no Supabase columns —
  // recipeToRow above doesn't write them either). Default to the same values
  // Desktop.createNewRecipe uses so a hydrated recipe matches a freshly
  // created one. If a brewer needs these to round-trip, add the columns
  // here AND in recipeToRow together.
  return {
    id: row.id as string,
    lineageId: (row.lineage_id as string) ?? '',
    name: (row.name as string) ?? '',
    beerName: (row.beer_name as string) ?? '',
    style: (row.style as string) ?? '',
    styleKey: (row.style_key as string) ?? '',
    folder: (row.folder_id as string) ?? '',
    batchL: (row.batch_size_l as number) ?? 0,
    classification: (row.classification as 'Beer' | 'Happoshu') ?? 'Beer',
    brewDate: (row.brew_date as string) ?? '',
    taxBatch: (row.tax_batch as string) ?? '',
    brewNumber: (row.brew_number as number | null) ?? undefined,
    version: (row.version as string) ?? '',
    versionNote: (row.version_note as string) ?? '',
    locked: (row.locked as boolean) ?? false,
    rating: (row.rating as number) ?? 0,
    brewAgain: (row.brew_again as RecipeBrewAgain) ?? null,
    cost: (row.cost as number) ?? 0,
    abv: (row.abv as number) ?? 0,
    ibu: (row.ibu as number) ?? 0,
    ebc: (row.ebc as number) ?? 0,
    ogPlato: (row.og_plato as number) ?? 0,
    fgPlato: (row.fg_plato as number) ?? 0,
    bhEff: 67.60,
    boilTime: 45,
    whirlpoolTemp: 85,
    bdFv: (row.bd_fv as string) ?? '',
    notes: (row.notes as string) ?? '',
    // extra_additions / brewer columns added to Supabase 2026-05-12.
    // Empty-string fallback covers rows written before the migration
    // (Postgres column has DEFAULT '' so this is belt-and-braces).
    extraAdditions: (row.extra_additions as string) ?? '',
    brewer: (row.brewer as string) ?? '',
    archivedAt: (row.archived_at as string | null) ?? null,
  };
}

/**
 * Build a recipe_ingredients row. Mirrors the HTML reference's
 * sbSyncIngredients (brewlab-desktop.html line 6617) exactly:
 *   - recipe_id is passed in by the dispatcher (not derived from i.id)
 *   - sort_order is the array index (trusts current array order)
 *   - all numerics are parseFloat / parseInt with `|| null` fallback
 *   - empty strings on type / unit / use coerce to null / 'misc' / null
 *   - lib_id is intentionally NOT written — that column doesn't exist in
 *     Supabase. libId stays in localStorage / in-memory only.
 *
 * ID handling: strips every leading `${recipeId}_` prefix from the raw id
 * before re-prefixing. The HTML reference had no prefix guard until
 * 2026-05-03, so legacy data may have ids like r1_r1_1 (or r1_r1_r1_1) —
 * this loop heals them to r1_1 on the next save. Combined with the
 * delete-then-insert dispatch flow, this self-heals corrupted rows in
 * Supabase as soon as the user touches the recipe.
 */
function ingToRow(recipeId: string, ing: Ingredient, idx: number) {
  let rawId = String(ing.id ?? idx);
  while (rawId.startsWith(recipeId + '_')) rawId = rawId.slice(recipeId.length + 1);
  // ────────────────────────────────────────────────────────────────────
  // `malted` round-trips per-row malted/unmalted overrides across devices.
  // Used by:
  //   - pullIngredientTotals (lib/tax.ts) — malt vs wheat/oats/other split
  //   - ntaNormalise (lib/nta.ts) — same bucketing for the NTA submitter
  // Requires migrations/2026-05-04_add_malted_column.sql (column has
  // DEFAULT true, so existing rows backfill automatically). `undefined`
  // on the in-memory ingredient (the typical case — pulled from MaltLib
  // at add-time) maps to NULL so the column DEFAULT applies on insert.
  // rowToIng below returns NULL → undefined, so consumers fall through
  // to `MaltLib.malted` exactly as before for legacy rows.
  // ────────────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────────────
  // `yeast_source` / `yeast_gen` round-trip the harvested-yeast link
  // for yeast ingredients. AddIngredientModal stamps these on the
  // ingredient as ad-hoc fields (not in the typed Ingredient schema —
  // see brewlab/src/components/recipe/AddIngredientModal.tsx:503–506).
  //
  // FermTab's "Log Harvest to Inventory" pre-fill reads them to suggest
  // the new harvest's generation = parent + 1. Without these columns
  // the parent gen is lost on cross-device hydrate and the modal falls
  // back to fresh / Gen 2.
  //
  // Requires migrations/2026-05-07_add_yeast_source_gen_to_recipe_ingredients.sql.
  // If the migration hasn't been applied, the insert will fail with
  // PGRST204 — same failure mode the `malted` block describes above.
  // The fallback is identical: edit a recipe to refresh local state,
  // FermTab works against the in-memory ingredient regardless.
  // ────────────────────────────────────────────────────────────────────
  type YeastIng = Ingredient & { yeastSource?: string; yeastGen?: string | number };
  const isYeast = ing.type === 'yeast';
  const yIng = isYeast ? (ing as YeastIng) : null;
  const yeastSource = yIng?.yeastSource ?? null;
  const yeastGenRaw = yIng?.yeastGen;
  const yeastGen = yeastGenRaw == null || yeastGenRaw === ''
    ? null
    : (parseInt(String(yeastGenRaw), 10) || null);

  return {
    id:           `${recipeId}_${rawId}`,
    recipe_id:    recipeId,
    type:         ing.type || 'misc',
    name:         ing.name || '',
    amount:       parseFloat(String(ing.amt))     || null,
    unit:         ing.unit || null,
    use:          ing.use  || null,
    time:         parseInt(String(ing.time), 10)  || null,
    extra:        parseFloat(String(ing.extra))   || null,
    ibu:          parseFloat(String(ing.ibu))     || null,
    pct:          parseFloat(String(ing.pct))     || null,
    cost:         parseFloat(String(ing.cost))    || null,
    sort_order:   idx,
    malted:       ing.malted === undefined ? null : ing.malted,
    yeast_source: yeastSource,
    yeast_gen:    yeastGen,
  };
}

function rowToIng(row: Record<string, unknown>): Ingredient {
  // malted: null/undefined → leave undefined (treated as `true` by consumers,
  // matches HTML's `g.malted !== false` semantics); explicit false → false.
  const maltedCol = row.malted;
  const malted = maltedCol === undefined || maltedCol === null
    ? undefined
    : Boolean(maltedCol);

  // yeast_source / yeast_gen are ad-hoc fields on Ingredient (not in the
  // typed schema). Spread them onto the returned object so FermTab's
  // parent-gen lookup can read them after a cross-device hydrate. Empty
  // / null values are dropped so the in-memory object stays clean.
  const yeastSource = row.yeast_source as string | null | undefined;
  const yeastGen    = row.yeast_gen    as number | null | undefined;
  const extras: Record<string, unknown> = {};
  if (yeastSource) extras.yeastSource = yeastSource;
  if (yeastGen != null) extras.yeastGen = yeastGen;

  return {
    id: row.id as string,
    type: row.type as Ingredient['type'],
    name: (row.name as string) ?? '',
    amt: (row.amount as number) ?? 0,
    unit: (row.unit as string) ?? '',
    use: (row.use as string) ?? '',
    time: (row.time as number) ?? null,
    extra: (row.extra as string) ?? '',
    ibu: (row.ibu as number) ?? null,
    pct: (row.pct as number) ?? null,
    // libId is local-only; never round-trips through Supabase.
    libId: '',
    cost: (row.cost as number) ?? 0,
    sortOrder: (row.sort_order as number) ?? 0,
    ...(malted === undefined ? {} : { malted }),
    ...extras,
  };
}

/**
 * Normalize a free-form classification string to the CHECK-constrained value.
 * Mirrors HTML normalizeClassification (brewlab-desktop.html line 6546).
 */
function normalizeClassification(cls: unknown): 'Beer' | 'Happoshu' | null {
  if (!cls) return null;
  return String(cls).toLowerCase().includes('happoshu') ? 'Happoshu' : 'Beer';
}

/**
 * Build a tax-row payload from the localStorage tax record shape (dashed keys
 * like 'brew-num', 'snap-fv-bt-waste', etc.). Shared by tax_records and
 * tax_master writes — mirrors HTML sbBuildTaxRow (brewlab-desktop.html line 6752).
 */
function sbBuildTaxRow(rec: Record<string, unknown>): Record<string, unknown> {
  const n = (f: string) => {
    const v = parseFloat(String(rec[f] ?? ''));
    return isFinite(v) ? v : null;
  };
  const d = (f: string) => (rec[f] as string) || null;
  return {
    brew_date:              d('date'),
    brew_num:               d('brew-num'),
    recipe_name:            d('recipe-name'),
    beer_name:              d('beer-name'),
    classification:         normalizeClassification(rec['classification'] || rec['class']),
    // Ingredients
    malt_kg:                n('malt'),
    wheat_kg:               n('wheat'),
    oats_kg:                n('oats'),
    other_kg:               n('other'),
    hops_kg:                n('hops'),
    yeast_kg:               n('yeast'),
    water_l:                n('water'),
    spent_grain_kg:         n('spent-grain'),
    kettle_waste_l:         n('kettle-waste'),
    // Fermentation
    fv_num:                 d('fv-num'),
    fv_mm:                  n('fv-mm'),
    into_fv_l:              n('in-fv'),
    start_plato:            n('start-brix'),
    finish_plato:           n('finish-brix'),
    abv:                    n('abv'),
    // Conditioning
    tank_num:               d('tank'),
    bt_mm:                  n('mm'),
    into_bt_l:              n('in-bt'),
    // Legacy packaging
    keg_qty:                d('keg-qty'),
    keg_total:              n('keg-total'),
    can_size_ml:            n('can-size-ml'),
    cans:                   n('cans'),
    can_total:              n('can-total'),
    total_packaged:         n('total-packaged'),
    // Snap — cans
    snap_cans:              n('snap-cans'),
    snap_can_size_ml:       n('snap-can-size-ml'),
    snap_sell_can_l:        n('snap-sell-can-l'),
    snap_can_waste_manual:  n('snap-can-waste-manual'),
    snap_flowmeter_l:       n('snap-flowmeter'),
    snap_flowmeter_waste_l: n('snap-flowmeter-waste'),
    snap_total_can_waste_l: n('snap-total-can-waste'),
    // Snap — kegs
    snap_keg_rows:          rec['snap-keg-rows'] ?? null,
    snap_sell_keg_l:        n('snap-sell-keg-l'),
    snap_kegs_15:           n('snap-kegs-15'),
    snap_kegs_10:           n('snap-kegs-10'),
    snap_keg_waste_l:       n('snap-keg-waste'),
    // Snap — totals
    snap_into_bt_l:         n('snap-into-bt'),
    snap_yeast_harvest_l:   n('snap-yeast-harvest'),
    snap_sell_total_l:      n('snap-sell-total'),
    snap_fv_bt_waste_l:     n('snap-fv-bt-waste'),
    snap_fv_bt_pct:         n('snap-fv-bt-pct'),
    snap_ut_waste_l:        n('snap-ut-waste'),
    snap_total_waste_pkg_l: n('snap-total-waste-pkg'),
    snap_total_waste_l:     n('snap-total-waste'),
    snap_pct_can_waste:     n('snap-pct-can-waste'),
    snap_pct_pkg_waste:     n('snap-pct-pkg-waste'),
    snap_pct_total:         n('snap-pct-total'),
    // Snap — other
    snap_pkg_date:          d('snap-pkg-date'),
    snap_transfer_into:     d('snap-transfer-into'),
    snap_bt_mm:             n('snap-bt-mm'),
    snap_transfer_yes:
      rec['snap-transfer-yes'] === true || rec['snap-transfer-yes'] === 'true',
    // Misc
    notes:                  d('notes'),
  };
}

/**
 * Inverse of sbBuildTaxRow — converts a Supabase tax_records / tax_master row
 * (snake_case columns) back into the HTML's dashed-key tax record blob shape
 * used by `bl_tax_<recipeId>` and `bl_tax_master`.
 *
 * Mirrors HTML brewlab-desktop.html:6697–6759. The dashed-key set must
 * match `sbBuildTaxRow` exactly so a round-trip is lossless.
 *
 * Note on `recordedAt`: there is no dedicated `recorded_at` column in the
 * schema (SCHEMA.md). Supabase auto-manages `updated_at` on every change;
 * we surface that here so the overwrite-confirm prompt has something to
 * display. If the user needs a true "first filed" timestamp, add a
 * `recorded_at` column and update both sbBuildTaxRow and this unpacker.
 */
export function sbUnpackTaxRow(row: Record<string, unknown>): Record<string, unknown> {
  const s = (col: string): string | undefined =>
    row[col] === null || row[col] === undefined ? undefined : String(row[col]);
  const n = (col: string): number | undefined => {
    const v = row[col];
    if (v === null || v === undefined) return undefined;
    const num = typeof v === 'number' ? v : parseFloat(String(v));
    return isFinite(num) ? num : undefined;
  };
  const out: Record<string, unknown> = {};
  const set = (k: string, v: unknown): void => {
    if (v !== undefined && v !== null) out[k] = v;
  };

  set('date',           s('brew_date'));
  set('brew-num',       s('brew_num'));
  set('recipe-name',    s('recipe_name'));
  set('beer-name',      s('beer_name'));
  set('classification', s('classification'));
  // 'class' is the HTML's TAX_FIELDS variant of the same value (tr-class
  // input). Mirror so both keys are present after round-trip.
  set('class',          s('classification'));
  set('malt',           n('malt_kg')?.toString());
  set('wheat',          n('wheat_kg')?.toString());
  set('oats',           n('oats_kg')?.toString());
  set('other',          n('other_kg')?.toString());
  set('hops',           n('hops_kg')?.toString());
  set('yeast',          n('yeast_kg')?.toString());
  set('water',          n('water_l')?.toString());
  set('spent-grain',    n('spent_grain_kg')?.toString());
  set('kettle-waste',   n('kettle_waste_l')?.toString());
  set('fv-num',         s('fv_num'));
  set('fv-mm',          n('fv_mm')?.toString());
  set('in-fv',          n('into_fv_l')?.toString());
  set('start-brix',     n('start_plato')?.toString());
  set('finish-brix',    n('finish_plato')?.toString());
  set('abv',            n('abv'));
  set('tank',           s('tank_num'));
  set('mm',             n('bt_mm')?.toString());
  set('in-bt',          n('into_bt_l')?.toString());
  set('keg-qty',        s('keg_qty'));
  set('keg-total',      n('keg_total')?.toString());
  set('can-size-ml',    n('can_size_ml')?.toString());
  set('cans',           n('cans')?.toString());
  set('can-total',      n('can_total')?.toString());
  set('total-packaged', n('total_packaged')?.toString());
  set('notes',          s('notes'));
  // Snap fields: stored as numbers (and one boolean / one array)
  set('snap-cans',              n('snap_cans'));
  set('snap-can-size-ml',       n('snap_can_size_ml'));
  set('snap-sell-can-l',        n('snap_sell_can_l'));
  set('snap-can-waste-manual',  n('snap_can_waste_manual'));
  set('snap-flowmeter',         n('snap_flowmeter_l'));
  set('snap-flowmeter-waste',   n('snap_flowmeter_waste_l'));
  set('snap-total-can-waste',   n('snap_total_can_waste_l'));
  if (row.snap_keg_rows !== undefined && row.snap_keg_rows !== null) {
    out['snap-keg-rows'] = row.snap_keg_rows;
  }
  set('snap-sell-keg-l',        n('snap_sell_keg_l'));
  set('snap-kegs-15',           n('snap_kegs_15'));
  set('snap-kegs-10',           n('snap_kegs_10'));
  set('snap-keg-waste',         n('snap_keg_waste_l'));
  set('snap-into-bt',           n('snap_into_bt_l'));
  set('snap-yeast-harvest',     n('snap_yeast_harvest_l'));
  set('snap-sell-total',        n('snap_sell_total_l'));
  set('snap-fv-bt-waste',       n('snap_fv_bt_waste_l'));
  set('snap-fv-bt-pct',         n('snap_fv_bt_pct'));
  set('snap-ut-waste',          n('snap_ut_waste_l'));
  set('snap-total-waste-pkg',   n('snap_total_waste_pkg_l'));
  set('snap-total-waste',       n('snap_total_waste_l'));
  set('snap-pct-can-waste',     n('snap_pct_can_waste'));
  set('snap-pct-pkg-waste',     n('snap_pct_pkg_waste'));
  set('snap-pct-total',         n('snap_pct_total'));
  set('snap-pkg-date',          s('snap_pkg_date'));
  set('snap-transfer-into',     s('snap_transfer_into'));
  set('snap-bt-mm',             n('snap_bt_mm')?.toString());
  if (row.snap_transfer_yes !== undefined && row.snap_transfer_yes !== null) {
    out['snap-transfer-yes'] =
      row.snap_transfer_yes === true || row.snap_transfer_yes === 'true';
  }
  // Identity (tax_master rows) — recipeId is the PK; recordedAt falls back
  // to updated_at since there is no dedicated column today.
  set('recipeId',   s('recipe_id'));
  set('recordedAt', s('updated_at'));
  return out;
}

const SETTINGS_KEYS = new Set([
  'bl_brew_settings', 'bl_lib_malts', 'bl_lib_hops', 'bl_lib_yeast', 'bl_lib_misc',
  'bl_lib_next_id',
  'bl_tank_calib', 'bl_folder_list', 'bl_planner_brews', 'bl_yearly', 'bl_brewery_notes',
  'bl_inv_stock', 'bl_ledger', 'bl_orders',
  'bl_equip_profiles', 'bl_water_profiles', 'bl_mash_profiles',
  'bl_pitch_profiles', 'bl_custom_styles', 'bl_style_overlays', 'bl_suppliers', 'bl_tab_visibility',
  'bl_nta_register', 'bl_nta_basis_default', 'bl_nta_basis_current',
  'bl_templates', 'bl_equipment',
]);

/**
 * Prefix patterns — match any key whose name starts with the prefix.
 * Use sparingly: each entry expands the settings table to one row per
 * suffix value (e.g. one row per fiscal year for `bl_tariff_`). Suffixes
 * should be a small bounded set; don't add prefixes that fan out per
 * recipe or per anything user-data-volume.
 */
const SETTINGS_KEY_PREFIXES: readonly string[] = [
  'bl_tariff_',  // bl_tariff_<year> — one row per FY (~6 rows lifetime)
];

function isSettingsKey(key: string): boolean {
  if (SETTINGS_KEYS.has(key)) return true;
  for (const prefix of SETTINGS_KEY_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}
