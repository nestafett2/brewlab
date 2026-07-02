/**
 * Floating recipe-preview popover. Wraps RecipePreview in a fixed-position
 * overlay anchored to the right edge of the recipe-browser sidebar.
 *
 * Opened by single-click on a sidebar recipe row. Stays on the current
 * tab — no navigation. Outside-click / Escape / re-click on same row /
 * Open-Recipe button all dismiss the popover; orchestration lives in
 * Desktop.tsx.
 *
 * Reuses RecipePreview's full content (title, stats, grouped ingredient
 * lists with the Water Chemistry / Misc split, "Open Recipe →" button)
 * so the popover and the legacy embedded right-pane preview stay
 * visually identical.
 */

import RecipePreview from './RecipePreview';
import type { Recipe } from '../../types';

interface Props {
  recipe: Recipe;
  pos: { left: number; top: number };
  onOpen: () => void;
}

export default function RecipePreviewPopover({ recipe, pos, onOpen }: Props) {
  return (
    <div
      data-recipe-popover
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 660,
        maxWidth: 'calc(100vw - 260px)',
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        background: 'var(--panel)',
        border: '1px solid var(--border2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        zIndex: 200,
        borderRadius: 4,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <RecipePreview recipe={recipe} onOpen={onOpen} />
    </div>
  );
}
