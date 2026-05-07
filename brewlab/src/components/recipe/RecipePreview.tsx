/**
 * Recipe preview pane — port of brewlab-desktop.html previewRecipe()
 * (line 5788). Mounted in the Recipes tab right pane when a recipe is
 * single-clicked in the sidebar.
 *
 * Read-only summary: header (name + beerName + style/classification/
 * date + rating stars + brew-again flag + Open Recipe → CTA), four
 * stat pills (batch / grain / hops / IBU), then ingredient sections
 * grouped by type. Hops show extra detail (use · time, IBU contrib).
 *
 * Reads ingredients from the lazy-load store cache; if uncached the
 * cache primes asynchronously via getIngredients (same pattern as
 * RecipeTab).
 */

import { useEffect, useMemo } from 'react';
import { useStore } from '../../store';
import type { Recipe, Ingredient } from '../../types';
import { fmtAmt } from '../../lib/utils';

interface Props {
  recipe: Recipe;
  onOpen: () => void;
}

const BREW_AGAIN_COLOR: Record<string, string> = {
  no:    'var(--red)',
  maybe: 'var(--amber)',
  yes:   'var(--green)',
};
const BREW_AGAIN_LABEL: Record<string, string> = {
  no:    "✗ Don't make again",
  maybe: '↻ Make again with tweaks',
  yes:   '✓ Make again as-is',
};

export default function RecipePreview({ recipe, onOpen }: Props) {
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const loadIngredients     = useStore(s => s.loadIngredients);

  // Lazy-prime ingredient cache for this recipe — same pattern as
  // RecipeTab. Subsequent renders read directly from the cache.
  useEffect(() => { loadIngredients(recipe.id); }, [recipe.id, loadIngredients]);

  const ingredients = ingredientsByRecipe[recipe.id] ?? [];

  const grouped = useMemo(() => {
    const grains: Ingredient[] = [];
    const hops: Ingredient[]   = [];
    const yeast: Ingredient[]  = [];
    const misc: Ingredient[]   = [];
    for (const i of ingredients) {
      if      (i.type === 'grain') grains.push(i);
      else if (i.type === 'hop')   hops.push(i);
      else if (i.type === 'yeast') yeast.push(i);
      else if (i.type === 'misc')  misc.push(i);
      // 'water' rows intentionally omitted — water adjustments aren't
      // shown in the recipe summary; matches HTML.
    }
    const totalGrainKg = grains.reduce((s, i) => s + (i.unit === 'kg' ? i.amt : i.amt / 1000), 0);
    const totalHopG    = hops.reduce((s, i) => s + (i.unit === 'g' ? i.amt : i.amt * 1000), 0);
    const totalIBU     = hops.reduce((s, i) => s + (i.ibu || 0), 0);
    return { grains, hops, yeast, misc, totalGrainKg, totalHopG, totalIBU };
  }, [ingredients]);

  const headerMeta = [recipe.style, recipe.classification, recipe.brewDate]
    .filter(Boolean).join(' · ');

  return (
    <div className="rp-root">
      <div className="rp-header">
        <div className="rp-header-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rp-name">{recipe.name}</div>
            {recipe.beerName && <div className="rp-beer-name">{recipe.beerName}</div>}
            {headerMeta && <div className="rp-meta">{headerMeta}</div>}
            <div className="rp-stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < (recipe.rating || 0) ? 'rp-star on' : 'rp-star'}>★</span>
              ))}
            </div>
            {recipe.brewAgain && BREW_AGAIN_LABEL[recipe.brewAgain] && (
              <div
                className="rp-brew-again"
                style={{ color: BREW_AGAIN_COLOR[recipe.brewAgain] }}
              >
                {BREW_AGAIN_LABEL[recipe.brewAgain]}
              </div>
            )}
          </div>
          <button className="btn primary" style={{ flexShrink: 0 }} onClick={onOpen}>
            Open Recipe →
          </button>
        </div>
        <div className="rp-stats">
          {recipe.batchL > 0 && <Stat label="Batch" value={`${recipe.batchL} L`} />}
          {grouped.totalGrainKg > 0 && <Stat label="Grain" value={`${grouped.totalGrainKg.toFixed(1)} kg`} />}
          {grouped.totalHopG > 0 && <Stat label="Hops" value={`${grouped.totalHopG.toFixed(0)} g`} />}
          {grouped.totalIBU > 0 && <Stat label="IBU" value={grouped.totalIBU.toFixed(1)} />}
        </div>
      </div>

      <div className="rp-body">
        {ingredients.length === 0 && (
          <div className="rp-empty">No ingredients saved yet — open recipe to add.</div>
        )}
        {grouped.grains.length > 0 && <Section label="Grains & Fermentables" items={grouped.grains} />}
        {grouped.hops.length > 0 && <HopSection items={grouped.hops} />}
        {grouped.yeast.length > 0 && <Section label="Yeast" items={grouped.yeast} />}
        {grouped.misc.length > 0 && <Section label="Misc" items={grouped.misc} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rp-stat">
      <div className="rp-stat-label">{label}</div>
      <div className="rp-stat-val">{value}</div>
    </div>
  );
}

function Section({ label, items }: { label: string; items: Ingredient[] }) {
  return (
    <div className="rp-section">
      <div className="rp-section-title">{label}</div>
      {items.map(i => (
        <div key={i.id} className="rp-row">
          <span className="rp-row-name">{i.name}</span>
          <span className="rp-row-amt">{fmtAmt(i.amt, i.unit)} {i.unit}</span>
        </div>
      ))}
    </div>
  );
}

function HopSection({ items }: { items: Ingredient[] }) {
  return (
    <div className="rp-section">
      <div className="rp-section-title">Hops</div>
      {items.map(i => {
        const timeStr = i.time ? ` · ${i.time}m` : '';
        const useDetail = (i.use || '') + timeStr;
        return (
          <div key={i.id} className="rp-row">
            <span className="rp-row-name">
              {i.name}
              {i.ibu ? <span className="rp-row-ibu"> {i.ibu} IBU</span> : null}
            </span>
            <div className="rp-row-right">
              {useDetail && <span className="rp-row-use">{useDetail}</span>}
              <span className="rp-row-amt">{fmtAmt(i.amt, i.unit)} {i.unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
