import type { ReactNode } from 'react';
import type { DiagramSpec } from '../lib/types';

/** Aspect ratio (width / height) of each diagram kind. */
export function diagramAspect(d: DiagramSpec): number {
  if (d.kind === 'image') return d.aspect ?? 16 / 9;
  if (d.kind === 'sequence') return d.vertical ? 3 / 4 : 16 / 6;
  return 16 / 9;
}

export function DiagramArt({ diagram }: { diagram: DiagramSpec }) {
  switch (diagram.kind) {
    case 'carbon-cycle': return <CarbonCycleArt />;
    case 'sequence': return <SequenceArt />;
    case 'balance-cylinder': return <BalanceCylinderArt mass={diagram.mass} volume={diagram.volume} object={diagram.object} />;
    case 'image': return <img src={diagram.src} alt="" className="h-full w-full object-contain" draggable={false} />;
  }
}

/** A diagram with absolutely-positioned zones (% coordinates). */
export function DiagramWithZones({ diagram, zones, renderZone, className = '' }: {
  diagram: DiagramSpec;
  zones: { id: string; x: number; y: number; w: number; h: number; label?: string }[];
  renderZone: (z: { id: string; label?: string }) => ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl ${className}`} style={{ aspectRatio: String(diagramAspect(diagram)), containerType: 'inline-size' } as any}>
      <div className="absolute inset-0"><DiagramArt diagram={diagram} /></div>
      {zones.map((z) => (
        <div key={z.id} className="absolute" style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}>
          {renderZone(z)}
        </div>
      ))}
    </div>
  );
}

const Arrow = ({ d }: { d: string }) => (
  <g>
    <path d={d} fill="none" stroke="#8a5a00" strokeWidth="22" strokeLinecap="round" opacity="0.35" />
    <path d={d} fill="none" stroke="url(#cc-arrow)" strokeWidth="14" strokeLinecap="round" markerEnd="url(#cc-head)" />
  </g>
);

/**
 * Carbon cycle (Science Quest B12 specification):
 *  CO₂ in air → plant (photosynthesis) · plant → rabbit (feeding)
 *  rabbit → CO₂ in air (respiration) · dead material → decomposers (decomposition)
 */
export function CarbonCycleArt() {
  return (
    <svg viewBox="0 0 1600 900" className="h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Carbon cycle diagram: air, plant, rabbit, dead material and decomposers">
      <defs>
        <linearGradient id="cc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3aa0ff" /><stop offset="0.7" stopColor="#bfe6ff" /></linearGradient>
        <linearGradient id="cc-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fbf3b" /><stop offset="0.12" stopColor="#3d8f27" /><stop offset="0.2" stopColor="#6b4423" /><stop offset="1" stopColor="#3b2412" /></linearGradient>
        <linearGradient id="cc-arrow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffe36b" /><stop offset="1" stopColor="#ffb21a" /></linearGradient>
        <marker id="cc-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#ffb21a" stroke="#8a5a00" strokeWidth="0.8" />
        </marker>
      </defs>
      <rect width="1600" height="900" fill="url(#cc-sky)" />
      <circle cx="120" cy="110" r="60" fill="#fff6b0" opacity="0.9" />
      {/* clouds & trees */}
      {[[300, 120], [1250, 90], [1450, 180]].map(([x, y], i) => (
        <g key={i} fill="#fff" opacity="0.85"><ellipse cx={x} cy={y} rx="80" ry="28" /><ellipse cx={x + 40} cy={y - 18} rx="50" ry="26" /></g>
      ))}
      {[[60, 560, 120], [1540, 540, 130], [1080, 600, 90], [520, 610, 80]].map(([x, y, r], i) => (
        <g key={i}>
          <rect x={x - 12} y={y} width="24" height="160" fill="#6b4423" />
          <circle cx={x} cy={y - r * 0.3} r={r} fill="#2f8f3a" /><circle cx={x - r * 0.6} cy={y} r={r * 0.7} fill="#3aa847" /><circle cx={x + r * 0.6} cy={y + 5} r={r * 0.7} fill="#37a043" />
        </g>
      ))}
      <path d="M0 640 Q400 580 800 640 T1600 630 V900 H0 Z" fill="#7fd05a" opacity="0.6" />
      <path d="M0 720 H1600 V900 H0 Z" fill="url(#cc-ground)" />

      {/* CO₂ in the air */}
      <g>
        <rect x="560" y="36" width="480" height="128" rx="64" fill="#eef6ff" stroke="#fff" strokeWidth="6" />
        <text x="800" y="94" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="44" fill="#0d1a5c">Carbon dioxide</text>
        <text x="800" y="142" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="44" fill="#0d1a5c">in the air</text>
      </g>

      {/* Plant */}
      <g transform="translate(260 520)">
        <path d="M30 200 C 26 140 34 80 30 10" stroke="#2b7a1f" strokeWidth="12" fill="none" />
        {[[-70, 60, -30], [80, 40, 30], [-60, 120, -20], [70, 120, 25], [-30, 10, -60], [40, -5, 55]].map(([x, y, r], i) => (
          <ellipse key={i} cx={30 + x / 2} cy={y + 20} rx="58" ry="24" fill={i % 2 ? '#46c23a' : '#38a82c'} stroke="#1f6b17" strokeWidth="3" transform={`rotate(${r} ${30 + x / 2} ${y + 20})`} />
        ))}
      </g>
      <Label x={290} y={780} text="Plant" />

      {/* Rabbit */}
      <g transform="translate(840 640)">
        <ellipse cx="60" cy="110" rx="80" ry="56" fill="#b98a5e" stroke="#6b4a2b" strokeWidth="4" />
        <circle cx="128" cy="70" r="42" fill="#c49a6c" stroke="#6b4a2b" strokeWidth="4" />
        <ellipse cx="112" cy="8" rx="13" ry="46" fill="#c49a6c" stroke="#6b4a2b" strokeWidth="4" transform="rotate(-12 112 8)" />
        <ellipse cx="140" cy="4" rx="13" ry="46" fill="#c49a6c" stroke="#6b4a2b" strokeWidth="4" transform="rotate(10 140 4)" />
        <ellipse cx="112" cy="10" rx="5" ry="30" fill="#f2b7b0" transform="rotate(-12 112 10)" />
        <circle cx="144" cy="64" r="6" fill="#222" /><circle cx="146" cy="62" r="2" fill="#fff" />
        <circle cx="168" cy="80" r="5" fill="#e88" />
        <circle cx="-14" cy="104" r="16" fill="#fff" />
        <ellipse cx="90" cy="160" rx="26" ry="10" fill="#a0764d" />
      </g>
      <Label x={900} y={850} text="Rabbit" />

      {/* Dead material */}
      <g transform="translate(1110 760)">
        <rect x="0" y="20" width="170" height="44" rx="22" fill="#7a4b26" stroke="#4a2c14" strokeWidth="4" />
        <ellipse cx="170" cy="42" rx="14" ry="22" fill="#c08a5a" stroke="#4a2c14" strokeWidth="4" />
        {[[10, 16, '#c96b1d'], [50, 8, '#d9a02a'], [96, 14, '#a8461a'], [130, 6, '#d27d22'], [30, 60, '#b5561b'], [110, 62, '#cf9124']].map(([x, y, c], i) => (
          <ellipse key={i} cx={x as number} cy={y as number} rx="20" ry="9" fill={c as string} transform={`rotate(${i * 37} ${x} ${y})`} />
        ))}
      </g>
      <Label x={1195} y={860} text="Dead material" />

      {/* Decomposers */}
      <g transform="translate(1400 640)">
        {[[0, 60, 1], [70, 40, 1.3], [130, 80, 0.9]].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <rect x="-10" y="20" width="20" height="60" rx="8" fill="#f3e3c3" stroke="#8a6b3a" strokeWidth="3" />
            <path d="M-46 24 Q0 -40 46 24 Z" fill="#e0632b" stroke="#8a2f10" strokeWidth="3" />
            <circle cx="-16" cy="6" r="6" fill="#fff" /><circle cx="14" cy="0" r="5" fill="#fff" /><circle cx="28" cy="14" r="4" fill="#fff" />
          </g>
        ))}
      </g>
      <Label x={1480} y={790} text="Decomposers" />

      {/* Process arrows */}
      <Arrow d="M590 130 Q 330 160 300 470" />
      <Arrow d="M380 830 L 760 830" />
      <Arrow d="M900 620 Q 1010 400 930 190" />
      <Arrow d="M1180 770 Q 1300 520 1400 690" />
    </svg>
  );
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 17 + 30;
  return (
    <g>
      <rect x={x - w / 2} y={y - 26} width={w} height="38" rx="19" fill="#0d1a5c" opacity="0.85" />
      <text x={x} y={y} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="600" fontSize="26" fill="#fff">{text}</text>
    </g>
  );
}

export function SequenceArt() {
  return (
    <svg viewBox="0 0 1600 600" className="h-full w-full" role="img" aria-label="Four empty boxes joined by arrows">
      <defs>
        <linearGradient id="seq-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#173a9e" /><stop offset="1" stopColor="#0a1a63" /></linearGradient>
        <marker id="seq-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#ffd23f" /></marker>
      </defs>
      <rect width="1600" height="600" rx="40" fill="url(#seq-bg)" />
      {[0, 1, 2].map((i) => {
        const x = 1600 * (0.01 + 0.25 * i + 0.22) + 6;
        return <path key={i} d={`M${x} 300 L ${x + 60} 300`} stroke="#ffd23f" strokeWidth="16" markerEnd="url(#seq-head)" strokeLinecap="round" />;
      })}
      <text x="800" y="120" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="44" fill="#bfe9ff">Carbon moves this way →</text>
    </svg>
  );
}

/** Balance + measuring cylinder, as in the density question reference. */
export function BalanceCylinderArt({ mass, volume, object = 'rock' }: { mass: number; volume: number; object?: string }) {
  const max = Math.max(50, Math.ceil((volume * 1.25) / 10) * 10);
  const top = 150, bottom = 760;
  const level = bottom - ((bottom - top) * volume) / max;
  return (
    <svg viewBox="0 0 1600 900" className="h-full w-full" role="img" aria-label={`Balance showing ${mass} g and measuring cylinder showing ${volume} cm³`}>
      <defs>
        <linearGradient id="bc-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#123a8a" /><stop offset="1" stopColor="#0a1a50" /></linearGradient>
        <linearGradient id="bc-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fdcff" /><stop offset="1" stopColor="#2f8fff" /></linearGradient>
        <radialGradient id="bc-rock" cx="0.4" cy="0.35"><stop offset="0" stopColor="#d9d4cc" /><stop offset="1" stopColor="#6d665e" /></radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bc-bg)" />
      <rect y="770" width="1600" height="130" fill="#c9d4ea" opacity="0.25" />
      {/* balance */}
      <g transform="translate(220 560)">
        <path d="M40 210 L80 60 H520 L560 210 Z" fill="#cfd8ea" stroke="#fff" strokeWidth="4" />
        <rect x="60" y="30" width="480" height="34" rx="10" fill="#e6ecf7" stroke="#fff" strokeWidth="4" />
        <rect x="140" y="110" width="320" height="76" rx="14" fill="#0a1450" stroke="#38e1ff" strokeWidth="4" />
        <text x="300" y="162" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="46" fill="#fff">Mass = {mass} g</text>
        {object === 'block'
          ? <rect x="210" y="-90" width="180" height="120" rx="8" fill="#9aa6c4" stroke="#4a5577" strokeWidth="5" />
          : <path d="M190 30 C 170 -40 240 -110 320 -96 C 400 -110 440 -40 410 30 Z" fill="url(#bc-rock)" stroke="#4d463f" strokeWidth="4" />}
      </g>
      {/* cylinder */}
      <g transform="translate(980 0)">
        <rect x="80" y={level} width="200" height={bottom - level} fill="url(#bc-water)" opacity="0.85" />
        <path d={`M60 ${top - 40} H300 M80 ${top - 40} V${bottom + 10} Q80 ${bottom + 30} 100 ${bottom + 30} H260 Q280 ${bottom + 30} 280 ${bottom + 10} V${top - 40}`} fill="none" stroke="#e8f6ff" strokeWidth="8" />
        <rect x="40" y={bottom + 30} width="280" height="24" rx="10" fill="#e8f6ff" />
        {Array.from({ length: max / 10 + 1 }).map((_, i) => {
          const y = bottom - ((bottom - top) * i * 10) / max;
          return (
            <g key={i}>
              <line x1="80" x2="130" y1={y} y2={y} stroke="#fff" strokeWidth="4" />
              {i > 0 && <text x="140" y={y + 12} fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="34" fill="#fff">{i * 10}</text>}
            </g>
          );
        })}
        <text x="200" y={bottom - 20} fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="30" fill="#fff">mL</text>
        <rect x="320" y={level - 40} width="270" height="76" rx="38" fill="#eef6ff" />
        <text x="455" y={level + 12} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="38" fill="#0d1a5c">Volume = {volume} cm³</text>
      </g>
    </svg>
  );
}
