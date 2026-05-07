/**
 * New Brew modal — opens for any of the three "+ New Brew" split-button
 * actions on the Brew History tab.
 *
 * Port of brewlab-desktop.html:3751–3774 (newBatchModal markup) +
 * 5402–5483 (openNewBatchModal / confirmNewBatch). Diverges from HTML in
 * three ways:
 *   • Three actions instead of one ('none' / 'minor' / 'major'),
 *     selected by the caller via the `action` prop. HTML had only the
 *     batch-stamp flow — the version-bump variants are new.
 *   • Optional Note field for 'minor' / 'major' (not the plain '+ New
 *     Brew') — saves to recipe.versionNote on the new recipe.
 *   • Summary panel computes the new version + brewNumber up-front so
 *     the user sees what the modal is about to create. The
 *     latest-version lookup follows the addendum: 'minor' / 'major'
 *     from a non-latest source jumps to the next major from latest.
 *
 * Confirmation routes through the store's createNextRecipeFromCurrent
 * action — that's where the actual recipe creation, ingredient deep-copy,
 * water-chem inheritance, and per-brew blob clearing live.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';

export type NewBrewAction = 'none' | 'minor' | 'major';

interface Props {
  recipeId: string;
  action: NewBrewAction;
  onClose: () => void;
  onCreated: (newRecipeId: string) => void;
}

const TITLES: Record<NewBrewAction, string> = {
  none:  'START NEW BREW',
  minor: 'NEW VERSION — Amounts Changed',
  major: 'NEW VERSION — Ingredients Changed',
};

const SUBMIT_LABELS: Record<NewBrewAction, string> = {
  none:  'Archive & Start New Brew',
  minor: 'Save as New Version',
  major: 'Save as New Version',
};

const INTRO: Record<NewBrewAction, string> = {
  none:
    'This will stamp the current recipe as a completed brew, then create ' +
    'a new entry with all ingredients copied and a fresh Brew Day, ' +
    'Fermentation, and Packaging. Version stays the same.',
  minor:
    'Bump the version (e.g. 1.0 → 1.1) and start a new brew. Use this ' +
    'when you tweaked an amount or two. Ingredients copy over; brew day, ' +
    'fermentation and packaging start fresh.',
  major:
    'Bump to the next whole version (e.g. 1.7 → 2.0) and start a new ' +
    'brew. Use this when the ingredient list itself changed. Ingredients ' +
    'copy over; brew day, fermentation and packaging start fresh.',
};

// Local helpers — deliberately duplicated from store so this component is
// self-contained for preview math. The store's parseVersion is the
// authoritative version when the new recipe is actually created.
function parseVer(v: string | undefined): { major: number; minor: number } {
  const s = String(v ?? '').replace(/^v/i, '').trim();
  const parts = s.split('.');
  const major = parseInt(parts[0] ?? '', 10);
  const minor = parseInt(parts[1] ?? '', 10);
  return {
    major: isFinite(major) ? major : 1,
    minor: isFinite(minor) ? minor : 0,
  };
}
function fmtVer(v: { major: number; minor: number }): string {
  return `${v.major}.${v.minor}`;
}

export default function NewBrewModal({ recipeId, action, onClose, onCreated }: Props) {
  const recipes = useStore(s => s.recipes);
  const createNextRecipeFromCurrent = useStore(s => s.createNextRecipeFromCurrent);

  const recipe = recipes.find(r => r.id === recipeId);
  const lineageId = recipe?.lineageId || recipe?.id;
  const lineageRecipes = useMemo(
    () => recipes.filter(r => (r.lineageId || r.id) === lineageId),
    [recipes, lineageId],
  );

  // Compute the preview version using the same rules the store will apply
  // (kept symmetric so the modal's preview matches the resulting recipe).
  const newVersionPreview = useMemo(() => {
    if (!recipe) return '—';
    const sourceVer = parseVer(recipe.version);
    if (action === 'none') return fmtVer(sourceVer);
    const parsedAll = lineageRecipes.map(r => parseVer(r.version));
    parsedAll.sort((a, b) => b.major - a.major || b.minor - a.minor);
    const latest = parsedAll[0] ?? { major: 1, minor: 0 };
    const sourceIsLatest = sourceVer.major === latest.major && sourceVer.minor === latest.minor;
    if (!sourceIsLatest) {
      return fmtVer({ major: latest.major + 1, minor: 0 });
    }
    if (action === 'minor') {
      return fmtVer({ major: latest.major, minor: latest.minor + 1 });
    }
    return fmtVer({ major: latest.major + 1, minor: 0 });
  }, [recipe, action, lineageRecipes]);

  // Per-lineage brewNumber preview: max + 1 (treating undefined as 0).
  const newBrewNumberPreview = useMemo(() => {
    const max = lineageRecipes.reduce((m, r) =>
      typeof r.brewNumber === 'number' && r.brewNumber > m ? r.brewNumber : m,
      0,
    );
    return max + 1;
  }, [lineageRecipes]);

  const [name, setName] = useState(recipe?.beerName || recipe?.name || '');
  const [note, setNote] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => { nameRef.current?.select(); nameRef.current?.focus(); }, 60);
  }, []);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!recipe) return null;

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedNote = note.trim();
    const newId = createNextRecipeFromCurrent(recipeId, {
      versionBump: action,
      note: action === 'none' ? undefined : (trimmedNote || undefined),
      beerName: trimmedName || undefined,
    });
    if (!newId) return;
    onCreated(newId);
    onClose();
  };

  // Summary box values pulled live from the source recipe.
  const sourceVersion = recipe.version || '1.0';

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ width: 480, maxWidth: '96vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{TITLES[action]}</span>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', lineHeight: 1.6 }}>
            {INTRO[action]}
          </div>

          {/* Summary box — current state + computed next values */}
          <div style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              <SummaryCell label="Recipe"          value={recipe.name || recipe.beerName || '—'} />
              <SummaryCell label="Source Version"  value={`v${sourceVersion}`} />
              <SummaryCell label="Source Brew #"   value={recipe.brewNumber ? `#${recipe.brewNumber}` : '—'} />
              <SummaryCell label="Source Brew Date" value={recipe.brewDate || '—'} />
            </div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)',
              borderTop: '1px solid var(--border)', paddingTop: 8,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
            }}>
              <SummaryCell label="New Version" value={`v${newVersionPreview}`} amber />
              <SummaryCell label="New Brew #"  value={`#${newBrewNumberPreview}`} amber />
            </div>
          </div>

          <div className="form-group">
            <label>
              New Beer Name{' '}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                (Brew #{newBrewNumberPreview})
              </span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="e.g. Hop Viking"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Optional note for version-bump variants */}
          {action !== 'none' && (
            <div className="form-group">
              <label>
                Version Note{' '}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                  (optional — saves to versionNote)
                </span>
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                placeholder={action === 'minor' ? 'e.g. dropped Citra to 200g' : 'e.g. swapped Mosaic for Galaxy'}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>{SUBMIT_LABELS[action]}</button>
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ label, value, amber }: { label: string; value: string; amber?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: amber ? 'var(--amber)' : 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
