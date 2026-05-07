/**
 * The single shared classification picker. Reads `recipe.classification`
 * and writes ONLY through `setRecipeClassification` — the canonical
 * Beer/Happoshu setter that mirrors HTML's `syncClassification` (line 12120).
 *
 * Mounted in two places: the Recipe meta bar and the Tax tab. Both are
 * controlled by the same recipe field, so editing one updates the other.
 *
 * Optional `onAuto` button kicks off applyAutoClassification (HTML
 * `applyAutoClassification`, line 12106) — the user can override the auto
 * value but the action remains the only writer.
 */

import { useStore } from '../../store';
import type { Classification } from '../../types';

interface Props {
  recipeId: string;
  /** Show the inline "Auto" button. Default true on the Recipe tab, false on Tax. */
  showAuto?: boolean;
  /** Optional CSS class hook for layout. */
  className?: string;
}

export default function TaxClassificationSelect({
  recipeId,
  showAuto = true,
  className,
}: Props) {
  const recipe = useStore(s => s.recipes.find(r => r.id === recipeId));
  const setRecipeClassification = useStore(s => s.setRecipeClassification);
  const autoClassifyRecipe      = useStore(s => s.autoClassifyRecipe);

  if (!recipe) return null;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        value={recipe.classification || 'Beer'}
        onChange={e => setRecipeClassification(recipeId, e.target.value as Classification)}
        style={{
          padding: '6px 10px',
          background: 'var(--panel2)',
          color: 'var(--text)',
          border: '1px solid var(--border2)',
          borderRadius: 6,
          fontFamily: 'var(--sans)',
          fontSize: 13,
        }}
      >
        <option value="Beer">Beer</option>
        <option value="Happoshu">Happoshu</option>
      </select>
      {showAuto && (
        <button
          type="button"
          className="btn sm"
          onClick={() => autoClassifyRecipe(recipeId)}
          title="Auto-classify from grain ratio + happoshu_trigger ingredients"
        >
          Auto
        </button>
      )}
    </div>
  );
}
