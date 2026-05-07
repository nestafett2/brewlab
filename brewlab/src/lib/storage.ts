/**
 * Local storage abstraction — the three functions from SYNC.md.
 *
 * lsGet:   Read from localStorage
 * lsLocal: Write to localStorage ONLY (used during hydration)
 * lsSet:   Write to localStorage AND dispatch to Supabase
 */

import { sbDispatch } from './supabase';

/** Read from localStorage. Returns default if key doesn't exist. */
export function lsGet<T>(key: string, defaultValue: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/** Write to localStorage ONLY. Does NOT push to Supabase. */
export function lsLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — silently continue
  }
}

/** Write to localStorage AND dispatch to Supabase in background. */
export function lsSet(key: string, value: unknown): void {
  lsLocal(key, value);
  sbDispatch(key, value);
}

/** Remove a key from localStorage only. */
export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/** Get all bl_ keys from localStorage. */
export function getAllBrewLabKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('bl_')) keys.push(key);
  }
  return keys;
}

/** Clear all bl_ keys from localStorage. */
export function clearAllBrewLabData(): void {
  for (const key of getAllBrewLabKeys()) {
    localStorage.removeItem(key);
  }
}
