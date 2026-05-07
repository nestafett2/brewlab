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
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { makeId } from '../../lib/utils';
import type { PitchProfile } from '../../types';
import { profileSharedStyles as ss } from './EquipmentProfilesPanel';

export default function PitchProfilesPanel() {
  const profiles    = useStore(s => s.pitchProfiles);
  const setProfiles = useStore(s => s.setPitchProfiles);
  const [search, setSearch]       = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? profiles.filter(p => (p.name || '').toLowerCase().includes(q))
      : profiles;
  }, [profiles, search]);

  const editing = editingId ? profiles.find(p => p.id === editingId) ?? null : null;

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
    if (!window.confirm('Delete this pitch profile?')) return;
    setProfiles(profiles.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
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
          ) : filtered.map(p => (
            <div key={p.id} style={ss.row} onClick={() => setEditingId(p.id)}>
              <div>
                <div style={ss.rowTitle}>{p.name}</div>
                <div style={ss.rowMeta}>
                  O₂ {p.o2Target ?? '—'} ppm · {p.o2Lpm ?? '—'} LPM · {p.o2Time ?? '—'} sec
                </div>
              </div>
              <span style={ss.chevron}>›</span>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <PitchProfileModal
          profile={editing}
          onChange={updates => updateProfile(editing.id, updates)}
          onClose={() => setEditingId(null)}
          onDelete={() => deleteProfile(editing.id)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Editor modal
// ═══════════════════════════════════════════════════════════════════

function PitchProfileModal({
  profile, onChange, onClose, onDelete,
}: {
  profile: PitchProfile;
  onChange: (updates: Partial<PitchProfile>) => void;
  onClose: () => void;
  onDelete: () => void;
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Profile Name"
            value={profile.name ?? ''}
            onChange={e => onChange({ name: e.target.value })}
            style={{ ...ss.profileNameInput, width: 240 }}
          />
          <button className="btn sm" style={ss.deleteBtn} onClick={onDelete}>✕ Delete</button>
        </div>

        <div className="settings-grid">
          <div className="settings-field">
            <label>O₂ Target (ppm)</label>
            <input
              type="text"
              placeholder="8–10"
              value={profile.o2Target ?? ''}
              onChange={e => onChange({ o2Target: e.target.value })}
            />
          </div>
          <div className="settings-field">
            <label>Flow Rate (LPM)</label>
            <input
              type="number"
              step={0.1}
              value={profile.o2Lpm ?? ''}
              onChange={e => onChange({ o2Lpm: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="settings-field">
            <label>Duration (sec)</label>
            <input
              type="number"
              step={1}
              value={profile.o2Time ?? ''}
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
