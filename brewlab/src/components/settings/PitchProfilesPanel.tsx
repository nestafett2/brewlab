/**
 * Settings → Pitch / O₂ Profiles — port of HTML #settings-pitch-profiles
 * (line 2810) + editor modal (line 2824) + render/edit JS (line 20611).
 *
 * List + search + add + edit modal + delete. Storage via setPitchProfiles
 * → bl_pitch_profiles → settings table.
 *
 * BrewDayTab applies o2Lpm + o2Time to the brew-day blob when the user
 * selects a profile from the Pitch / O₂ profile selector
 * (BrewDayTab.tsx:230 applyPitchProfile).
 *
 * LOCK RULE: a profile is locked when at least one recipe selected it
 * (recipe_profiles[].pitch) AND that recipe's brew_day blob has measOg > 0.
 * Locked profiles: rename + notes editable; O₂ Target, Flow Rate, and
 * Duration read-only; Delete replaced with Clone & Edit. See
 * lib/profileLock.ts.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { makeId } from '../../lib/utils';
import { computeLockedProfileIds, nextCloneName } from '../../lib/profileLock';
import type { PitchProfile } from '../../types';
import { profileSharedStyles as ss } from './EquipmentProfilesPanel';

export default function PitchProfilesPanel() {
  const profiles    = useStore(s => s.pitchProfiles);
  const setProfiles = useStore(s => s.setPitchProfiles);
  const recipes     = useStore(s => s.recipes);
  const recipeProfilesByRecipe = useStore(s => s.recipeProfilesByRecipe);
  const pushToast   = useStore(s => s.pushToast);
  const [search, setSearch]       = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Derived lock state — see lib/profileLock.ts. Same reactivity caveat
  // as the Equipment / Mash panels.
  const lockedPitchIds = useMemo(
    () => computeLockedProfileIds(recipes, recipeProfilesByRecipe, 'pitch'),
    [recipes, recipeProfilesByRecipe],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? profiles.filter(p => (p.name || '').toLowerCase().includes(q))
      : profiles;
  }, [profiles, search]);

  const editing = editingId ? profiles.find(p => p.id === editingId) ?? null : null;
  const editingLocked = editing ? lockedPitchIds.has(editing.id) : false;
  const editingUsageCount = editing ? lockedPitchIds.get(editing.id) ?? 0 : 0;

  const addProfile = () => {
    const id = makeId();
    // HTML's addPitchProfile (line 20658) seeds with name only; users fill
    // the O₂ values per yeast type (Ale / Lager / Hazy etc.).
    const next: PitchProfile = { id, name: 'New Pitch Profile' };
    setProfiles([...profiles, next]);
    setEditingId(id);
  };

  const updateProfile = (id: string, updates: Partial<PitchProfile>) => {
    setProfiles(profiles.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProfile = (id: string) => {
    const before = profiles;
    const target = profiles.find(p => p.id === id);
    setProfiles(profiles.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
    pushToast({
      message: target ? `Deleted pitch profile "${target.name}"` : 'Deleted pitch profile',
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
    const clone: PitchProfile = { ...src, id: newId, name: newName };
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
          <span>Pitch / O₂ Profiles</span>
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
          Save O₂ and pitch targets by yeast type (Ale, Lager, Hazy/NEIPA, etc.).
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 ? (
            <div style={ss.empty}>No profiles yet.</div>
          ) : filtered.map(p => {
            const usage = lockedPitchIds.get(p.id) ?? 0;
            const isLocked = usage > 0;
            return (
              <div key={p.id} style={ss.row} onClick={() => setEditingId(p.id)}>
                <div>
                  <div style={ss.rowTitle}>{p.name}</div>
                  <div style={ss.rowMeta}>
                    O₂ {p.o2Target ?? '—'} ppm · {p.o2Lpm ?? '—'} LPM · {p.o2Time ?? '—'} sec
                  </div>
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
        <PitchProfileModal
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

function PitchProfileModal({
  profile, locked, usageCount, onChange, onClose, onDelete, onCloneAndEdit,
}: {
  profile: PitchProfile;
  locked: boolean;
  usageCount: number;
  onChange: (updates: Partial<PitchProfile>) => void;
  onClose: () => void;
  onDelete: () => void;
  onCloneAndEdit: () => void;
}) {
  const numOrUndef = (s: string): number | undefined => {
    if (s.trim() === '') return undefined;
    const n = parseFloat(s);
    return isFinite(n) ? n : undefined;
  };

  return (
    <div style={ss.modalBackdrop} onClick={onClose}>
      {/* HTML modal width is 420px; keep that vs Equipment's 520. */}
      <div style={{ ...ss.modalPanel, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <input
              type="text"
              placeholder="Profile Name"
              value={profile.name ?? ''}
              onChange={e => onChange({ name: e.target.value })}
              style={{ ...ss.profileNameInput, width: 240 }}
            />
            {locked && (
              <span
                style={ss.lockBadge}
                title={`Locked — used in ${usageCount} saved brew${usageCount === 1 ? '' : 's'}. O₂ values are read-only; clone to edit them.`}
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

        <div className="settings-grid">
          <div className="settings-field">
            <label>O₂ Target (ppm)</label>
            <input
              type="text"
              placeholder="8–10"
              value={profile.o2Target ?? ''}
              disabled={locked}
              onChange={e => onChange({ o2Target: e.target.value })}
            />
          </div>
          <div className="settings-field">
            <label>Flow Rate (LPM)</label>
            <input
              type="number"
              step={0.1}
              value={profile.o2Lpm ?? ''}
              disabled={locked}
              onChange={e => onChange({ o2Lpm: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="settings-field">
            <label>Duration (sec)</label>
            <input
              type="number"
              step={1}
              value={profile.o2Time ?? ''}
              disabled={locked}
              onChange={e => onChange({ o2Time: numOrUndef(e.target.value) })}
            />
          </div>
        </div>

        <div className="settings-field" style={{ marginTop: 10 }}>
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
