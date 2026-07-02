/**
 * Numeric display formatting — single source of truth for the policy.
 *
 * Default behaviour: cap at 3 decimal places, strip trailing zeros.
 *   fmtNum(9.2000001)  → "9.2"
 *   fmtNum(5000)       → "5000"
 *   fmtNum(5000.000)   → "5000"
 *   fmtNum(0.123456)   → "0.123"
 *   fmtNum(null)       → "—"
 *
 * Forced precision (column-aligned tables, regulatory output, ABV):
 *   fmtNum(5.4, { dp: 2 })       → "5.40"
 *   fmtNum(17,  { dp: 1 })       → "17.0"
 *   fmtNum(5.4, { dp: 1, suffix: '%' }) → "5.4%"
 *
 * Empty / invalid:
 *   fmtNum(null)                       → "—"
 *   fmtNum(null, { fallback: '0' })    → "0"
 *   fmtNum(NaN,  { fallback: '' })     → ""
 *
 * Policy decisions (see SESSION_LOG 2026-05-09 follow-up 4):
 *   - ABV is always 1 dp app-wide (`fmtNum(v, { dp: 1, suffix: '%' })`).
 *     Don't bypass with raw `.toFixed`.
 *   - Tax / NTA / Tariff / persistence sites do NOT use this helper.
 *     They write canonical strings into Supabase / BeerXML / printed
 *     forms; precision is part of the legal artifact. Keep .toFixed(N)
 *     and the existing local f1/f2/f3 helpers in those files.
 *   - Inputs and input-bound mirrors (GrainPctModal kgStr/pctStr,
 *     HopIbuModal amtStr/ibuStr, slurry input, DryHop planned-g) keep
 *     fixed precision so the input value doesn't flicker as the user
 *     types.
 *   - Charts (FermChart canvas axis labels) keep .toFixed for tick
 *     consistency.
 */

export interface FmtNumOpts {
  /** Force exact precision. When set, trailing zeros are NOT stripped.
   *  Use this for column-aligned tables (`{ dp: 1 }` for L / °P / IBU /
   *  pct / ABV) so values stack vertically with consistent width. */
  dp?: number;
  /** Override the default 3-dp cap. Rarely needed. */
  maxDp?: number;
  /** Appended after the formatted number verbatim. Caller controls the
   *  separator: pass `' kg'` for "5.4 kg", `'%'` for "5.4%", `' °C'`
   *  for "5.4 °C". Empty / undefined → no suffix. */
  suffix?: string;
  /** Returned for null / undefined / NaN. Default '—'.
   *  Pass '' for empty string, '0' for zero-fallback (matches HTML
   *  fmtKg semantics). */
  fallback?: string;
}

const DEFAULT_MAX_DP = 3;

/** Format a number for display per the BrewLab numeric policy. */
export function fmtNum(
  n: number | null | undefined,
  opts?: FmtNumOpts,
): string {
  const fallback = opts?.fallback ?? '—';
  if (n == null || typeof n !== 'number' || !isFinite(n)) return fallback;

  const suffix = opts?.suffix ?? '';

  // Forced precision — no stripping. Used for column-aligned displays.
  if (opts?.dp != null) {
    return n.toFixed(opts.dp) + suffix;
  }

  // Cap-and-strip default. parseFloat round-trips through the cap and
  // drops trailing zeros + the trailing dot when the result is integral.
  const cap = opts?.maxDp ?? DEFAULT_MAX_DP;
  const capped = parseFloat(n.toFixed(cap));
  return capped.toString() + suffix;
}
