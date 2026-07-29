// Decorative Hollywood Boulevard landmarks that dress up the swervy path.
// Unlike the rest of Backlot (a strict single-gold-accent system), this one
// feature is meant to read as an actual place — a dusk-lit boulevard with
// a red carpet, a real (white) Hollywood sign, and a Chinese Theatre — so
// it deliberately borrows a few extra real-world colors (carpet red,
// pagoda jade, sign white) rather than staying monochrome gold-on-dark.

function sparklePath(cx: number, cy: number, s: number): string {
  return `M${cx},${cy - s} L${cx + s * 0.3},${cy - s * 0.3} L${cx + s},${cy} L${cx + s * 0.3},${cy + s * 0.3} L${cx},${cy + s} L${cx - s * 0.3},${cy + s * 0.3} L${cx - s},${cy} L${cx - s * 0.3},${cy - s * 0.3} Z`;
}

/** The dusk sky the whole boulevard sits under — sunset near the sign,
 *  fading down into Backlot's usual night. Renders its own <defs>, so it's
 *  safe to drop in once near the top of the board's SVG. */
export function BoulevardSky({
  width,
  totalHeight,
  bannerHeight,
}: {
  width: number;
  totalHeight: number;
  bannerHeight: number;
}) {
  return (
    <>
      <defs>
        <linearGradient id="boulevard-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b1b3d" />
          <stop offset="9%" stopColor="#6b3547" />
          <stop offset="18%" stopColor="#8a4a3d" />
          <stop offset="30%" stopColor="#1f1215" />
          <stop offset="100%" stopColor="#0c0706" />
        </linearGradient>
        <radialGradient id="boulevard-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e8965f" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#e8965f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={width} height={totalHeight} fill="url(#boulevard-sky)" />
      <circle cx={width / 2} cy={bannerHeight * 0.42} r={bannerHeight * 0.85} fill="url(#boulevard-sun)" />
    </>
  );
}

/** The hillside sign at the top of the boulevard, before day one — layered
 *  hills for depth, and real scaffolding legs under white block letters
 *  (the actual sign is white, not gold — realism over brand-matching
 *  here). */
export function HollywoodSignBanner({ width, height }: { width: number; height: number }) {
  const midX = width / 2;
  const backCrestY = height * 0.32;
  const frontCrestY = height * 0.58;
  const letters = "HOLLYWOOD".split("");
  const letterSpan = width * 0.62;
  const letterStart = midX - letterSpan / 2;
  const step = letterSpan / (letters.length - 1);
  const sparkles: [number, number][] = [
    [midX - width * 0.36, height * 0.14],
    [midX - width * 0.2, height * 0.06],
    [midX + width * 0.22, height * 0.1],
    [midX + width * 0.37, height * 0.2],
    [midX - width * 0.05, height * 0.04],
  ];
  return (
    <g>
      {/* back hill, further away, cooler and lighter */}
      <path
        d={`M0,${height} L0,${backCrestY + 20} Q${midX},${backCrestY - 30} ${width},${backCrestY + 10} L${width},${height} Z`}
        fill="#5a4152"
        opacity={0.8}
      />
      {/* front hill, the sign's actual hillside */}
      <path
        d={`M0,${height} L0,${frontCrestY} Q${midX},${frontCrestY - 55} ${width},${frontCrestY} L${width},${height} Z`}
        fill="#3d2e28"
        stroke="var(--border)"
        strokeWidth={1}
      />
      {sparkles.map(([sx, sy], i) => (
        <path key={i} d={sparklePath(sx, sy, 4)} fill="#f2ece0" opacity={0.55} />
      ))}
      {letters.map((letter, i) => {
        const lx = letterStart + i * step;
        const ly = frontCrestY - 46;
        return (
          <g key={i}>
            <line x1={lx} y1={ly + 14} x2={lx} y2={frontCrestY - 8} stroke="#3d2e28" strokeWidth={1.5} opacity={0.7} />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              fontSize={Math.min(30, width * 0.075)}
              fontWeight={800}
              fill="#f2ece0"
              stroke="#2b1f1c"
              strokeWidth={0.6}
              className="font-hollywood"
            >
              {letter}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** A palm tree silhouette lining the boulevard — layered fronds with a
 *  center rib, a tapered trunk with frond-scar texture, a small coconut
 *  cluster, and a ground shadow. */
export function PalmTree({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const frondAngles = [-70, -42, -18, 6, 30, 54, 78];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <ellipse cx={0} cy={2} rx={22} ry={5} fill="#000000" opacity={0.28} />
      <path
        d="M0,0 C6,-16 -6,-30 3,-46 C8,-56 -2,-64 4,-76"
        stroke="#5a4530"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
      />
      <path d="M0,0 C6,-16 -6,-30 3,-46 C8,-56 -2,-64 4,-76" stroke="#3d2e1f" strokeWidth={2} fill="none" opacity={0.6} />
      {[-58, -40, -22].map((notchY) => (
        <path key={notchY} d={`M-3,${notchY} q3,3 6,0`} stroke="#3d2e1f" strokeWidth={1.3} fill="none" opacity={0.55} />
      ))}
      {frondAngles.map((angle) => (
        <g key={angle} transform={`rotate(${angle} 4 -76)`}>
          <path
            d="M4,-76 C24,-84 46,-78 58,-58 C46,-66 26,-70 4,-76 Z"
            fill="#425a35"
            stroke="#2e402a"
            strokeWidth={0.75}
          />
          <path d="M4,-76 C24,-82 42,-76 55,-60" stroke="#5a7a4a" strokeWidth={1} fill="none" opacity={0.7} />
        </g>
      ))}
      {[[-3, -80], [3, -83], [8, -79]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.6} fill="#4a3420" />
      ))}
    </g>
  );
}

/** A pagoda-roofed theater silhouette (a nod to the Chinese Theatre) with
 *  lacquered red pillars, jade roof tiers, and gold trim — marking the
 *  finish of the boulevard, just behind the trophy. */
export function TheaterMarker({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-42} y={-8} width={9} height={46} rx={1.5} fill="#7a1f24" stroke="var(--accent)" strokeWidth={1.25} />
      <rect x={33} y={-8} width={9} height={46} rx={1.5} fill="#7a1f24" stroke="var(--accent)" strokeWidth={1.25} />
      <path d="M-56,-8 L0,-34 L56,-8 Z" fill="#1f5049" stroke="var(--accent)" strokeWidth={1.75} strokeLinejoin="round" />
      <path d="M-56,-8 Q-30,-2 0,-8 Q30,-2 56,-8" fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.7} />
      <path
        d="M-40,-28 Q-52,-24 -56,-8"
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path d="M40,-28 Q52,-24 56,-8" fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M-40,-26 L0,-48 L40,-26 Z" fill="#1f5049" stroke="var(--accent)" strokeWidth={1.75} strokeLinejoin="round" />
      <circle cx={0} cy={-52} r={3.5} fill="var(--accent)" />
      <path d="M0,-48 L0,-52" stroke="var(--accent)" strokeWidth={1.5} />
      <circle cx={-28} cy={-14} r={4} fill="#c94a3f" stroke="var(--accent)" strokeWidth={1} opacity={0.85} />
      <circle cx={28} cy={-14} r={4} fill="#c94a3f" stroke="var(--accent)" strokeWidth={1} opacity={0.85} />
    </g>
  );
}

/** A velvet-rope stanchion post flanking the red carpet. */
export function RopeStanchion({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-2} y={0} width={4} height={12} fill="var(--accent)" opacity={0.85} />
      <circle cy={-2} r={4} fill="var(--accent)" />
    </g>
  );
}
