/**
 * Settings → Mash Profiles — port of HTML #settings-mash-profiles
 * (line 2772) + editor modal (line 2786) + render/edit JS (line 20492).
 *
 * List + search + add + edit modal with mash steps array. Storage via
 * setMashProfiles → bl_mash_profiles → settings table.
 *
 * BrewDayTab consumes mashProfile.steps[0].temp for the strike-temp calc
 * (lib/calculations.ts:537) and mashProfile.ratio for mash water target
 * (per-recipe wiring). Other fields are stored for the editor's UI
 * completeness and the per-recipe mash blob (bl_mash_<recipeId>).
 *
 * LOCK RULE: a profile is locked when at least one recipe selected it
 * (recipe_profiles[].mash) AND that recipe's brew_day blob has measOg > 0.
 * Locked profiles: rename + notes editable; ratio, mashIn, mashOut, and
 * the entire Steps section (type, temp, time, +/✕) read-only; Delete
 * replaced with Clone & Edit. See lib/profileLock.ts.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { makeId } from '../../lib/utils';
import { computeLockedProfileIds, nextCloneName } from '../../lib/profileLock';
import type { MashProfile, MashStep, MashStepType } from '../../types';
import { profileSharedStyles as ss } from './EquipmentProfilesPanel';

const STEP_TYPES: MashStepType[] = ['Infusion', 'Decoction', 'Temperature', 'Sparge', 'Mash Out'];

export default function MashProfilesPanel() {
  const profiles    = useStore(s => s.mashProfiles);
  const setProfiles = useStore(s => s.setMashProfiles);
  const recipes     = useStore(s => s.recipes);
  const recipeProfilesByRecipe = useStore(s => s.recipeProfilesByRecipe);
  const pushToast   = useStore(s => s.pushToast);
  const [search, setSearch]       = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Derived lock state — see lib/profileLock.ts. Re-runs when recipes or
  // the per-recipe profile cache change. Same reactivity caveat as the
  // Equipment panel: simultaneous brew_day save in another tab won't
  // refresh this until something else re-renders the panel.
  const lockedMashIds = useMemo(
    () => computeLockedProfileIds(recipes, recipeProfilesByRecipe, 'mash'),
    [recipes, recipeProfilesByRecipe],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? profiles.filter(p => (p.name || '').toLowerCase().includes(q))
      : profiles;
  }, [profiles, search]);

  const editing = editingId ? profiles.find(p => p.id === editingId) ?? null : null;
  const editingLocked = editing ? lockedMashIds.has(editing.id) : false;
  const editingUsageCount = editing ? lockedMashIds.get(editing.id) ?? 0 : 0;

  const addProfile = () => {
    const id = makeId();
    // Seed defaults match HTML addMashProfileLib (line 20593).
    const next: MashProfile = {
      id,
      name: 'New Mash Profile',
      ratio: 3.0,
      steps: [
        { type: 'Infusion', temp: 68, time: 60 },
        { type: 'Mash Out', temp: 75, time: 10 },
      ],
      notes: '',
    };
    setProfiles([...profiles, next]);
    setEditingId(id);
  };

  const updateProfile = (id: string, updates: Partial<MashProfile>) => {
    setProfiles(profiles.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProfile = (id: string) => {
    const before = profiles;
    const target = profiles.find(p => p.id === id);
    setProfiles(profiles.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
    pushToast({
      message: target ? `Deleted mash profile "${target.name}"` : 'Deleted mash profile',
      undo: () => setProfiles(before),
    });
  };

  // Clone a locked profile, switch the modal to the new (unlocked) clone.
  // Existing recipes keep their reference to the original. No auto-switch.
  const cloneAndEdit = (id: string) => {
    const src = profiles.find(p => p.id === id);
    if (!src) return;
    const newId = makeId();
    const newName = nextCloneName(src.name ?? '', profiles.map(p => p.name ?? ''));
    const clone: MashProfile = {
      ...src,
      id: newId,
      name: newName,
      // Deep-copy the steps array so edits to the clone don't mutate the
      // original (shallow ...src would share the same array reference).
      steps: (src.steps ?? []).map(s => ({ ...s })),
    };
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
          <span>Mash Profiles</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={ss.searchInput}
            />
            <button className="btn sm" onClick={addProfile}>+ New Profile</button>
          </div>
        </div>
        <div style={ss.hint}>
          Save reusable mash programs (Single Infusion, Step Mash, etc.) to load into any recipe.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 ? (
            <div style={ss.empty}>No profiles yet.</div>
          ) : filtered.map(p => {
            const stepCount = p.steps?.length ?? 0;
            const usage = lockedMashIds.get(p.id) ?? 0;
            const isLocked = usage > 0;
            return (
              <div key={p.id} style={ss.row} onClick={() => setEditingId(p.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ ...ss.rowTitle, minWidth: 160 }}>{p.name}</div>
                  <div style={ss.rowMeta}>Ratio {p.ratio ?? 3.0} L/kg</div>
                  {p.mashIn != null && <div style={ss.rowMeta}>Mash in {p.mashIn}°C</div>}
                  {p.mashOut != null && <div style={ss.rowMeta}>Mash out {p.mashOut}°C</div>}
                  <div style={ss.rowMeta}>{stepCount} step{stepCount !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isLocked && (
                    <span
                      style={ss.lockBadge}
                      title={`Locked — used in ${usage} saved brew${usage === 1 ? '' : 's'}. Clone to edit.`}
                    >
                      🔒
                    </span>
                  )}
                  <span style={ss.chevron}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <MashProfileModal
          profile={editing}
          locked={editingLocked}
          usageCount={editingUsageCount}
          onChange={updates => updateProfile(editing.id, updates)}
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

function MashProfileModal({
  profile, locked, usageCount, onChange, onClose, onDelete, onCloneAndEdit,
}: {
  profile: MashProfile;
  locked: boolean;
  usageCount: number;
  onChange: (updates: Partial<MashProfile>) => void;
  onClose: () => void;
  onDelete: () => void;
  onCloneAndEdit: () => void;
}) {
  const numOrUndef = (s: string): number | undefined => {
    if (s.trim() === '') return undefined;
    const n = parseFloat(s);
    return isFinite(n) ? n : undefined;
  };

  const updateStep = (idx: number, patch: Partial<MashStep>) => {
    const steps = (profile.steps ?? []).map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ steps });
  };

  const addStep = () => {
    const steps = [...(profile.steps ?? []), { type: 'Infusion' as MashStepType, temp: 68, time: 60 }];
    onChange({ steps });
  };

  const removeStep = (idx: number) => {
    const steps = (profile.steps ?? []).filter((_, i) => i !== idx);
    onChange({ steps });
  };

  return (
    <div style={ss.modalBackdrop} onClick={onClose}>
      <div style={ss.modalPanel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <input
              type="text"
              placeholder="Profile Name"
              value={profile.name ?? ''}
              onChange={e => onChange({ name: e.target.value })}
              style={ss.profileNameInput}
            />
            {locked && (
              <span
                style={ss.lockBadge}
                title={`Locked — used in ${usageCount} saved brew${usageCount === 1 ? '' : 's'}. Ratio, temps, and steps are read-only; clone to edit them.`}
              >
                🔒 LOCKED
              </span>
            )}
          </div>
          {locked ? (
            <button className="btn sm" onClick={onCloneAndEdit}>⎘ Clone &amp; Edit</button>
          ) : (
            <button className="btn sm" style={ss.deleteBtn} onClick={onDelete}>✕ Delete</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="settings-field" style={{ width: 120 }}>
            <label>Water Ratio (L/kg)</label>
            <input
              type="number"
              step={0.1}
              value={profile.ratio ?? ''}
              disabled={locked}
              onChange={e => onChange({ ratio: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="settings-field" style={{ width: 120 }}>
            <label>Mash In Temp (°C)</label>
            <input
              type="number"
              step={0.5}
              value={profile.mashIn ?? ''}
              disabled={locked}
              onChange={e => onChange({ mashIn: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="settings-field" style={{ width: 120 }}>
            <label>Mash Out Temp (°C)</label>
            <input
              type="number"
              step={0.5}
              value={profile.mashOut ?? ''}
              disabled={locked}
              onChange={e => onChange({ mashOut: numOrUndef(e.target.value) })}
            />
          </div>
        </div>

        <div style={stepsHeaderStyle}>Steps</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {(profile.steps ?? []).map((step, idx) => (
            <div key={idx} style={stepRowStyle}>
              <select
                value={step.type}
                onChange={e => updateStep(idx, { type: e.target.value as MashStepType })}
                style={stepInputStyle}
                disabled={locked}
              >
                {STEP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="number"
                value={step.temp ?? ''}
                placeholder="°C"
                disabled={locked}
                onChange={e => updateStep(idx, { temp: parseFloat(e.target.value) || 0 })}
                style={{ ...stepInputStyle, width: 60 }}
              />
              <span style={stepUnitStyle}>°C</span>
              <input
                type="number"
                value={step.time ?? ''}
                placeholder="min"
                disabled={locked}
                onChange={e => updateStep(idx, { time: parseFloat(e.target.value) || 0 })}
                style={{ ...stepInputStyle, width: 55 }}
              />
              <span style={stepUnitStyle}>min</span>
              <button
                className="btn sm"
                style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 'auto' }}
                disabled={locked}
                onClick={() => removeStep(idx)}
              >✕</button>
            </div>
          ))}
        </div>
        <button className="btn sm" onClick={addStep} disabled={locked}>+ Add Step</button>

        <div className="settings-field" style={{ marginTop: 14 }}>
          <label>Notes</label>
          <input
            type="text"
            placeholder="optional"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={profile.notes ?? ''}
            onChange={e => onChange({ notes: e.target.value })}
          />
        </div>

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn sm primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const stepsHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
  letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
};

const stepRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  borderRadius: 4, padding: '6px 10px',
};

const stepInputStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '3px 6px', outline: 'none', borderRadius: 3,
};

const stepUnitStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
};
