/**
 * Folder preview pane — port of brewlab-desktop.html previewFolder()
 * (line 4403). Mounted in the Recipes tab right pane when a folder is
 * single-clicked in the sidebar.
 *
 * Header: 📁 folder name + counts (descendants + direct subfolders) +
 * action buttons (New Subfolder / New Recipe Here — left as TODOs
 * here since the Recipes sidebar's create-folder / create-in-folder
 * flows aren't ported yet).
 *
 * Body: a single table containing subfolder rows (clickable → select
 * folder) followed by recipe rows (single-click → preview recipe,
 * double-click → open). Empty folder shows a hint.
 */

import { useMemo } from 'react';
import { useStore } from '../../store';
import type { Folder, Recipe } from '../../types';

interface Props {
  folder: Folder;
  /** Called when the user single-clicks a subfolder row — caller
   *  promotes that folder to the active preview. */
  onSelectFolder: (folderId: string) => void;
  /** Called when the user single-clicks a recipe row — caller swaps
   *  the preview to that recipe. */
  onPreviewRecipe: (recipeId: string) => void;
  /** Double-click on a recipe row — caller opens the recipe tab. */
  onOpenRecipe: (recipeId: string) => void;
  /** Header "📁 New Subfolder" — creates a folder with parentId =
   *  this folder. Mirrors HTML newSubfolder. */
  onNewSubfolder: (parentId: string) => void;
  /** Header "+ New Recipe Here" — opens the New Recipe modal with the
   *  recipe pre-targeted to this folder. Mirrors HTML newRecipeInFolder. */
  onNewRecipe: (folderId: string) => void;
}

export default function FolderPreview({
  folder, onSelectFolder, onPreviewRecipe, onOpenRecipe,
  onNewSubfolder, onNewRecipe,
}: Props) {
  const allFolders = useStore(s => s.folders);
  const allRecipes = useStore(s => s.recipes);

  const subfolders = useMemo(
    () => allFolders.filter(f => f.parentId === folder.id),
    [allFolders, folder.id],
  );
  const recipes = useMemo(
    () => allRecipes.filter(r => r.folder === folder.id),
    [allRecipes, folder.id],
  );

  // Total recipes in this folder + all descendant subfolders. Mirrors
  // HTML countFolderRecipes (line 4337).
  const totalCount = useMemo(() => {
    const childrenByParent = new Map<string | null, Folder[]>();
    for (const f of allFolders) {
      const list = childrenByParent.get(f.parentId) ?? [];
      list.push(f);
      childrenByParent.set(f.parentId, list);
    }
    const recursive = (id: string): number => {
      let n = allRecipes.filter(r => r.folder === id).length;
      for (const sub of (childrenByParent.get(id) ?? [])) n += recursive(sub.id);
      return n;
    };
    return recursive(folder.id);
  }, [allFolders, allRecipes, folder.id]);

  const subfolderCounts = useMemo<Record<string, number>>(() => {
    // Reuse the same recursion. Computing per-row inline would duplicate work
    // on each render; cache here.
    const childrenByParent = new Map<string | null, Folder[]>();
    for (const f of allFolders) {
      const list = childrenByParent.get(f.parentId) ?? [];
      list.push(f);
      childrenByParent.set(f.parentId, list);
    }
    const recursive = (id: string): number => {
      let n = allRecipes.filter(r => r.folder === id).length;
      for (const sub of (childrenByParent.get(id) ?? [])) n += recursive(sub.id);
      return n;
    };
    const out: Record<string, number> = {};
    for (const sf of subfolders) out[sf.id] = recursive(sf.id);
    return out;
  }, [allFolders, allRecipes, subfolders]);

  return (
    <div className="rp-root">
      <div className="rp-header">
        <div className="fp-name">📁 {folder.name}</div>
        <div className="fp-counts">
          {totalCount} RECIPES · {subfolders.length} SUBFOLDER{subfolders.length === 1 ? '' : 'S'}
        </div>
        <div className="fp-actions">
          <button className="btn sm" onClick={() => onNewSubfolder(folder.id)}>📁 New Subfolder</button>
          <button className="btn sm" onClick={() => onNewRecipe(folder.id)}>＋ New Recipe Here</button>
        </div>
      </div>

      <div className="rp-body fp-body">
        {totalCount === 0 ? (
          <div className="rp-empty">
            Empty folder. Drag recipes here or create new ones.
          </div>
        ) : (
          <table className="fp-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Name</th>
                <th>Style</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {subfolders.map(sf => (
                <tr key={`f-${sf.id}`} className="fp-row" onClick={() => onSelectFolder(sf.id)}>
                  <td>📁</td>
                  <td className="fp-cell-name">{sf.name}</td>
                  <td className="fp-cell-meta">{subfolderCounts[sf.id] ?? 0} items</td>
                  <td></td>
                </tr>
              ))}
              {recipes.map(r => (
                <RecipeRow
                  key={`r-${r.id}`}
                  recipe={r}
                  onPreview={() => onPreviewRecipe(r.id)}
                  onOpen={() => onOpenRecipe(r.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RecipeRow({
  recipe, onPreview, onOpen,
}: {
  recipe: Recipe;
  onPreview: () => void;
  onOpen: () => void;
}) {
  const stars = recipe.rating > 0 ? '★'.repeat(recipe.rating) : '';
  return (
    <tr className="fp-row" onClick={onPreview} onDoubleClick={onOpen}>
      <td>🍺</td>
      <td className="fp-cell-name">
        {recipe.name}
        {recipe.beerName && <span className="fp-cell-beer-name"> {recipe.beerName}</span>}
      </td>
      <td className="fp-cell-meta">{recipe.style || ''}</td>
      <td className="fp-cell-stars">{stars}</td>
    </tr>
  );
}
