import { motion } from 'framer-motion';

import personaUrl from '../assets/mrs-sarra.png';

export function FlaskIcon({ size = 64, liquid = '#b04bff' }: { size?: number; liquid?: string }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 64 70" aria-hidden>
      <defs>
        <linearGradient id="flask-liq" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5fe1" />
          <stop offset="1" stopColor={liquid} />
        </linearGradient>
      </defs>
      <path d="M24 4h16v4h-3v16l18 32c3 6-1 12-8 12H17c-7 0-11-6-8-12l18-32V8h-3z" fill="rgba(220,240,255,0.25)" stroke="#e8f6ff" strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 46h36l6 11c2 5-1 9-6 9H14c-5 0-8-4-6-9z" fill="url(#flask-liq)" />
      <circle cx="26" cy="54" r="3" fill="#fff" opacity="0.7" />
      <circle cx="36" cy="58" r="2" fill="#fff" opacity="0.6" />
      <circle cx="32" cy="38" r="2.5" fill="#ff8af0" />
      <path d="M22 26 l-4 8" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function AtomIcon({ size = 64, spin = true }: { size?: number; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className={spin ? 'animate-glow' : ''}>
      <g fill="none" stroke="#5eeaff" strokeWidth="4">
        <ellipse cx="50" cy="50" rx="44" ry="16" />
        <ellipse cx="50" cy="50" rx="44" ry="16" transform="rotate(60 50 50)" />
        <ellipse cx="50" cy="50" rx="44" ry="16" transform="rotate(-60 50 50)" />
      </g>
      <circle cx="50" cy="50" r="10" fill="#ffd23f" stroke="#fff" strokeWidth="2" />
      <circle cx="86" cy="22" r="5" fill="#ff5fe1" />
    </svg>
  );
}

/** "SCIENCE QUEST — THE THREE LABS" logo, drawn in SVG so it stays crisp at any size. */
export function Logo({ width = 360, className = '' }: { width?: number; className?: string }) {
  return (
    <svg width={width} viewBox="0 0 520 250" className={className} role="img" aria-label="Science Quest — The Three Labs">
      <defs>
        <linearGradient id="lg-sci" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#d6f3ff" />
          <stop offset="1" stopColor="#7fd3ff" />
        </linearGradient>
        <linearGradient id="lg-quest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff36b" />
          <stop offset="0.5" stopColor="#ffc21a" />
          <stop offset="1" stopColor="#ff8a00" />
        </linearGradient>
        <filter id="lg-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#38e1ff" floodOpacity="0.85" />
        </filter>
      </defs>
      <g filter="url(#lg-glow)">
        <text x="270" y="92" textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize="96" fill="url(#lg-sci)" stroke="#0b2a8a" strokeWidth="12" paintOrder="stroke" strokeLinejoin="round" transform="skewX(-6)">SCIENCE</text>
        <text x="282" y="172" textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize="94" fill="url(#lg-quest)" stroke="#0b2a8a" strokeWidth="12" paintOrder="stroke" strokeLinejoin="round" transform="skewX(-6)">QUEST</text>
      </g>
      <g transform="translate(6 70) rotate(-12)"><FlaskSvgInner /></g>
      <g transform="translate(430 70)"><AtomSvgInner /></g>
      <g transform="translate(110 186)">
        <path d="M0 26 L22 2 H278 L300 26 L278 50 H22 Z" fill="#0b1a66" stroke="#38e1ff" strokeWidth="4" />
        <text x="150" y="36" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontStyle="italic" fontSize="28" fill="#fff" letterSpacing="1">THE THREE LABS</text>
      </g>
    </svg>
  );
}

function FlaskSvgInner() {
  return (
    <g>
      <path d="M30 4h20v5h-4v20l22 40c4 7-1 15-10 15H22c-9 0-14-8-10-15l22-40V9h-4z" fill="rgba(220,240,255,0.3)" stroke="#e8f6ff" strokeWidth="4" strokeLinejoin="round" />
      <path d="M17 56h46l8 14c2 6-1 10-8 10H17c-7 0-10-4-8-10z" fill="#c04bff" />
      <circle cx="32" cy="66" r="4" fill="#ff9af2" />
      <circle cx="46" cy="72" r="3" fill="#fff" opacity="0.7" />
    </g>
  );
}

function AtomSvgInner() {
  return (
    <g>
      <g fill="none" stroke="#5eeaff" strokeWidth="5">
        <ellipse cx="40" cy="45" rx="40" ry="15" />
        <ellipse cx="40" cy="45" rx="40" ry="15" transform="rotate(60 40 45)" />
        <ellipse cx="40" cy="45" rx="40" ry="15" transform="rotate(-60 40 45)" />
      </g>
      <circle cx="40" cy="45" r="9" fill="#ffd23f" stroke="#fff" strokeWidth="2" />
      <circle cx="74" cy="16" r="5" fill="#ff5fe1" />
    </g>
  );
}

/** Mrs Sarra — the official Science Quest character. */
export function Persona({ className = '', float = true }: { className?: string; float?: boolean }) {
  return (
    <motion.img
      src={personaUrl}
      alt="Mrs Sarra, your Science Quest host"
      draggable={false}
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
      className={`select-none pointer-events-none drop-shadow-[0_0_25px_rgba(56,225,255,0.35)] ${float ? 'animate-float' : ''} ${className}`}
    />
  );
}

export function Background() {
  return (
    <div className="sq-bg" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${(i * 73) % 100}%`, bottom: `${8 + ((i * 37) % 30)}%`, width: 6 + (i % 4) * 3, height: 6 + (i % 4) * 3,
            background: ['#38e1ff', '#a24bff', '#3dff7a', '#ff4fd8'][i % 4], opacity: 0.6,
            boxShadow: '0 0 10px currentColor', animation: `bubble ${6 + (i % 5)}s ease-in ${i * 0.7}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function CreatedBy({ className = '' }: { className?: string }) {
  return <p className={`text-xs text-white/70 ${className}`}>Created by <span className="font-extrabold text-white">Mrs Sarra Ben Amara</span></p>;
}
