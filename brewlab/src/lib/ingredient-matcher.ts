/**
 * Strict ingredient-name matcher — port of brewlab-desktop.html:14266
 * (ingNamesMatch). Used by:
 *   • Record Usage modal — match recipe ingredients to library entries
 *     so usage can be written to the right ledger key.
 *   • Order Planner forecast — same lookup for projection of future
 *     consumption against current stock.
 *
 * Strategy (HTML 14266–14296 verbatim):
 *   1. If both have a libId, compare those — exact and fast.
 *   2. Lowercase + trim and compare full names. Strip lot/batch
 *      suffixes ("- 9-2025", "9-25") before comparing too.
 *   3. Tokenise (4+ char words, non-numeric) and require strict overlap:
 *      every token in the shorter set must appear in the longer set.
 *   4. Allow at most 1 extra token in the longer set (e.g. supplier
 *      tag) — anything more is treated as a different product.
 */

export function ingNamesMatch(
  libName: string | null | undefined,
  recName: string | null | undefined,
  recLibId?: string | number | null,
  libId?: string | number | null,
): boolean {
  // 1. Library-id fast path.
  if (recLibId != null && libId != null && String(recLibId) === String(libId)) return true;

  const a = (libName || '').toLowerCase().trim();
  const b = (recName || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;

  // 2. Strip batch/lot suffixes before comparing.
  const strip = (s: string): string => s.replace(/[\s\-]+\d{1,2}[\-/]\d{2,4}$/, '').trim();
  const cleanA = strip(a);
  const cleanB = strip(b);
  if (cleanA === cleanB) return true;

  // 3. Tokenise to meaningful words (4+ chars, non-numeric).
  const tokenize = (s: string): string[] =>
    s.split(/[\s\-()/,.]+/).filter(t => t.length >= 4 && !/^\d+$/.test(t));
  const tokA = tokenize(cleanA);
  const tokB = tokenize(cleanB);
  if (!tokA.length || !tokB.length) return false;

  // STRICT: every token in the shorter set must exactly appear in the longer set.
  const shorter = tokA.length <= tokB.length ? tokA : tokB;
  const longer  = tokA.length <= tokB.length ? tokB : tokA;
  if (!shorter.every(t => longer.includes(t))) return false;

  // 4. At most 1 extra token in the longer set (e.g. supplier suffix).
  const extra = longer.filter(t => !shorter.includes(t));
  return extra.length <= 1;
}
