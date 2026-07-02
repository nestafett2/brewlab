/**
 * Data backup — full localStorage snapshot to a downloadable JSON file.
 *
 * Strategy: dump every `bl_*` key with a small denylist (sync watermarks,
 * one-shot migration flags, device-specific PINs). Future-proof — every new
 * feature's `bl_*` key gets backed up automatically without touching this
 * file.
 *
 * Format (`version: 1`):
 *   {
 *     exportedAt: <ISO timestamp>,
 *     version: 1,
 *     appVersion: null,         // reserved; package.json is "0.0.0" today
 *     data: { [key]: <raw localStorage string value> }
 *   }
 *
 * Values are raw strings straight from localStorage.getItem — no parse/
 * re-stringify round-trip. Restore code parses on demand.
 *
 * SECURITY NOTE: backup files include `bl_brew_settings`, which contains
 * the Supabase URL + anon key plus brewery name, address, and NTA
 * registration. Anon keys are safe in front-end (CLAUDE.md), but a backup
 * file shared with a third party leaks brewery setup. Caller surfaces a
 * toast warning at export time.
 *
 * Import counterpart: parseBackupFile + restoreBackup, below.
 *
 * Restore strategy is "wipe and replace": every existing bl_* key is
 * cleared (with the same denylist exception list as export — device
 * PINs / sync watermarks survive), then the backup's data map is
 * written verbatim via lsLocal (NOT lsSet — we explicitly avoid
 * pushing to Supabase, see "Sync interaction" below).
 *
 * Sync interaction (intentional disconnect):
 *   The restored bl_brew_settings is rewritten to clear sbUrl and
 *   sbAnonKey before being persisted. This puts the app into the
 *   pre-existing "boot in local-only mode" state described in
 *   CLAUDE.md, so the on-startup hydrate() in App.tsx is a no-op and
 *   the restored data isn't immediately stomped by Supabase. The user
 *   re-enters credentials in Settings → Connection and explicitly
 *   chooses Push (publish restore to Supabase) or Pull (discard
 *   restore in favour of cloud state).
 *
 *   Why not auto-push: ferm_log dispatch (lib/supabase.ts:128-149) does
 *   a soft-delete diff that would stamp `deleted_at` on every active
 *   row on Supabase that isn't in the restored array — silently losing
 *   any ferm reading taken on another device since the backup. Pushing
 *   bl_brew_settings would also overwrite cross-device library/profile
 *   edits. Disconnect is the conservative default; the user can still
 *   Push afterwards if that's the intent.
 */

export const BACKUP_FORMAT_VERSION = 1;

/**
 * Keys we never include in a backup. See file header for rationale.
 */
export const BACKUP_DENYLIST: ReadonlySet<string> = new Set([
  'bl_last_sync',                // sync watermark — would mislead next hydrate
  'bl_brew_number_recompute',    // one-shot internal migration flag (App.tsx:17)
  'bl_mob_pin',                  // device-specific mobile PIN
  'bl_mob_session',              // device-specific mobile session
  'bl_tablet_pin',               // device-specific tablet PIN
  'bl_tablet_session',           // device-specific tablet session
]);

export interface BackupFile {
  exportedAt: string;
  version: number;
  appVersion: string | null;
  data: Record<string, string>;
}

/**
 * Build the backup payload from current localStorage. Pure — no I/O.
 */
export function buildBackup(): BackupFile {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('bl_')) continue;
    if (BACKUP_DENYLIST.has(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    data[key] = value;
  }
  return {
    exportedAt: new Date().toISOString(),
    version: BACKUP_FORMAT_VERSION,
    appVersion: null,
    data,
  };
}

/**
 * `brewlab-backup-YYYY-MM-DD.json` using the user's local timezone.
 */
export function buildBackupFilename(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `brewlab-backup-${yyyy}-${mm}-${dd}.json`;
}

/**
 * Build the backup, trigger a browser download, return summary.
 * Throws if localStorage is unavailable; caller surfaces an error toast.
 */
export function exportAllData(): { keyCount: number; filename: string } {
  const payload = buildBackup();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = buildBackupFilename();
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick — Chrome/Firefox need the URL alive long enough
  // for the download to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { keyCount: Object.keys(payload.data).length, filename };
}

// ─────────────────────────────────────────────────────────────────────
// Import side
// ─────────────────────────────────────────────────────────────────────

/**
 * Errors thrown by parseBackupFile carry a stable code so the UI can
 * decide between specific toasts vs the modal-preview path.
 */
export type BackupParseErrorCode =
  | 'invalid_json'
  | 'wrong_shape'
  | 'wrong_version_future'
  | 'wrong_version_past'
  | 'bad_keys';

export class BackupParseError extends Error {
  code: BackupParseErrorCode;
  constructor(code: BackupParseErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'BackupParseError';
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Strict-parse a backup file's JSON text into a typed BackupFile.
 * Throws BackupParseError with a code on every rejection path so the
 * caller can map to specific user-facing messages.
 *
 * Rules (matches Desktop wiring spec):
 *   • JSON must parse.
 *   • Top-level shape: { exportedAt: string, version: number,
 *                        appVersion: string|null, data: object }.
 *   • version must equal BACKUP_FORMAT_VERSION (no migrations yet).
 *   • Every key in data must start with "bl_" and map to a string
 *     (raw localStorage value — buildBackup writes strings verbatim).
 */
export function parseBackupFile(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new BackupParseError(
      'invalid_json',
      'File is not valid JSON: ' + (e instanceof Error ? e.message : String(e)),
    );
  }
  if (!isPlainObject(raw)) {
    throw new BackupParseError('wrong_shape', 'Backup file is not an object.');
  }

  const exportedAt = raw.exportedAt;
  const version    = raw.version;
  const appVersion = raw.appVersion;
  const data       = raw.data;

  if (typeof exportedAt !== 'string' ||
      typeof version    !== 'number' ||
      (appVersion !== null && typeof appVersion !== 'string') ||
      !isPlainObject(data)) {
    throw new BackupParseError(
      'wrong_shape',
      'Backup is missing required fields (exportedAt, version, appVersion, data).',
    );
  }

  if (version > BACKUP_FORMAT_VERSION) {
    throw new BackupParseError(
      'wrong_version_future',
      `Backup is from a newer version of BrewLab (v${version}). ` +
      'Update BrewLab and try again.',
    );
  }
  if (version < BACKUP_FORMAT_VERSION) {
    throw new BackupParseError(
      'wrong_version_past',
      `Backup is from an older format (v${version}) that this build no longer reads.`,
    );
  }

  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith('bl_')) {
      throw new BackupParseError(
        'bad_keys',
        `Backup contains an unexpected key "${k}". Every key must start with "bl_".`,
      );
    }
    if (typeof v !== 'string') {
      throw new BackupParseError(
        'bad_keys',
        `Backup key "${k}" has a non-string value. Backup format requires raw localStorage strings.`,
      );
    }
  }

  return {
    exportedAt,
    version,
    appVersion,
    data: data as Record<string, string>,
  };
}

/**
 * Read the current bl_brew_settings.sbUrl without triggering any of
 * the store's lazy-cache machinery. Used by the preview to surface a
 * different-brewery warning before commit.
 */
export function readCurrentSupabaseUrl(): string {
  try {
    const raw = localStorage.getItem('bl_brew_settings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.sbUrl === 'string') {
      return parsed.sbUrl;
    }
  } catch {
    // ignore — empty url falls through
  }
  return '';
}

/**
 * Read the backup's bl_brew_settings.sbUrl. Returns '' if the backup
 * doesn't carry one (legitimate — the user may have backed up while
 * disconnected).
 */
export function readBackupSupabaseUrl(backup: BackupFile): string {
  const raw = backup.data['bl_brew_settings'];
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.sbUrl === 'string') {
      return parsed.sbUrl;
    }
  } catch {
    // ignore
  }
  return '';
}

/** Count current bl_* keys, used in the preview for "before vs after". */
export function countCurrentBrewLabKeys(): number {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('bl_')) n++;
  }
  return n;
}

export interface RestoreSummary {
  /** Number of bl_* keys removed before the restore. */
  cleared: number;
  /** Number of bl_* keys written from the backup. */
  written: number;
  /** True if the restored bl_brew_settings was scrubbed of sbUrl /
   *  sbAnonKey before being persisted. False when the backup carried
   *  no settings blob in the first place — there's nothing to scrub. */
  credentialsCleared: boolean;
}

/**
 * Wipe-and-restore. Every bl_* key not in BACKUP_DENYLIST is removed,
 * then every key in `backup.data` is written via raw localStorage.setItem
 * (the values are already JSON strings — see buildBackup).
 *
 * The restored bl_brew_settings is rewritten to clear sbUrl and
 * sbAnonKey, putting the app into local-only boot mode. See module
 * header for rationale.
 *
 * Caller is responsible for reloading the page so React re-hydrates
 * fresh from the rewritten localStorage.
 */
export function restoreBackup(backup: BackupFile): RestoreSummary {
  // 1. Wipe — same denylist as export so device PINs and the sync
  // watermark survive. Mirrors clearAllBrewLabData but with the
  // export-side denylist applied.
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('bl_')) continue;
    if (BACKUP_DENYLIST.has(key)) continue;
    toRemove.push(key);
  }
  for (const k of toRemove) localStorage.removeItem(k);

  // 2. Restore — values are raw JSON strings from the export round-trip.
  // bl_brew_settings is special-cased: scrub sbUrl + sbAnonKey so the
  // app boots in local-only mode and the on-startup hydrate is a no-op.
  let credentialsCleared = false;
  for (const [k, v] of Object.entries(backup.data)) {
    if (k === 'bl_brew_settings') {
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === 'object') {
          parsed.sbUrl = '';
          parsed.sbAnonKey = '';
          localStorage.setItem(k, JSON.stringify(parsed));
          credentialsCleared = true;
          continue;
        }
      } catch {
        // Malformed settings blob — fall through and write verbatim,
        // user will re-enter credentials anyway.
      }
    }
    localStorage.setItem(k, v);
  }

  return {
    cleared: toRemove.length,
    written: Object.keys(backup.data).length,
    credentialsCleared,
  };
}
