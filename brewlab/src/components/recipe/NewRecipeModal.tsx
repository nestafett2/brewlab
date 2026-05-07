/**
 * New Recipe modal — port of brewlab-desktop.html lines 3631–3695 (markup)
 * + 5049–5116 (renderTemplateList / selectTemplate / deleteTemplate /
 * confirmFromTemplate) + the existing default-recipe creation that the
 * React app previously ran inline from the "+ New" button.
 *
 * Two tabs:
 *   • Blank Recipe — beer/label name + style picker. Same defaults the
 *     previous inline createNewRecipe() applied (batchL=1050, bhEff=67.60,
 *     boilTime=45, whirlpoolTemp=85, version='1.0', classification='Beer').
 *   • From Template — recipe name (editable, seeded from the selected
 *     template) + scrollable template list with delete-✕ per row. Confirm
 *     button is disabled until a template is selected and the name is
 *     non-empty.
 *
 * On confirm:
 *   • Blank: addRecipe() then openRecipe(newId).
 *   • From Template: createRecipeFromTemplate() then openRecipe(newId).
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { newRecipeId, today } from '../../lib/utils';
import type { Recipe } from '../../types';
import StylePickerDropdown from './StylePickerDropdown';

interface Props {
  onClose: () => void;
  onCreated: (recipeId: string) => void;
  /** Pre-target the recipe to a specific folder. Set when the modal is
   *  opened from FolderPreview's "+ New Recipe Here". When null/absent
   *  the recipe lands in Unfiled — diverges from HTML which falls back
   *  to folderList[0] (a quirk that puts no-context creates into a
   *  random folder). */
  defaultFolderId?: string | null;
}

type ModalTab = 'new' | 'tpl';

export default function NewRecipeModal({ onClose, onCreated, defaultFolderId }: Props) {
  const recipes = useStore(s => s.recipes);
  const addRecipe = useStore(s => s.addRecipe);
  const templates = useStore(s => s.templates);
  const deleteTemplate = useStore(s => s.deleteTemplate);
  const createRecipeFromTemplate = useStore(s => s.createRecipeFromTemplate);

  const [tab, setTab] = useState<ModalTab>('new');

  // Blank tab state
  const [name, setName] = useState('');
  const [styleKey, setStyleKey] = useState('');
  const [styleLabel, setStyleLabel] = useState('— Choose Later —');
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // From Template tab state
  const [tplId, setTplId] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const tplNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      if (tab === 'new') nameRef.current?.focus();
      else tplNameRef.current?.focus();
    }, 60);
  }, [tab]);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Blank-tab submit — same defaults as the previous inline createNewRecipe.
  const confirmBlank = () => {
    const id = newRecipeId(recipes.map(r => r.id));
    const trimmed = name.trim();
    const r: Recipe = {
      id,
      lineageId: id,
      name: '',
      beerName: trimmed || 'New Recipe',
      style: styleLabel === '— Choose Later —' ? '' : styleLabel,
      styleKey,
      folder: defaultFolderId || '',
      batchL: 1050,
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
      bhEff: 67.60,
      boilTime: 45,
      whirlpoolTemp: 85,
      bdFv: '',
      notes: '',
      archivedAt: null,
    };
    addRecipe(r);
    onCreated(id);
    onClose();
  };

  // Template-tab submit
  const confirmTpl = () => {
    if (!tplId) return;
    const trimmed = tplName.trim();
    if (!trimmed) { tplNameRef.current?.focus(); return; }
    const newId = createRecipeFromTemplate(tplId, {
      name: trimmed,
      folderId: defaultFolderId || undefined,
    });
    if (!newId) return;
    onCreated(newId);
    onClose();
  };

  const selectTpl = (id: string, defaultName: string) => {
    setTplId(id);
    if (!tplName.trim()) setTplName(defaultName);
  };

  const handleDeleteTpl = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this template?')) return;
    deleteTemplate(id);
    if (tplId === id) {
      setTplId(null);
      setTplName('');
    }
  };

  const tplConfirmDisabled = !tplId || !tplName.trim();

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ width: 520, maxWidth: '96vw', overflow: 'visible' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">NEW RECIPE</span>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Tab bar */}
        <div style={tabBarStyle}>
          <div
            onClick={() => setTab('new')}
            style={tab === 'new' ? tabActiveStyle : tabInactiveStyle}
          >Blank Recipe</div>
          <div
            onClick={() => setTab('tpl')}
            style={tab === 'tpl' ? tabActiveStyle : tabInactiveStyle}
          >From Template</div>
        </div>

        {/* Blank Recipe panel */}
        {tab === 'new' && (
          <>
            <div className="modal-body" style={{ padding: '16px 16px 8px', overflow: 'visible' }}>
              <div className="form-group">
                <label>Beer / Label Name</label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmBlank(); }}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div className="form-group" style={{ position: 'relative' }}>
                <label>Style</label>
                <div
                  onClick={() => setStylePickerOpen(o => !o)}
                  style={styleBtnStyle}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>
                    {styleLabel}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>▼</span>
                </div>
                {stylePickerOpen && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 3000, marginTop: 2 }}>
                    <StylePickerDropdown
                      selectedKey={styleKey}
                      includeChooseLater
                      onSelect={(key, label) => {
                        setStyleKey(key);
                        setStyleLabel(label || '— Choose Later —');
                      }}
                      onClose={() => setStylePickerOpen(false)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={confirmBlank}>Create Recipe</button>
            </div>
          </>
        )}

        {/* From Template panel */}
        {tab === 'tpl' && (
          <>
            <div className="modal-body" style={{ padding: '12px 16px 8px', overflow: 'visible' }}>
              <div className="form-group">
                <label>Recipe Name <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>(editable)</span></label>
                <input
                  ref={tplNameRef}
                  type="text"
                  value={tplName}
                  onChange={e => setTplName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmTpl(); }}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={tplListLabelStyle}>Choose Template</label>
                <div style={tplListStyle}>
                  {templates.length === 0 ? (
                    <div style={tplEmptyStyle}>
                      No templates saved yet.<br />
                      Open a recipe and choose<br />
                      <span style={{ color: 'var(--amber)' }}>☆ Save as Template</span> from the File menu.
                    </div>
                  ) : (
                    templates.map(t => {
                      const ingCount = (t.ingredients || []).length;
                      const isSelected = tplId === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => selectTpl(t.id, t.name)}
                          style={{
                            ...tplRowStyle,
                            background: isSelected ? 'rgba(180,130,60,0.12)' : '',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={tplRowNameStyle}>{t.name}</div>
                            <div style={tplRowMetaStyle}>
                              {ingCount} ingredient{ingCount !== 1 ? 's' : ''}
                              {t.styleKey && <span style={{ color: 'var(--amber)', fontSize: 9, marginLeft: 6 }}>{t.styleKey}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={e => handleDeleteTpl(t.id, e)}
                            title="Delete template"
                            style={tplDeleteBtnStyle}
                          >✕</button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button
                className="btn primary"
                onClick={confirmTpl}
                disabled={tplConfirmDisabled}
                style={tplConfirmDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >Create from Template</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  background: 'var(--panel2)',
};

const tabBaseStyle: React.CSSProperties = {
  padding: '8px 18px',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const tabActiveStyle: React.CSSProperties = {
  ...tabBaseStyle,
  borderBottom: '2px solid var(--amber)',
  color: 'var(--amber)',
};

const tabInactiveStyle: React.CSSProperties = {
  ...tabBaseStyle,
  borderBottom: '2px solid transparent',
  color: 'var(--text-muted)',
};

const styleBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 8px',
  background: 'var(--panel2)',
  border: '1px solid var(--border2)',
  cursor: 'pointer',
};

const tplListLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 6,
};

const tplListStyle: React.CSSProperties = {
  maxHeight: 280,
  overflowY: 'auto',
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'var(--panel2)',
};

const tplEmptyStyle: React.CSSProperties = {
  padding: '20px 14px',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  color: 'var(--text-muted)',
  textAlign: 'center',
  lineHeight: 1.8,
};

const tplRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '9px 12px',
  borderBottom: '1px solid var(--border)',
  cursor: 'pointer',
  gap: 8,
};

const tplRowNameStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  color: 'var(--text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const tplRowMetaStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9,
  color: 'var(--text-muted)',
  marginTop: 2,
};

const tplDeleteBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 4px',
  flexShrink: 0,
};
