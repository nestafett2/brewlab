/**
 * Settings → Equipment Profiles — port of HTML #settings-equip-profiles
 * (line 2671) + the editor modal (line 2685) + render/edit JS (line 20230).
 *
 * List + search + add + edit modal + delete. Storage via setEquipProfiles
 * → bl_equip_profiles → settings table (already wired in store + supabase).
 *
 * Brew Day calc reads only `trubLoss` and `boilOffRate` from the active
 * profile (lib/calculations.ts:400, :495). The other fields are stored
 * for the editor's UI completeness — verified against calculations.ts
 * during the port.
 *
 * "Active profile" selection is per-recipe (`bl_recipe_profiles_<id>.equip`),
 * not a flag on the profile itself.
 *
 * LOCK RULE (net-new, no HTML reference): a profile is locked when at least
 * one recipe selected it AND that recipe's brew_day blob has measOg > 0
 * (post-boil OG recorded). Locked profiles: rename + notes still editable;
 * numerics/material/SHC/largeBatchUtil read-only; Delete replaced with
 * Clone & Edit. See lib/equipmentProfileLock.ts.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { makeId } from '../../lib/utils';
import { computeLockedProfileIds, nextCloneName } from '../../lib/profileLock';
import type { EquipmentProfile, TunMaterial } from '../../types';

// Tun specific heat capacity by material (cal/g·°C). Verbatim port of
// HTML brewlab-desktop.html:20231 const TUN_SHC.
const TUN_SHC: Record<Exclude<TunMaterial, 'Other'>, number> = {
  'Stainless Steel': 0.11,
  'Copper':          0.092,
  'Aluminium':       0.22,
};

const TUN_MATERIALS: TunMaterial[] = ['Stainless Steel', 'Copper', 'Aluminium', 'Other'];

export default function EquipmentProfilesPanel() {
  const profiles      = useStore(s => s.equipProfiles);
  const setProfiles   = useStore(s => s.setEquipProfiles);
  const recipes       = useStore(s => s.recipes);
  const recipeProfilesByRecipe = useStore(s => s.recipeProfilesByRecipe);
  const pushToast     = useStore(s => s.pushToast);
  const [search, setSearch]     = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Derived lock state. Re-runs when recipes or the per-recipe profile cache
  // change. A simultaneous brew_day save in another tab won't refresh this
  // until something else re-renders the panel — acceptable v1 trade-off
  // (Settings tab unmounts on tab switch, so reopen recomputes fresh).
  const lockedEquipIds = useMemo(
    () => computeLockedProfileIds(recipes, recipeProfilesByRecipe, 'equip'),
    [recipes, recipeProfilesByRecipe],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? profiles.filter(p => (p.name || '').toLowerCase().includes(q))
      : profiles;
  }, [profiles, search]);

  const editing = editingId ? profiles.find(p => p.id === editingId) ?? null : null;
  const editingLocked = editing ? lockedEquipIds.has(editing.id) : false;
  const editingUsageCount = editing ? lockedEquipIds.get(editing.id) ?? 0 : 0;

  const addProfile = () => {
    const id = makeId();
    // Seed defaults match HTML addEquipProfile (line 20322).
    const next: EquipmentProfile = {
      id, name: 'New Equipment Profile',
      kettleVol: 1100, mashTunVol: 1200, defaultBatchL: 1000,
      boilOffRate: 45, trubLoss: 40,
      tunWeightKg: 156, tunShc: 0.11, tunMaterial: 'Stainless Steel',
      largeBatchUtil: 100, notes: '',
    };
    setProfiles([...profiles, next]);
    setEditingId(id);
  };

  const updateField = <K extends keyof EquipmentProfile>(id: string, field: K, value: EquipmentProfile[K]) => {
    setProfiles(profiles.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const deleteProfile = (id: string) => {
    const before = profiles;
    const target = profiles.find(p => p.id === id);
    setProfiles(profiles.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
    pushToast({
      message: target ? `Deleted equipment profile "${target.name}"` : 'Deleted equipment profile',
      undo: () => setProfiles(before),
    });
  };

  // Clone a locked profile, switch the modal to the new (unlocked) clone.
  // Existing recipes keep their reference to the original — clone is purely
  // a new library entry the user can pick on a new recipe. No auto-switch.
  const cloneAndEdit = (id: string) => {
    const src = profiles.find(p => p.id === id);
    if (!src) return;
    const newId = makeId();
    const newName = nextCloneName(src.name ?? '', profiles.map(p => p.name ?? ''));
    const clone: EquipmentProfile = { ...src, id: newId, name: newName };
    setProfiles([...profiles, clone]);
    setEditingId(newId);
    pushToast({
      message: `Cloned "${src.name}" → "${newName}". Edit the new profile.`,
    });
  };

  return (
    <>
      <div className="settings-section">
        <div className="settings-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Equipment Profiles</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={searchInputStyle}
            />
            <button className="btn sm" onClick={addProfile}>+ New Profile</button>
          </div>
        </div>
        <div style={hintStyle}>
          Save different brewing system setups. Select a profile when creating a recipe to auto-populate system values.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 ? (
            <div style={emptyStyle}>
              No profiles yet. Click + New Profile.
            </div>
          ) : filtered.map(p => {
            const usage = lockedEquipIds.get(p.id) ?? 0;
            const isLocked = usage > 0;
            return (
              <div key={p.id} style={rowStyle} onClick={() => setEditingId(p.id)}>
                <div>
                  <div style={rowTitleStyle}>{p.name}</div>
                  <div style={rowMetaStyle}>
                    Kettle {p.kettleVol ?? '—'}L · Batch {p.defaultBatchL ?? '—'}L
                    {' · '}Boil off {p.boilOffRate ?? '—'}L/hr · Trub {p.trubLoss ?? '—'}L
                    {' · '}{p.tunMaterial ?? '—'}
                    {p.defaultBhEff != null && ` · BH Eff ${p.defaultBhEff}%`}
                    {p.defaultBoilTime != null && ` · Boil ${p.defaultBoilTime} min`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isLocked && (
                    <span
                      style={lockBadgeStyle}
                      title={`Locked — used in ${usage} saved brew${usage === 1 ? '' : 's'}. Clone to edit.`}
                    >
                      🔒
                    </span>
                  )}
                  <span style={chevronStyle}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <EquipmentProfileModal
          profile={editing}
          locked={editingLocked}
          usageCount={editingUsageCount}
          onChange={(field, value) => updateField(editing.id, field, value)}
          onClose={() => setEditingId(null)}
          onDelete={() => deleteProfile(editing.id)}
          onCloneAndEdit={() => cloneAndEdit(editing.id)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Editor modal
// ═══════════════════════════════════════════════════════════════════

function EquipmentProfileModal({
  profile, locked, usageCount, onChange, onClose, onDelete, onCloneAndEdit,
}: {
  profile: EquipmentProfile;
  locked: boolean;
  usageCount: number;
  onChange: <K extends keyof EquipmentProfile>(field: K, value: EquipmentProfile[K]) => void;
  onClose: () => void;
  onDelete: () => void;
  onCloneAndEdit: () => void;
}) {
  const numOrUndef = (s: string): number | undefined => {
    if (s.trim() === '') return undefined;
    const n = parseFloat(s);
    return isFinite(n) ? n : undefined;
  };

  const showShc = profile.tunMaterial === 'Other';

  // Tun material change sets tunShc from the lookup unless 'Other'.
  // Mirrors HTML onEquipTunMaterialChange (line 20290).
  const onMaterialChange = (mat: TunMaterial) => {
    onChange('tunMaterial', mat);
    if (mat !== 'Other') {
      onChange('tunShc', TUN_SHC[mat]);
    }
  };

  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalPanelStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <input
              type="text"
              placeholder="Profile Name"
              value={profile.name ?? ''}
              onChange={e => onChange('name', e.target.value)}
              style={profileNameInputStyle}
            />
            {locked && (
              <span
                style={lockBadgeStyle}
                title={`Locked — used in ${usageCount} saved brew${usageCount === 1 ? '' : 's'}. Numerics are read-only; clone to edit them.`}
              >
                🔒 LOCKED
              </span>
            )}
          </div>
          {locked ? (
            <button className="btn sm" onClick={onCloneAndEdit}>⎘ Clone &amp; Edit</button>
          ) : (
            <button className="btn sm" style={deleteBtnStyle} onClick={onDelete}>✕ Delete</button>
          )}
        </div>
        <div className="settings-grid">
          <NumField label="Kettle Vol (L)"        value={profile.kettleVol}       onChange={v => onChange('kettleVol',       v)} placeholder="1100" disabled={locked} />
          <NumField label="Mash Tun Vol (L)"      value={profile.mashTunVol}      onChange={v => onChange('mashTunVol',      v)} placeholder="1200" disabled={locked} />
          <NumField label="Default Batch Size (L)" value={profile.defaultBatchL}  onChange={v => onChange('defaultBatchL',   v)} placeholder="1000" disabled={locked} />
          <NumField label="Boil Off Rate (L/hr)"  value={profile.boilOffRate}     onChange={v => onChange('boilOffRate',     v)} placeholder="45"   disabled={locked} />
          <NumField label="Trub Loss (L)"         value={profile.trubLoss}        onChange={v => onChange('trubLoss',        v)} placeholder="40"   disabled={locked} />
          <NumField label="Tun Weight (kg)"       value={profile.tunWeightKg}     onChange={v => onChange('tunWeightKg',     v)} placeholder="156"  disabled={locked} />
          <NumField label="Default BH Eff (%)"   value={profile.defaultBhEff}    onChange={v => onChange('defaultBhEff',    v)} placeholder="72"  disabled={locked} />
          <NumField label="Default Boil Time (min)" value={profile.defaultBoilTime} onChange={v => onChange('defaultBoilTime', v)} placeholder="60"  disabled={locked} />
          <div className="settings-field">
            <label>Tun Material</label>
            <select
              value={profile.tunMaterial ?? 'Stainless Steel'}
              onChange={e => onMaterialChange(e.target.value as TunMaterial)}
              disabled={locked}
            >
              {TUN_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {showShc && (
            <div className="settings-field">
              <label>Tun Specific Heat (cal/g·°C)</label>
              <input
                type="number"
                step={0.01}
                placeholder="0.11"
                value={profile.tunShc ?? ''}
                onChange={e => onChange('tunShc', numOrUndef(e.target.value))}
                disabled={locked}
              />
            </div>
          )}
          <div className="settings-field">
            <label>Large Batch Hop Util (%)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={50} max={200} step={1}
                placeholder="100"
                value={profile.largeBatchUtil ?? ''}
                onChange={e => onChange('largeBatchUtil', numOrUndef(e.target.value))}
                disabled={locked}
              />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)' }}>
                100% = no adjustment
              </span>
            </div>
          </div>
        </div>
        <div className="settings-field" style={{ marginTop: 10 }}>
          <label>Notes</label>
          <input
            type="text"
            placeholder="optional"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={profile.notes ?? ''}
            onChange={e => onChange('notes', e.target.value)}
          />
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn sm primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, placeholder, disabled }: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="settings-field">
      <label>{label}</label>
      <input
        type="number"
        placeholder={placeholder}
        value={value ?? ''}
        disabled={disabled}
        onChange={e => {
          const s = e.target.value;
          if (s.trim() === '') return onChange(undefined);
          const n = parseFloat(s);
          onChange(isFinite(n) ? n : undefined);
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shared styles — re-used by Mash and Pitch panels
// ═══════════════════════════════════════════════════════════════════

const searchInputStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '4px 8px', outline: 'none', width: 140, borderRadius: 4,
};

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  marginBottom: 12,
};

const emptyStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)',
  padding: '12px 0',
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  borderRadius: 6, padding: '10px 14px', cursor: 'pointer',
};

const rowTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--amber)',
};

const rowMetaStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2,
};

const chevronStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)',
};

const modalBackdropStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
};

const modalPanelStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  borderRadius: 10, padding: '20px 24px', width: 520, maxWidth: '95vw',
  maxHeight: '90vh', overflowY: 'auto',
};

const profileNameInputStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--amber)',
  background: 'transparent', border: 'none',
  borderBottom: '1px solid var(--border2)', outline: 'none', width: 260,
};

const deleteBtnStyle: React.CSSProperties = {
  color: 'var(--red)', borderColor: 'var(--red)',
};

const lockBadgeStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  letterSpacing: 0.5, whiteSpace: 'nowrap',
};

// Re-export the shared styles for the other two panels.
export const profileSharedStyles = {
  searchInput:    searchInputStyle,
  hint:           hintStyle,
  empty:          emptyStyle,
  row:            rowStyle,
  rowTitle:       rowTitleStyle,
  rowMeta:        rowMetaStyle,
  chevron:        chevronStyle,
  modalBackdrop:  modalBackdropStyle,
  modalPanel:     modalPanelStyle,
  profileNameInput: profileNameInputStyle,
  deleteBtn:      deleteBtnStyle,
  lockBadge:      lockBadgeStyle,
};
