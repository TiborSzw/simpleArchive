/** Decorative backdrop for the welcome screen: a row of display niches in gold outline. */
export function Backdrop() {
  const niches = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg class="backdrop" viewBox="0 0 700 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="bd-glow" cx="50%" cy="35%" r="70%">
          <stop offset="0" stop-color="var(--accent)" stop-opacity=".16" />
          <stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="700" height="400" fill="url(#bd-glow)" />
      {niches.map((i) => {
        const x = 20 + i * 96;
        return (
          <g key={i} opacity={0.09 + (i % 3) * 0.03}>
            <path d={`M${x} 360 V150 A40 40 0 0 1 ${x + 80} 150 V360`} fill="none" stroke="var(--accent)" stroke-width="1.5" />
            <ellipse cx={x + 40} cy="330" rx="22" ry="6" fill="none" stroke="var(--accent)" stroke-width="1.2" />
          </g>
        );
      })}
    </svg>
  );
}
