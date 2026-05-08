/**
 * EBC → flat-fill hex color for the recipe meta-bar beer-glass icon.
 *
 * Piecewise-linear ramp: pale straw → amber → brown → near-black.
 * Stops chosen by eye against typical brewing ranges:
 *   • EBC  0–6   pale straw / pilsner
 *   • EBC  6–14  golden / pale ale
 *   • EBC 14–30  amber
 *   • EBC 30–60  brown
 *   • EBC 60+    very dark brown / opaque
 *
 * Empty-recipe (EBC = 0) hits the lightest endpoint by design — matches
 * the glass we want to show before any grains are added.
 *
 * No gradient, no perceptual model — just an even visual progression
 * across the brewing range so the icon reads at a glance.
 */

interface Stop {
  ebc: number;
  rgb: [number, number, number];
}

const STOPS: Stop[] = [
  { ebc:   0, rgb: [0xF6, 0xE3, 0x8E] }, // pale straw
  { ebc:   6, rgb: [0xEF, 0xC6, 0x4A] }, // golden
  { ebc:  14, rgb: [0xD6, 0x8C, 0x1F] }, // amber
  { ebc:  30, rgb: [0x8E, 0x4B, 0x14] }, // brown
  { ebc:  60, rgb: [0x3C, 0x1E, 0x0A] }, // dark brown
  { ebc: 120, rgb: [0x0F, 0x07, 0x03] }, // near-black
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

export function ebcToHex(ebc: number | null | undefined): string {
  const v = typeof ebc === 'number' && isFinite(ebc) && ebc > 0 ? ebc : 0;

  // Below the first stop: clamp to the lightest color.
  if (v <= STOPS[0].ebc) {
    const [r, g, b] = STOPS[0].rgb;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  // Above the last stop: clamp to the darkest.
  if (v >= STOPS[STOPS.length - 1].ebc) {
    const [r, g, b] = STOPS[STOPS.length - 1].rgb;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  // Find the bracket and interpolate.
  for (let i = 0; i < STOPS.length - 1; i++) {
    const lo = STOPS[i];
    const hi = STOPS[i + 1];
    if (v >= lo.ebc && v <= hi.ebc) {
      const t = (v - lo.ebc) / (hi.ebc - lo.ebc);
      const r = lerp(lo.rgb[0], hi.rgb[0], t);
      const g = lerp(lo.rgb[1], hi.rgb[1], t);
      const b = lerp(lo.rgb[2], hi.rgb[2], t);
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  }
  // Unreachable — keeps TS happy.
  return '#F6E38E';
}
