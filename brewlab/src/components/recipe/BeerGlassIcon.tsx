/**
 * Tiny pint-glass SVG. Solid flat fill driven by the recipe's EBC via
 * `lib/ebcColor.ebcToHex`. No gradient, no head — the goal is a quick
 * "what colour is this beer" glance in the meta bar, not photorealism.
 */

interface Props {
  /** Hex fill color (#RRGGBB). Caller computes via ebcToHex. */
  fill: string;
  /** Display height in px. Width derived 1:1.4 ratio. Default 26 px. */
  size?: number;
  /** Optional title for the SVG (browser tooltip). */
  title?: string;
}

export default function BeerGlassIcon({ fill, size = 26, title }: Props) {
  const w = size * 0.7;
  const h = size;
  return (
    <svg
      viewBox="0 0 14 20"
      width={w}
      height={h}
      role="img"
      aria-label={title ?? 'Beer color'}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      {/* Glass outline — pint shape, slight taper. */}
      <path
        d="M 2.2 1.5 L 11.8 1.5 L 11.0 18 Q 11.0 18.7 10.3 18.7 L 3.7 18.7 Q 3.0 18.7 3.0 18 Z"
        fill={fill}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
