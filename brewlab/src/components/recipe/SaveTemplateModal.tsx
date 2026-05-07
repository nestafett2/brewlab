/**
 * Save Template modal — port of brewlab-desktop.html lines 3697–3718
 * (markup) + 5119–5150 (saveRecipeAsTemplate / confirmSaveTemplate).
 *
 * Snapshots the active recipe's design fields + ingredients into a new
 * template. Templates are local-only (bl_templates isn't synced) — see
 * the comment on saveRecipeAsTemplate in store/index.ts.
 *
 * HTML's amber-flash on the sidebar "Save as Template" button isn't
 * reproduced because the React StatsSidebar doesn't carry that button
 * (the sidebar Actions section was trimmed in a recent task).
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';

interface Props {
  recipeId: string;
  onClose: () => void;
}

export default function SaveTemplateModal({ recipeId, onClose }: Props) {
  const recipe = useStore(s => s.recipes.find(r => r.id === recipeId));
  const saveRecipeAsTemplate = useStore(s => s.saveRecipeAsTemplate);

  const [name, setName] = useState(recipe?.name || recipe?.beerName || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => { inputRef.current?.select(); inputRef.current?.focus(); }, 60);
  }, []);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    const id = saveRecipeAsTemplate(recipeId, trimmed);
    if (!id) { inputRef.current?.focus(); return; }
    onClose();
  };

  if (!recipe) return null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ width: 420, maxWidth: '96vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">SAVE AS TEMPLATE</span>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Template Name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Saves the current recipe's ingredients, style, and batch settings as a reusable template. The template is a snapshot — future recipe changes won't affect it.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save Template</button>
        </div>
      </div>
    </div>
  );
}
