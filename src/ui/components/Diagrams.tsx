// Small line drawings for the photo school. They use the theme colors, so they
// work in light and dark mode.

const txt = { fontSize: 11, fill: 'var(--muted)', fontFamily: 'var(--font-ui)' } as const;
const strong = { fontSize: 11.5, fill: 'var(--text)', fontFamily: 'var(--font-ui)', fontWeight: 600 } as const;

function Mini({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  // a tiny figure on a round base, seen from the side
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="13" ry="3.5" fill="var(--surface-2)" stroke="var(--text)" stroke-width="1.4" />
      <path d="M-5 -3 L-4 -18 Q0 -22 4 -18 L5 -3 Z" fill="var(--surface-2)" stroke="var(--text)" stroke-width="1.4" />
      <circle cx="0" cy="-25" r="5" fill="var(--surface-2)" stroke="var(--text)" stroke-width="1.4" />
      <path d="M6 -16 L14 -30" stroke="var(--text)" stroke-width="1.4" stroke-linecap="round" />
    </g>
  );
}

function Phone({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x="-6" y="-16" width="12" height="32" rx="3" fill="var(--surface)" stroke="var(--text)" stroke-width="1.5" />
      <circle cx="0" cy="-11" r="1.6" fill="var(--text)" />
    </g>
  );
}

function Lamp({ x, y, rot }: { x: number; y: number; rot: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M0 0 L-38 95 L38 95 Z" fill="var(--accent)" opacity=".13" />
      <rect x="-16" y="-8" width="32" height="12" rx="2" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.6" />
    </g>
  );
}

/** Top-down view: two lights at 45°, background curve, phone in front. */
export function LightSetupDiagram() {
  return (
    <svg viewBox="0 0 340 290" class="diagram" role="img" aria-label="Lichtaufbau von oben: Hauptlicht links vorne im 45-Grad-Winkel, Aufhelllicht rechts vorne, Hintergrundpapier hinter der Miniatur, Handy davor.">
      <path d="M40 40 Q170 18 300 40" fill="none" stroke="var(--muted)" stroke-width="2" />
      <text x="170" y="22" text-anchor="middle" style={txt}>
        Hintergrund (Hohlkehle)
      </text>
      <circle cx="170" cy="115" r="16" fill="var(--surface-2)" stroke="var(--text)" stroke-width="1.6" />
      <circle cx="170" cy="115" r="5" fill="var(--text)" />
      <text x="170" y="146" text-anchor="middle" style={strong}>
        Miniatur
      </text>
      <line x1="170" y1="115" x2="72" y2="213" stroke="var(--line)" stroke-dasharray="4 4" />
      <line x1="170" y1="115" x2="268" y2="213" stroke="var(--line)" stroke-dasharray="4 4" />
      <path d="M140 145 A 42 42 0 0 1 128 115" fill="none" stroke="var(--muted)" />
      <text x="118" y="152" style={txt}>
        45°
      </text>
      <g transform="translate(72 213) rotate(135)">
        <path d="M0 0 L-30 80 L30 80 Z" fill="var(--accent)" opacity=".14" />
        <rect x="-16" y="-7" width="32" height="12" rx="2" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.6" />
      </g>
      <text x="52" y="248" text-anchor="middle" style={strong}>
        Hauptlicht
      </text>
      <text x="52" y="262" text-anchor="middle" style={txt}>
        näher, mit Diffusor
      </text>
      <g transform="translate(268 213) rotate(-135)">
        <path d="M0 0 L-30 80 L30 80 Z" fill="var(--accent)" opacity=".08" />
        <rect x="-16" y="-7" width="32" height="12" rx="2" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="3 2" />
      </g>
      <text x="286" y="248" text-anchor="middle" style={strong}>
        Aufheller
      </text>
      <text x="286" y="262" text-anchor="middle" style={txt}>
        Lampe oder Karton
      </text>
      <g transform="translate(170 250) rotate(90)">
        <rect x="-8" y="-16" width="16" height="32" rx="3" fill="var(--surface)" stroke="var(--text)" stroke-width="1.5" />
      </g>
      <text x="170" y="280" text-anchor="middle" style={strong}>
        Handy auf Stativ
      </text>
    </svg>
  );
}

/** Side view: paper sweep, mini on the flat part, camera at eye level. */
export function SweepDiagram() {
  return (
    <svg viewBox="0 0 340 200" class="diagram" role="img" aria-label="Seitenansicht einer Hohlkehle: Papier läuft in einem Bogen von der Tischplatte die Wand hinauf, die Miniatur steht auf dem flachen Teil, das Handy auf ihrer Augenhöhe.">
      <line x1="10" y1="170" x2="330" y2="170" stroke="var(--line)" stroke-width="2" />
      <text x="16" y="188" style={txt}>
        Tisch
      </text>
      <line x1="290" y1="20" x2="290" y2="170" stroke="var(--line)" stroke-width="2" />
      <path d="M120 166 L230 166 Q286 166 286 110 L286 24" fill="none" stroke="var(--accent)" stroke-width="3" />
      <text x="120" y="36" style={strong}>
        Papier im Bogen
      </text>
      <text x="120" y="50" style={txt}>
        keine Kante, kein Horizont
      </text>
      <Mini x={180} y={163} s={1.2} />
      <Phone x={60} y={138} rot={90} />
      <line x1="72" y1="138" x2="176" y2="138" stroke="var(--muted)" stroke-dasharray="4 4" />
      <text x="60" y="118" text-anchor="middle" style={strong}>
        Augenhöhe
      </text>
      <path d="M196 104 H274 M196 100 v8 M274 100 v8" stroke="var(--muted)" stroke-width="1.4" fill="none" />
      <text x="235" y="96" text-anchor="middle" style={txt}>
        15–30 cm
      </text>
    </svg>
  );
}

/** Side by side: shot from above vs. at eye level. */
export function AngleDiagram() {
  return (
    <svg viewBox="0 0 340 170" class="diagram" role="img" aria-label="Vergleich: Von schräg oben fotografiert wirkt die Miniatur gestaucht und das Gesicht ist versteckt. Auf Augenhöhe wirkt sie natürlich.">
      <g>
        <line x1="10" y1="140" x2="160" y2="140" stroke="var(--line)" stroke-width="2" />
        <Mini x={100} y={136} s={1.3} />
        <Phone x={36} y={40} rot={135} />
        <line x1="46" y1="50" x2="92" y2="108" stroke="var(--muted)" stroke-dasharray="4 4" />
        <circle cx="30" cy="100" r="11" fill="none" stroke="var(--bad)" stroke-width="2" />
        <path d="M24 94l12 12M36 94l-12 12" stroke="var(--bad)" stroke-width="2" />
        <text x="85" y="162" text-anchor="middle" style={txt}>
          von oben: flach, Gesicht weg
        </text>
      </g>
      <g>
        <line x1="180" y1="140" x2="330" y2="140" stroke="var(--line)" stroke-width="2" />
        <Mini x={280} y={136} s={1.3} />
        <Phone x={205} y={104} rot={90} />
        <line x1="217" y1="104" x2="270" y2="104" stroke="var(--muted)" stroke-dasharray="4 4" />
        <circle cx="205" cy="60" r="11" fill="none" stroke="var(--good)" stroke-width="2" />
        <path d="M199 60l4 4 8-8" stroke="var(--good)" stroke-width="2" fill="none" />
        <text x="255" y="162" text-anchor="middle" style={txt}>
          Augenhöhe: wie im Maßstab 1:1
        </text>
      </g>
    </svg>
  );
}

/** A cardboard light box, seen from the side. */
export function LightBoxDiagram() {
  const paper = { stroke: 'var(--accent)', 'stroke-width': 5, 'stroke-dasharray': '7 4', fill: 'none' } as const;
  return (
    <svg viewBox="0 0 340 200" class="diagram" role="img" aria-label="Lichtzelt aus einem Karton, Seitenansicht: Deckel und Seitenwand haben Fenster aus Backpapier, Lampen leuchten von außen hinein, innen liegt ein weißer Karton im Bogen, vorne ist der Karton offen und das Handy schaut hinein.">
      <Lamp x={188} y={14} rot={0} />
      <Lamp x={322} y={106} rot={90} />
      <path d="M110 50 H262 V162 H110" fill="none" stroke="var(--text)" stroke-width="2" />
      <path d="M110 50 v14 M110 162 v-14" stroke="var(--text)" stroke-width="2" />
      <path d="M138 50 H236" {...paper} />
      <path d="M262 74 V140" {...paper} />
      <path d="M128 158 H222 Q250 158 250 130 V62" fill="none" stroke="var(--muted)" stroke-width="2.5" />
      <Mini x={176} y={155} s={1.05} />
      <Phone x={58} y={126} rot={90} />
      <line x1="70" y1="126" x2="166" y2="126" stroke="var(--muted)" stroke-dasharray="4 4" />
      <text x="334" y="40" text-anchor="end" style={strong}>
        Backpapier-Fenster
      </text>
      <text x="334" y="160" text-anchor="end" style={txt}>
        Lampen außen
      </text>
      <text x="16" y="104" style={txt}>
        vorne offen
      </text>
      <text x="186" y="188" text-anchor="middle" style={txt}>
        innen: weißer Karton im Bogen
      </text>
    </svg>
  );
}
