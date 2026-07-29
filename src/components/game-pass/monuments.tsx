// Decorative Hollywood Boulevard landmarks that dress up the swervy path —
// purely illustrative SVG fragments, kept monochrome gold-on-dark to stay
// consistent with Frame's single-accent design system rather than
// introducing new colors.

function sparklePath(cx: number, cy: number, s: number): string {
  return `M${cx},${cy - s} L${cx + s * 0.3},${cy - s * 0.3} L${cx + s},${cy} L${cx + s * 0.3},${cy + s * 0.3} L${cx},${cy + s} L${cx - s * 0.3},${cy + s * 0.3} L${cx - s},${cy} L${cx - s * 0.3},${cy - s * 0.3} Z`;
}

/** The hillside sign at the top of the boulevard, before day one. */
export function HollywoodSignBanner({ width, height }: { width: number; height: number }) {
  const midX = width / 2;
  const crestY = height * 0.55;
  const sparkles: [number, number][] = [
    [midX - width * 0.32, height * 0.18],
    [midX - width * 0.16, height * 0.1],
    [midX + width * 0.2, height * 0.14],
    [midX + width * 0.33, height * 0.24],
  ];
  return (
    <g>
      <path
        d={`M0,${height} L0,${crestY} Q${midX},${height * 0.06} ${width},${crestY} L${width},${height} Z`}
        fill="var(--surface-raised)"
        stroke="var(--border)"
        strokeWidth={1}
      />
      {sparkles.map(([sx, sy], i) => (
        <path key={i} d={sparklePath(sx, sy, 4)} fill="var(--accent)" opacity={0.45} />
      ))}
      <text
        x={midX}
        y={crestY + 6}
        textAnchor="middle"
        fontSize={Math.min(30, width * 0.09)}
        fontWeight={800}
        letterSpacing={4}
        fill="var(--accent)"
        className="font-hollywood"
      >
        HOLLYWOOD
      </text>
    </g>
  );
}

/** A palm tree silhouette lining the boulevard. */
export function PalmTree({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const frondAngles = [-55, -25, 0, 25, 55];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} opacity={0.8}>
      <path d="M0,0 C5,-20 -4,-38 2,-58" stroke="var(--accent)" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.65} />
      {frondAngles.map((angle) => (
        <path
          key={angle}
          d="M2,-58 C 20,-64 33,-52 37,-40"
          stroke="var(--accent)"
          strokeWidth={2.25}
          fill="none"
          strokeLinecap="round"
          opacity={0.55}
          transform={`rotate(${angle} 2 -58)`}
        />
      ))}
    </g>
  );
}

/** A pagoda-roofed theater silhouette (a nod to the Chinese Theatre)
 *  marking the finish of the boulevard, just behind the trophy. */
export function TheaterMarker({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={0.85}>
      <rect x={-40} y={-8} width={7} height={44} fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={1.5} />
      <rect x={33} y={-8} width={7} height={44} fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={1.5} />
      <path d="M-52,-8 L0,-32 L52,-8 Z" fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={1.75} strokeLinejoin="round" />
      <path d="M-38,-26 L0,-46 L38,-26 Z" fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={1.75} strokeLinejoin="round" />
      <circle cx={0} cy={-50} r={3} fill="var(--accent)" />
    </g>
  );
}
