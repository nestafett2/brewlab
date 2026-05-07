import { useMemo, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { calcOG, calcFG, calcABV, calcTotalIBU, calcEBC, calcGrainPct, calcClassification, sgToPlato } from '../../lib/calculations';
import type { Ingredient, IngredientType } from '../../types';
import IngredientCard from './IngredientCard';
import StatsSidebar from './StatsSidebar';
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
  // Wiring for the sidebar's "Add to Planner" button — mirrors HTML
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
  const misc = useMemo(() => ingredients.filter(i => i.type === 'misc'), [ingredients]);

  // === All calculations — recompute live when ingredients/recipe/settings change ===
  const stats = useMemo(() => {
    if (!recipe) return null;
    const batchL = recipe.batchL || 0;
    const empty = {
      ogSg: 1, ogPlato: 0, fgSg: 1, fgPlato: 0,
      abv: 0, ibu: 0, ibuSg: 0, ebc: 0,
      grainPcts: new Map<string, number>(),
      perHop: new Map<string, number>(),
      totalGrainKg: 0, totalHopG: 0, totalCost: 0,
    };
    if (batchL <= 0) return empty;

    // Read BH efficiency and WP temp from recipe (set via meta bar pills)
    const bhEff = recipe.bhEff || 67.60;
    const wpTemp = recipe.whirlpoolTemp ?? settings.whirlpoolTemp ?? 85;

    const ogSg = calcOG(grains, maltLib, batchL, bhEff);
    const ogPlato = ogSg > 1 ? sgToPlato(ogSg) : 0;

    const yeastIng = ingredients.find(i => i.type === 'yeast');
    let atten = 0;
    if (yeastIng) {
      atten = parseFloat(yeastIng.extra || '0');
      if (!atten) {
        const libY = yeastLib.find(y => y.id === yeastIng.libId || y.name === yeastIng.name);
        atten = libY?.atten ?? 75;
      }
    }
    if (!atten) atten = 75;
    const fgSg = calcFG(ogSg, atten);
    const fgPlato = fgSg > 1 ? sgToPlato(fgSg) : 0;
    const abv = calcABV(ogSg, fgSg);

    const { total: ibu, perHop } = calcTotalIBU({
      method: settings.ibuMethod, hops: ingredients, hopLib, batchL, ogSg,
      whirlpoolTemp: wpTemp, mashHopAdj: settings.mashHopAdj,
      leafHopAdj: settings.leafHopAdj, largeBatchUtil: settings.largeBatchUtil,
    });
    const ibuSg = ogSg > 1 ? ibu / ((ogSg - 1) * 1000) : 0;
    const ebc = calcEBC(ingredients, maltLib, batchL);
    const grainPcts = calcGrainPct(ingredients);
    const totalGrainKg = grains.reduce((s, g) => s + (g.unit === 'g' ? g.amt * 0.001 : g.amt), 0);
    const totalHopG = hops.reduce((s, h) => s + (h.unit === 'kg' ? h.amt * 1000 : h.amt), 0);

    // Cost: check ingredient cost first, then look up library price.
    // Water rows have no library — skip the lookup, use any explicit cost.
    const totalCost = ingredients.reduce((s, ing) => {
      if (ing.cost > 0) return s + ing.cost;
      if (ing.type === 'water') return s;
      const dataKey = { grain: maltLib, hop: hopLib, yeast: yeastLib, misc: miscLib }[ing.type] as any[];
      const lib = (dataKey || []).find((e: any) => (e.name || '').toLowerCase() === (ing.name || '').toLowerCase() || e.id === ing.libId);
      if (!lib?.price) return s;
      const amtKg = ing.unit === 'g' ? ing.amt * 0.001 : ing.amt;
      return s + (ing.type === 'yeast' ? lib.price : lib.price * amtKg);
    }, 0);

    return { ogSg, ogPlato, fgSg, fgPlato, abv, ibu, ibuSg, ebc, grainPcts, perHop, totalGrainKg, totalHopG, totalCost };
  }, [recipe, ingredients, grains, hops, maltLib, hopLib, yeastLib, miscLib, settings]);

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

  // === Sidebar action handlers (match HTML app behavior exactly) ===

  // Click row toggles selection (HTML: selectRow)
  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  // Double-click row opens edit modal (HTML: openIngEdit)
  const handleDoubleClick = useCallback((id: string) => {
    setEditIngId(id);
  }, []);

  // Delete by id (HTML: deleteSelected). Used by sidebar Delete and the
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
  // Used by sidebar Duplicate and the ingredient row right-click menu.
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
    if (selectedId) deleteById(selectedId);
  }, [selectedId, deleteById]);

  const handleDuplicate = useCallback(() => {
    if (selectedId) duplicateById(selectedId);
  }, [selectedId, duplicateById]);

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
    if (!selectedId) { alert('Select an ingredient first.'); return; }
    const ing = ingredients.find(i => i.id === selectedId);
    if (!ing) return;
    setSubstituteMode(true);
    setAddType(ing.type);
  }, [selectedId, ingredients]);

  // When add modal closes in substitute mode, swap the ingredient
  const handleAddClose = useCallback((newIng?: Ingredient) => {
    if (substituteMode && newIng && selectedId) {
      const updated = ingredients.map(i => i.id === selectedId ? { ...newIng, id: selectedId, sortOrder: i.sortOrder } : i);
      setIngredients(recipeId, updated);
    }
    setAddType(null);
    setSubstituteMode(false);
  }, [substituteMode, selectedId, ingredients, recipeId, setIngredients]);

  // "Add to Planner" — used by both the sidebar Actions button and the
  // bottom-bar button. Mirrors HTML addCurrentRecipeToPlanner
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
    if (!recipe) { alert('Open a recipe first.'); return; }
    const carr = miscLib.find(e => (e.name || '').toLowerCase().includes('carrageenan'));
    if (!carr) { alert('Carrageenan not found in misc library. Please add it in Libraries > Misc.'); return; }
    const existing = ingredients.find(i => i.type === 'misc' && (i.name || '').toLowerCase().includes('carrageenan'));
    if (existing) { alert('Carrageenan is already in this recipe.'); return; }
    const batchL = recipe.batchL || 1200;
    const amt = Math.round((30 / 1200) * batchL * 10) / 10;
    const idx = ingredients.length;
    addIngredient(recipeId, {
      id: `${recipeId}_${idx}`, type: 'misc', name: carr.name, amt, unit: 'g',
      use: carr.use || 'Boil', time: 15, extra: '', ibu: null, pct: null,
      libId: carr.id, cost: 0, sortOrder: idx,
    });
    // Classification will auto-sync via the useEffect above
  }, [recipe, miscLib, ingredients, recipeId, addIngredient]);

  if (!recipe || !stats) return null;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <StatsSidebar
        stats={stats}
        recipe={recipe}
        selectedId={selectedId}
        onAddIngredient={t => { setSubstituteMode(false); setAddType(t); }}
        onQuickAddCarrageenan={quickAddCarrageenan}
        onSubstitute={handleSubstitute}
        onGrainPct={() => { if (grains.length === 0) { alert('No grains in recipe.'); return; } setGrainPctModal(true); }}
        onHopIbu={() => { const bh = hops.filter(h => (h.use || '').toLowerCase() !== 'dry hop'); if (bh.length === 0) { alert('No bittering hops in recipe.'); return; } setHopIbuModal(true); }}
        onMashProfile={() => setMashProfileModal(true)}
        onAddToPlanner={handleAddToPlanner}
      />

      <div className="content">
        <div className="table-wrap" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 1000 }}>
            <IngredientCard recipeId={recipeId} type="grain" label="GRAINS & FERMENTABLES" dotColor="#c8a060" items={grains} grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
            <IngredientCard recipeId={recipeId} type="hop" label="HOPS" dotColor="#5ab568" items={hops} grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} onOpenSplit={id => setDhSplitIngId(id)} />
            <IngredientCard recipeId={recipeId} type="yeast" label="YEAST" dotColor="#c060c0" items={yeast} grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
            <IngredientCard recipeId={recipeId} type="misc" label="MISC" dotColor="#808080" items={misc} grainPcts={stats.grainPcts} perHopIbu={stats.perHop} selectedId={selectedId} onSelect={handleSelect} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
          </div>
        </div>

        <div className="bottom-bar">
          <div className="totals-row">
            <div className="total-item"><label>Grains</label><span className="tv amber">{stats.totalGrainKg.toFixed(2)} kg</span></div>
            <div className="total-item"><label>Hops</label><span className="tv">{stats.totalHopG.toFixed(0)} g</span></div>
            <div className="total-item"><label>Total Cost</label><span className="tv amber">&yen;{Math.round(stats.totalCost).toLocaleString()}</span></div>
          </div>
          <button className="btn sm" onClick={handleAddToPlanner} title="Schedule this recipe in the planner">📅 Add to Planner</button>
          <button className="btn sm danger" onClick={handleDelete}>✕ Delete</button>
          <button className="btn sm" onClick={handleDuplicate}>⧉ Dup</button>
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

      {/* Dry-hop split modal — recipe-time per-slot grams design.
          Reactively reads ing.dhSplit; updates persist via updateIngredient. */}
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

      {/* Mash Profile modal — opened from sidebar 🌡 button. Per-recipe
          blob persisted to bl_mash_<recipeId>; live calc reuses
          calcBrewDayTargets so mash/sparge/strike track the recipe's
          ingredients + active equipment profile in lockstep. */}
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
