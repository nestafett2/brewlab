import { useMemo, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store';
import {
  calcClassification,
  calcBrewDayTargets, calcEffectiveTrubLossL,
  calcDryHopGperL, calcWhirlpoolGperL,
  computeRecipeStats,
} from '../../lib/calculations';
import { fmtNum } from '../../lib/format';
import { isWaterChem } from '../../lib/waterChem';
import type { Ingredient, IngredientType } from '../../types';
import IngredientCard from './IngredientCard';
import ActionStack from './ActionStack';
import StyleSummaryPanel from './StyleSummaryPanel';
import AddIngredientModal from './AddIngredientModal';
import EditIngredientModal from './EditIngredientModal';
import GrainPctModal from './GrainPctModal';
import HopIbuModal from './HopIbuModal';
import DhSplitModal from './DhSplitModal';
import MashProfileModal from './MashProfileModal';

export default function RecipeTab({ recipeId }: { recipeId: string }) {
  const recipes = useStore(s => s.recipes);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const loadIngredients = useStore(s => s.loadIngredients);
  const addIngredient = useStore(s => s.addIngredient);
  const removeIngredient = useStore(s => s.removeIngredient);
  const setIngredients = useStore(s => s.setIngredients);
  const updateIngredient = useStore(s => s.updateIngredient);
  const updateRecipe = useStore(s => s.updateRecipe);
  const pushToast = useStore(s => s.pushToast);
  const maltLib = useStore(s => s.maltLib);
  const hopLib = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib = useStore(s => s.miscLib);
  const settings = useStore(s => s.settings);
  const hydrated = useStore(s => s.hydrated);
  // Active equipment + mash profile feed calcBrewDayTargets so the
  // Totals panel's "Est Pre-Boil Gravity" matches what BrewDayTab shows.
  // Same selection chain BrewDayTab uses (recipeProfiles → first → null).
  const equipProfiles  = useStore(s => s.equipProfiles);
  const mashProfiles   = useStore(s => s.mashProfiles);
  const recipeProfiles = useStore(s => s.recipeProfilesByRecipe[recipeId]);
  // Wiring for the action stack's "Add to Planner" button — mirrors HTML
  // addCurrentRecipeToPlanner (brewlab-desktop.html:13522).
  const setActiveTab          = useStore(s => s.setActiveTab);
  const setTabVisibility      = useStore(s => s.setTabVisibility);
  const setPendingPlannerAdd  = useStore(s => s.setPendingPlannerAdd);

  const [addType, setAddType] = useState<IngredientType | null>(null);
  const [substituteMode, setSubstituteMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editIngId, setEditIngId] = useState<string | null>(null);
  const [grainPctModal, setGrainPctModal] = useState(false);
  const [hopIbuModal, setHopIbuModal] = useState(false);
  const [dhSplitIngId, setDhSplitIngId] = useState<string | null>(null);
  const [mashProfileModal, setMashProfileModal] = useState(false);
  // Right-click context menu position + target ingredient. Null when closed.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; ingId: string } | null>(null);

  const recipe = recipes.find(r => r.id === recipeId);

  // Load ingredients on recipe open, and re-load after hydration clears the cache
  useEffect(() => { loadIngredients(recipeId); }, [recipeId, loadIngredients, hydrated]);
  // Clear selection when switching recipes
  useEffect(() => { setSelectedId(null); }, [recipeId]);

  const ingredients = ingredientsByRecipe[recipeId] ?? [];
  const grains = useMemo(() => ingredients.filter(i => i.type === 'grain'), [ingredients]);
  const hops = useMemo(() => ingredients.filter(i => i.type === 'hop'), [ingredients]);
  const yeast = useMemo(() => ingredients.filter(i => i.type === 'yeast'), [ingredients]);
  // Misc is split for display: water-chemistry adjustments first, real
  // misc second. Filter is the same one the tax engine uses to exclude
  // water-chem from totals (lib/waterChem.ts) — visual grouping mirrors
  // the tax exclusion. Underlying ingredients array is unchanged.
  const miscAll       = useMemo(() => ingredients.filter(i => i.type === 'misc'), [ingredients]);
  const miscWaterChem = useMemo(() => miscAll.filter(isWaterChem), [miscAll]);
  const miscOther     = useMemo(() => miscAll.filter(i => !isWaterChem(i)), [miscAll]);

  // === All calculations — recompute live when ingredients/recipe/settings change ===
  // computeRecipeStats is shared with Desktop.tsx's Print-dropdown handler
  // (Prep Sheet) so the printed numbers can never drift from this totals strip.
  const stats = useMemo(() => {
    if (!recipe) return null;
    return computeRecipeStats({ recipe, ingredients, maltLib, hopLib, yeastLib, miscLib, settings });
  }, [recipe, ingredients, maltLib, hopLib, yeastLib, miscLib, settings]);

  // Active equip + mash profile for the pre-boil gravity calc (Totals panel).
  // Selection chain matches BrewDayTab: explicit per-recipe → first profile → null.
  const activeEquip = useMemo(() => {
    const equipId = recipeProfiles?.equip;
    const byId = equipId ? equipProfiles.find(p => p.id === equipId) : null;
    return byId ?? equipProfiles[0] ?? null;
  }, [equipProfiles, recipeProfiles?.equip]);
  const activeMash = useMemo(() => {
    const mashId = recipeProfiles?.mash;
    const byId = mashId ? mashProfiles.find(p => p.id === mashId) : null;
    return byId ?? null;
  }, [mashProfiles, recipeProfiles?.mash]);

  // Effective trub loss = base trub (40 L default or active equipment-
  // profile value) + hot-side hop absorption. Drives the "Batch into WP"
  // and "Expected loss" pills in the strip below the cards. Single source
  // of truth in lib/calculations → calcEffectiveTrubLossL; same selection
  // chain BrewDayTab uses (recipeProfiles → first → null).
  const effectiveTrubLossL = useMemo(
    () => calcEffectiveTrubLossL(ingredients, hopLib, activeEquip),
    [ingredients, hopLib, activeEquip],
  );

  // Batch into WP + per-litre hop densities for the bottom-row panels.
  // batchIntoWpL is the into-FV target + effective trub loss; same number
  // shown in the PROCESS panel and used as the WP G/L divisor.
  const batchIntoWpL = useMemo(
    () => (recipe?.batchL || 0) + effectiveTrubLossL,
    [recipe?.batchL, effectiveTrubLossL],
  );
  const dhGperL = useMemo(
    () => calcDryHopGperL(ingredients, recipe?.batchL || 0),
    [ingredients, recipe?.batchL],
  );
  const wpGperL = useMemo(
    () => calcWhirlpoolGperL(ingredients, batchIntoWpL),
    [ingredients, batchIntoWpL],
  );

  // Est Pre-Boil Gravity for the Totals panel. Same call BrewDayTab makes —
  // pure function, no side effects, recomputes on ingredient/profile change.
  const estPreBoilP = useMemo(() => {
    if (!recipe) return null;
    const t = calcBrewDayTargets({
      recipe, ingredients, maltLib, hopLib, yeastLib,
      equip: activeEquip, mashProfile: activeMash,
      grainAbsorbLkg: settings.grainAbsorb,
      grainTempC: settings.defaultGrainTemp,
      coolingShrinkagePct: settings.coolingShrinkage,
    });
    return t.preBoilGravityP;
  }, [recipe, ingredients, maltLib, hopLib, yeastLib, activeEquip, activeMash,
      settings.grainAbsorb, settings.defaultGrainTemp, settings.coolingShrinkage]);

  // Write calculated stats back to recipe object so they reach Supabase
  // (matches HTML app's dirty-check at end of updateTotals)
  useEffect(() => {
    if (!recipe || !stats) return;
    const updates: Partial<typeof recipe> = {};
    if (stats.ogPlato > 0 && Math.abs(stats.ogPlato - recipe.ogPlato) > 0.001) updates.ogPlato = stats.ogPlato;
    if (stats.fgPlato > 0 && Math.abs(stats.fgPlato - recipe.fgPlato) > 0.001) updates.fgPlato = stats.fgPlato;
    if (stats.abv > 0 && Math.abs(stats.abv - recipe.abv) > 0.01) updates.abv = stats.abv;
    if (stats.ibu > 0 && Math.abs(stats.ibu - recipe.ibu) > 0.01) updates.ibu = stats.ibu;
    if (stats.ebc > 0 && Math.abs(stats.ebc - recipe.ebc) > 0.01) updates.ebc = stats.ebc;
    if (Object.keys(updates).length > 0) {
      updateRecipe(recipeId, updates);
    }
  }, [stats, recipe, recipeId, updateRecipe]);

  // Sync classification whenever ingredients change
  useEffect(() => {
    if (!recipe || ingredients.length === 0) return;
    const cls = calcClassification(ingredients, miscLib);
    if (cls !== recipe.classification) {
      updateRecipe(recipeId, { classification: cls });
    }
  }, [ingredients, miscLib, recipe, recipeId, updateRecipe]);

  // === Action handlers (match prior sidebar behavior exactly) ===

  // Click row toggles selection (HTML: selectRow)
  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  // Double-click row opens edit modal (HTML: openIngEdit)
  const handleDoubleClick = useCallback((id: string) => {
    setEditIngId(id);
  }, []);

  // Delete by id (HTML: deleteSelected). Used by EDIT-group Delete and the
  // ingredient row right-click menu. Snapshots the full ingredients
  // array so undo restores the row at its original index without
  // disturbing siblings.
  const deleteById = useCallback((id: string) => {
    const current = ingredientsByRecipe[recipeId] ?? [];
    const target = current.find(i => i.id === id);
    if (!target) return;
    const before = current;
    removeIngredient(recipeId, id);
    setSelectedId(prev => prev === id ? null : prev);
    pushToast({
      message: `Deleted "${target.name || 'ingredient'}"`,
      undo: () => setIngredients(recipeId, before),
    });
  }, [recipeId, removeIngredient, setIngredients, pushToast, ingredientsByRecipe]);

  // Duplicate by id (HTML: duplicateSelected — copy, insert after, select copy).
  // Used by EDIT-group Duplicate and the ingredient row right-click menu.
  const duplicateById = useCallback((id: string) => {
    const orig = ingredients.find(i => i.id === id);
    if (!orig) return;
    const idx = ingredients.indexOf(orig);
    const newId = `${recipeId}_${Date.now()}`;
    const copy: Ingredient = { ...orig, id: newId, sortOrder: idx + 1 };
    const updated = [...ingredients];
    updated.splice(idx + 1, 0, copy);
    setIngredients(recipeId, updated);
    setSelectedId(newId);
  }, [ingredients, recipeId, setIngredients]);

  const handleDelete = useCallback(() => {
    if (!selectedId) { pushToast({ message: 'Select an ingredient first.', variant: 'info' }); return; }
    deleteById(selectedId);
  }, [selectedId, deleteById, pushToast]);

  const handleDuplicate = useCallback(() => {
    if (!selectedId) { pushToast({ message: 'Select an ingredient first.', variant: 'info' }); return; }
    duplicateById(selectedId);
  }, [selectedId, duplicateById, pushToast]);

  // Right-click on an ingredient row — mirrors HTML showCtx (line 19199):
  // selects the row, then opens the context menu at the cursor.
  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setSelectedId(id);
    setCtxMenu({ x: e.pageX, y: e.pageY, ingId: id });
  }, []);

  // Close the context menu on any click outside it, and on Escape.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // Defer the click listener so the right-click that opened the menu
    // doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  // Substitute — opens add modal in swap mode
  const handleSubstitute = useCallback(() => {
    if (!selectedId) { pushToast({ message: 'Select an ingredient first.', variant: 'info' }); return; }
    const ing = ingredients.find(i => i.id === selectedId);
    if (!ing) return;
    setSubstituteMode(true);
    setAddType(ing.type);
  }, [selectedId, ingredients, pushToast]);

  // When add modal closes in substitute mode, swap the ingredient
  const handleAddClose = useCallback((newIng?: Ingredient) => {
    if (substituteMode && newIng && selectedId) {
      const updated = ingredients.map(i => i.id === selectedId ? { ...newIng, id: selectedId, sortOrder: i.sortOrder } : i);
      setIngredients(recipeId, updated);
    }
    setAddType(null);
    setSubstituteMode(false);
  }, [substituteMode, selectedId, ingredients, recipeId, setIngredients]);

  // "Add to Planner" — Tools group. Mirrors HTML addCurrentRecipeToPlanner
  // (brewlab-desktop.html:13522): make planner tab visible, switch to it,
  // then PlannerPage's effect picks up pendingPlannerAdd and opens
  // AddBrewModal pre-filled with this recipe + today's date.
  const handleAddToPlanner = useCallback(() => {
    if (!recipe) return;
    const displayName = (recipe.beerName?.trim() || recipe.name || '').trim();
    setPendingPlannerAdd({ recipeId, recipeName: displayName });
    setTabVisibility({ planner: true });
    setActiveTab('planner');
  }, [recipe, recipeId, setPendingPlannerAdd, setTabVisibility, setActiveTab]);

  // Carrageenan quick-add (30g/1200L scaled, happoshu trigger)
  const quickAddCarrageenan = useCallback(() => {
    if (!recipe) { pushToast({ message: 'Open a recipe first.', variant: 'info' }); return; }
    const carr = miscLib.find(e => (e.name || '').toLowerCase().includes('carrageenan'));
    if (!carr) { pushToast({ message: 'Carrageenan not found in misc library. Please add it in Libraries > Misc.', variant: 'error' }); return; }
    const existing = ingredients.find(i => i.type === 'misc' && (i.name || '').toLowerCase().includes('carrageenan'));
    if (existing) { pushToast({ message: 'Carrageenan is already in this recipe.', variant: 'info' }); return; }
    const batchL = recipe.batchL || 1200;
    const amt = Math.round((30 / 1200) * batchL * 10) / 10;
    const idx = ingredients.length;
    addIngredient(recipeId, {
      id: `${recipeId}_${idx}`, type: 'misc', name: carr.name, amt, unit: 'g',
      use: carr.use || 'Boil', time: 15, extra: '', ibu: null, pct: null,
      libId: String(carr.id), cost: 0, sortOrder: idx,
    });
    // Classification will auto-sync via the useEffect above
  }, [recipe, miscLib, ingredients, recipeId, addIngredient, pushToast]);

  if (!recipe || !stats) return null;

  return (
    <div style={pageStyle}>
      {/* LEFT COLUMN — ActionStack runs full RecipeTab height. */}
      <ActionStack
        recipeId={recipeId}
        selectedId={selectedId}
        onAddIngredient={t => { setSubstituteMode(false); setAddType(t); }}
        onQuickAddCarrageenan={quickAddCarrageenan}
        onSubstitute={handleSubstitute}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onMashProfile={() => setMashProfileModal(true)}
        // Scale placeholder — File menu's "Scale Recipe..." entry was
        // unwired (closeMenus only). Relocated here under TOOLS; modal
        // not yet ported. Stub alert so the click is acknowledged
        // rather than silently dead.
        onScale={() => pushToast({ message: 'Scale Recipe not yet ported.', variant: 'info' })}
        onGrainPct={() => { if (grains.length === 0) { pushToast({ message: 'No grains in recipe.', variant: 'info' }); return; } setGrainPctModal(true); }}
        onHopIbu={() => { const bh = hops.filter(h => (h.use || '').toLowerCase() !== 'dry hop'); if (bh.length === 0) { pushToast({ message: 'No bittering hops in recipe.', variant: 'info' }); return; } setHopIbuModal(true); }}
        onAddToPlanner={handleAddToPlanner}
      />

      {/* RIGHT COLUMN — pill strip on top, ingredient cards in the middle,
          bottom 3-panel grid below. All three share the column, aligned
          to the recipe explorer on the far left. */}
      <div style={leftColStyle}>
        {/* TOP METRIC STRIP — 5 stats matching the recipe-preview metric
            bar. BATCH is editable (input styled to blend with the value
            text); GRAIN / HOPS / IBU / ABV are computed read-only.
            Process / volume fields moved into the PROCESS panel below. */}
        <div style={topStripStyle}>
          <div style={topStripInnerStyle}>
            <div style={metricItemStyle}>
              <div className="rp-stat-label">Batch</div>
              <div className="rp-stat-val">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
                  <input
                    type="text"
                    value={recipe.batchL || ''}
                    onChange={e => updateRecipe(recipeId, { batchL: parseFloat(e.target.value) || 0 })}
                    style={metricInputStyle}
                  />
                  <span style={metricUnitStyle}>L</span>
                </div>
              </div>
            </div>
            <div style={metricItemStyle}>
              <div className="rp-stat-label">Grain</div>
              <div className="rp-stat-val">
                {stats.totalGrainKg > 0 ? fmtNum(stats.totalGrainKg, { suffix: ' kg' }) : '—'}
              </div>
            </div>
            <div style={metricItemStyle}>
              <div className="rp-stat-label">Hops</div>
              <div className="rp-stat-val">
                {stats.totalHopG > 0 ? fmtNum(stats.totalHopG, { suffix: ' g' }) : '—'}
              </div>
            </div>
            <div style={metricItemStyle}>
              <div className="rp-stat-label">IBU</div>
              <div className="rp-stat-val">
                {stats.ibu > 0 ? fmtNum(stats.ibu) : '—'}
              </div>
            </div>
            <div style={metricItemStyle}>
              <div className="rp-stat-label">ABV</div>
              <div className="rp-stat-val">
                {stats.abv > 0 ? fmtNum(stats.abv, { dp: 1, suffix: '%' }) : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="content" style={contentStyle}>
          <div className="table-wrap" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start' }}>
            {/* Cards container: left-aligned at 16 px (matches metric
                strip and section headers); right-pad ~10 % so the data
                block ends one tab-column short of the beer glass / right
                edge of the row. */}
            <div style={{ padding: '12px 10% 12px 16px', display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
              <IngredientCard recipeId={recipeId} type="grain" label="GRAINS & FERMENTABLES" dotColor="#c8a060" items={grains} grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
              <IngredientCard recipeId={recipeId} type="hop"   label="HOPS"                  dotColor="#5ab568" items={hops}   grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} onOpenSplit={id => setDhSplitIngId(id)} />
              <IngredientCard recipeId={recipeId} type="yeast" label="YEAST"                 dotColor="#c060c0" items={yeast}  grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
              {/* Misc split into Water Chemistry + real Misc per
                  CLAUDE.md "Water Chemistry — Tax Exclusion Rules". Both
                  cards keep type="misc" so they share the
                  bl_recipe_cols_misc column-visibility prefs. Only the
                  first visible section gets extraTopGap. */}
              {miscWaterChem.length > 0 && (
                <IngredientCard recipeId={recipeId} type="misc" label="WATER CHEMISTRY" dotColor="#808080" items={miscWaterChem} grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} extraTopGap />
              )}
              {miscOther.length > 0 && (
                <IngredientCard recipeId={recipeId} type="misc" label="MISC" dotColor="#808080" items={miscOther} grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} extraTopGap={miscWaterChem.length === 0} />
              )}
              {/* Extra additions — free text. Surfaces under its own section
                  on the Prep Sheet when non-empty (header is suppressed if
                  blank, so a recipe with nothing to add doesn't carry a
                  ghost "EXTRA ADDITIONS" heading onto paper). */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ ...extraAdditionsSectionStyle, flex: 1 }}>
                  <div style={extraAdditionsLabelStyle}>EXTRA ADDITIONS</div>
                  <textarea
                    value={recipe.extraAdditions ?? ''}
                    onChange={e => updateRecipe(recipeId, { extraAdditions: e.target.value })}
                    placeholder="e.g. orange peel @ 5 min · coriander @ flameout · vanilla bean during DH"
                    rows={3}
                    style={extraAdditionsInputStyle}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 140, paddingTop: 2 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={extraAdditionsLabelStyle}>TARGET FINISH pH</div>
                    <input
                      type="number"
                      step="0.01"
                      value={recipe.targetFinishPh ?? ''}
                      onChange={e => updateRecipe(recipeId, { targetFinishPh: parseFloat(e.target.value) || undefined })}
                      placeholder="—"
                      style={{ ...extraAdditionsInputStyle, minHeight: 'unset', resize: 'none', width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={extraAdditionsLabelStyle}>PLANNED CARB (vols)</div>
                    <input
                      type="number"
                      step="0.1"
                      value={recipe.plannedCarb ?? ''}
                      onChange={e => updateRecipe(recipeId, { plannedCarb: parseFloat(e.target.value) || undefined })}
                      placeholder="—"
                      style={{ ...extraAdditionsInputStyle, minHeight: 'unset', resize: 'none', width: '100%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM 3-COLUMN PANEL ROW — Style / Totals / Process. The
            former Measured panel was removed (its inputs live on Brew
            Day; AnalysisTab recomputes the derived efficiency). */}
        <div style={bottomRowStyle}>
          <StyleSummaryPanel recipe={recipe} stats={stats} />
          <TotalsPanel
            ibuSg={stats.ibuSg}
            preBoilGravityP={estPreBoilP}
            fgPlato={stats.fgPlato}
            dhGperL={dhGperL}
            wpGperL={wpGperL}
          />
          <ProcessPanel
            boilTime={recipe.boilTime ?? 45}
            bhEff={recipe.bhEff ?? 67.60}
            whirlpoolTemp={recipe.whirlpoolTemp ?? 85}
            expectedLossL={effectiveTrubLossL}
            batchIntoWpL={batchIntoWpL}
            onBoilChange={n => updateRecipe(recipeId, { boilTime: n })}
            onBhEffChange={n => updateRecipe(recipeId, { bhEff: n })}
            onWpTempChange={n => updateRecipe(recipeId, { whirlpoolTemp: n })}
          />
        </div>
      </div>

      {addType && (
        <AddIngredientModal
          recipeId={recipeId}
          type={addType}
          substituteMode={substituteMode}
          onClose={handleAddClose}
        />
      )}

      {/* Edit Ingredient modal — opened on double-click */}
      {editIngId && (() => {
        const editIng = ingredients.find(i => i.id === editIngId);
        if (!editIng) return null;
        return (
          <EditIngredientModal
            recipeId={recipeId}
            ingredient={editIng}
            allIngredients={ingredients}
            onClose={() => setEditIngId(null)}
          />
        );
      })()}

      {/* Grain % modal — editable both columns; Apply writes new amounts */}
      {grainPctModal && (
        <GrainPctModal
          grains={grains}
          onClose={() => setGrainPctModal(false)}
          onApply={updates => {
            const updated = ingredients.map(i => {
              const u = updates.find(u => u.id === i.id);
              return u ? { ...i, amt: u.amt } : i;
            });
            setIngredients(recipeId, updated);
            setGrainPctModal(false);
          }}
        />
      )}

      {/* Right-click context menu on ingredient rows */}
      {ctxMenu && (
        <div
          className="ctx-menu open"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          // Stop mousedown from bubbling so the document-level "close on
          // outside click" listener doesn't kill the menu before the click
          // resolves on the item itself.
          onMouseDown={e => e.stopPropagation()}
        >
          <div
            className="ctx-item"
            onClick={() => { duplicateById(ctxMenu.ingId); setCtxMenu(null); }}
          >⧉ Duplicate</div>
          <div className="ctx-sep" />
          <div
            className="ctx-item danger"
            onClick={() => { deleteById(ctxMenu.ingId); setCtxMenu(null); }}
          >✕ Delete</div>
        </div>
      )}

      {/* Dry-hop split modal */}
      {dhSplitIngId && (() => {
        const splitIng = ingredients.find(i => i.id === dhSplitIngId);
        if (!splitIng) return null;
        return (
          <DhSplitModal
            ing={splitIng}
            onSave={split => updateIngredient(recipeId, splitIng.id, { dhSplit: split })}
            onClose={() => setDhSplitIngId(null)}
          />
        );
      })()}

      {/* Hop IBU modal — editable both columns; Apply writes new amounts */}
      {hopIbuModal && (
        <HopIbuModal
          hops={hops.filter(h => (h.use || '').toLowerCase() !== 'dry hop')}
          batchL={recipe.batchL || 1050}
          ogSg={stats.ogSg}
          method={settings.ibuMethod}
          whirlpoolTemp={recipe.whirlpoolTemp ?? settings.whirlpoolTemp ?? 85}
          mashHopAdj={settings.mashHopAdj}
          onClose={() => setHopIbuModal(false)}
          onApply={updates => {
            const updated = ingredients.map(i => {
              const u = updates.find(u => u.id === i.id);
              return u ? { ...i, amt: u.amt } : i;
            });
            setIngredients(recipeId, updated);
            setHopIbuModal(false);
          }}
        />
      )}

      {/* Mash Profile modal */}
      {mashProfileModal && (
        <MashProfileModal
          recipeId={recipeId}
          recipe={recipe}
          ingredients={ingredients}
          onClose={() => setMashProfileModal(false)}
        />
      )}
    </div>
  );
}

// ── Bottom-row panels ──────────────────────────────────────────────────
//
// Inline because both are small + tightly coupled to the calc shape.
// StyleSummaryPanel is its own file because it carries internal state
// (dropdown open, modal open) and reaches into the store.

function TotalsPanel({
  ibuSg, preBoilGravityP, fgPlato, dhGperL, wpGperL,
}: {
  ibuSg: number;
  preBoilGravityP: number | null;
  fgPlato: number;
  dhGperL: number | null;
  wpGperL: number | null;
}) {
  const ibuSgStr   = ibuSg > 0 ? fmtNum(ibuSg) : '—';
  const preBoilStr = preBoilGravityP != null && preBoilGravityP > 0
    ? fmtNum(preBoilGravityP, { suffix: '°P' }) : '—';
  const fgStr      = fgPlato > 0 ? fmtNum(fgPlato, { suffix: '°P' }) : '—';
  const dhStr      = dhGperL != null && dhGperL > 0 ? fmtNum(dhGperL, { suffix: ' g/L' }) : '—';
  const wpStr      = wpGperL != null && wpGperL > 0 ? fmtNum(wpGperL, { suffix: ' g/L' }) : '—';
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>Totals</div>
      <div style={panelBodyStyle}>
        <PanelRow label="DH G/L"               value={dhStr} />
        <PanelRow label="WP G/L"               value={wpStr} />
        <PanelRow label="IBU/SG ratio"         value={ibuSgStr} />
        <PanelRow label="Est Pre-Boil Gravity" value={preBoilStr} />
        <PanelRow label="Est Final Gravity"    value={fgStr} />
      </div>
    </div>
  );
}

function ProcessPanel({
  boilTime, bhEff, whirlpoolTemp, expectedLossL, batchIntoWpL,
  onBoilChange, onBhEffChange, onWpTempChange,
}: {
  boilTime: number;
  bhEff: number;
  whirlpoolTemp: number;
  expectedLossL: number;
  batchIntoWpL: number;
  onBoilChange: (n: number) => void;
  onBhEffChange: (n: number) => void;
  onWpTempChange: (n: number) => void;
}) {
  const lossStr = expectedLossL > 0 ? fmtNum(expectedLossL, { suffix: ' L' }) : '—';
  const wpStr   = batchIntoWpL > 0 ? fmtNum(batchIntoWpL, { suffix: ' L' }) : '—';
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>Process</div>
      <div style={panelBodyStyle}>
        <EditableRow label="Boil"    value={boilTime}      unit="min" onChange={onBoilChange} />
        <EditableRow label="BH Eff"  value={bhEff}         unit="%"   onChange={onBhEffChange} />
        <EditableRow label="WP Temp" value={whirlpoolTemp} unit="°C"  onChange={onWpTempChange} />
        <PanelRow    label="Expected Loss" value={lossStr} />
        <PanelRow    label="Batch into WP" value={wpStr} />
      </div>
    </div>
  );
}

function EditableRow({
  label, value, unit, onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={rowValueStyle}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={editableInputStyle}
        />
        {' '}{unit}
      </span>
    </div>
  );
}

function PanelRow({ label, value, amber }: { label: string; value: string; amber?: boolean }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={{ ...rowValueStyle, ...(amber ? { color: 'var(--amber)' } : {}) }}>{value}</span>
    </div>
  );
}

// ── Layout styles ──────────────────────────────────────────────────────

// Outer is a flex ROW so ActionStack can run full-height to the right
// of the entire left column (cards + bottom panels stacked).
const pageStyle: React.CSSProperties = {
  flex: 1, display: 'flex', overflow: 'hidden',
};

// Left column owns the cards-area + bottom-panel grid stacked vertically.
// minWidth: 0 lets it shrink past the cards-container's natural width
// when the window is narrow (otherwise the flex child refuses to shrink
// and the right ActionStack column gets pushed off-screen).
const leftColStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

// Cards area scrolls; bottom panels (siblings inside leftColStyle) stay
// pinned at the bottom because they have flexShrink: 0 via bottomRowStyle.
const contentStyle: React.CSSProperties = {
  flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto',
  background: 'var(--panel)',
};

// Top metric strip — 5 stats matching the recipe-preview metric bar.
// BATCH editable; GRAIN/HOPS/IBU/ABV computed read-only. Flat — sits on
// the main bg with thin top/bottom dividers as the only chrome.
const topStripStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const topStripInnerStyle: React.CSSProperties = {
  // Left-aligned at the same content-padding (16 px) as the cards
  // container below — BATCH/GRAIN/HOPS/IBU/ABV labels align with
  // ingredient amount column and section headers.
  padding: '10px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 28,
};

const metricItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
};

const metricInputStyle: React.CSSProperties = {
  width: 44,
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  font: 'inherit',
  padding: 0,
  fontVariantNumeric: 'tabular-nums',
  outline: 'none',
};

const metricUnitStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: 'var(--text-muted)',
  marginLeft: 0,
};

// Extra Additions section — sits below the ingredient cards, before the
// bottom panel row. Plain textarea styled to blend with the muted card
// chrome above; prints to the Prep Sheet under its own section header.
const extraAdditionsSectionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
};

const extraAdditionsLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.2,
  color: 'var(--text-muted)', textTransform: 'uppercase' as const,
};

const extraAdditionsInputStyle: React.CSSProperties = {
  background: 'var(--panel2)',
  border: '1px solid var(--border2)',
  borderRadius: 4,
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  padding: '8px 10px',
  outline: 'none',
  resize: 'vertical',
  minHeight: 60,
  width: '100%',
  boxSizing: 'border-box',
};

const bottomRowStyle: React.CSSProperties = {
  display: 'grid',
  // Style takes ~43 %; Totals / Process share ~57 % evenly. Style stays
  // the largest now that Measured is gone.
  gridTemplateColumns: '1.5fr 1fr 1fr',
  // Uniform wide gap so the three panels read as distinct cards.
  gap: 32,
  // Padding matches the cards container above (16 left, 10 % right) so
  // Style's left edge aligns with the title / amount column, and the
  // bottom row's right edge ends at the same point as the ingredient
  // data block.
  padding: '10px 10% 12px 16px',
  borderTop: '1px solid var(--border)',
  background: 'var(--bg)',
  flexShrink: 0,
};

// ── Panel styles ───────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
};

const panelHeaderStyle: React.CSSProperties = {
  padding: '0 0 6px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase' as const,
};

const panelBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  // Label left, value right with whitespace between — "DH G/L ... 10.48
  // g/L" pattern. Used by TOTALS / PROCESS / MEASURED. StyleSummaryPanel
  // has its own internal rowStyle (grid-based) and isn't affected.
  justifyContent: 'space-between',
  gap: 8,
};

const rowLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  color: 'var(--text-muted)',
  letterSpacing: 0.5,
};

const rowValueStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  color: 'var(--text)',
  fontVariantNumeric: 'tabular-nums',
};

// Inline input for the PROCESS panel's editable rows. Visually blends
// with the read-only PanelRow values — same mono/12px/tabular-nums —
// with a subtle dashed underline as the only affordance hint.
const editableInputStyle: React.CSSProperties = {
  width: 40,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px dashed var(--border2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  fontVariantNumeric: 'tabular-nums',
  padding: '0 2px',
  textAlign: 'right',
  outline: 'none',
};
