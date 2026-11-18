import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Trophy, Users } from 'lucide-react';
import { LETTERS, TEAM_SYMBOLS, type RankedPlayer, type RankedTeam } from '../lib/game';
import type { Lab, Team } from '../lib/types';

// ───────── Buttons ─────────

type Variant = 'yellow' | 'green' | 'navy' | 'purple' | 'red' | 'ghost';
const VARIANT: Record<Variant, string> = {
  yellow: 'bg-gradient-to-b from-[#ffe25a] via-[#ffc41f] to-[#ff9d0a] text-[#0d1a5c] shadow-[0_0_0_3px_#38e1ff,0_0_28px_rgba(255,200,40,0.7),inset_0_-6px_0_rgba(180,90,0,0.45)]',
  green: 'bg-gradient-to-b from-[#4dff86] via-[#18c94a] to-[#0b8f2f] text-white shadow-[0_0_0_3px_#9dffb9,0_0_28px_rgba(61,255,122,0.6),inset_0_-6px_0_rgba(0,70,20,0.45)]',
  navy: 'bg-gradient-to-b from-[#173a9e] to-[#0a1a63] text-white shadow-[0_0_0_2px_#38e1ff,0_0_18px_rgba(56,225,255,0.55),inset_0_0_14px_rgba(56,225,255,0.2)]',
  purple: 'bg-gradient-to-b from-[#4a1fb8] to-[#22106e] text-white shadow-[0_0_0_2px_#c78bff,0_0_20px_rgba(162,75,255,0.6),inset_0_0_14px_rgba(200,140,255,0.25)]',
  red: 'bg-gradient-to-b from-[#ff4d6d] to-[#b3122f] text-white shadow-[0_0_0_2px_#ff9db0,0_0_18px_rgba(255,60,100,0.55)]',
  ghost: 'bg-white/5 text-white ring-1 ring-white/20 hover:bg-white/10',
};

export function GameButton({ variant = 'navy', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <motion.button
      whileHover={rest.disabled ? undefined : { scale: 1.03 }}
      whileTap={rest.disabled ? undefined : { scale: 0.96 }}
      className={`game-title inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 transition-[filter,opacity] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
}

// ───────── Chips, dots, badges ─────────

export function StatChip({ icon, value, label, className = '' }: { icon: ReactNode; value: ReactNode; label: string; className?: string }) {
  return (
    <div className={`chip flex items-center gap-3 px-4 py-2 ${className}`}>
      <span className="text-[#bfe9ff]">{icon}</span>
      <div className="leading-tight text-center">
        <div className="game-title text-2xl text-white">{value}</div>
        <div className="text-xs font-extrabold text-white/80">{label}</div>
      </div>
    </div>
  );
}

export function ProgressDots({ total, current, className = '' }: { total: number; current: number; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block h-[0.9em] w-[0.9em] rounded-full border-2 ${i < current ? 'bg-[#38e1ff] border-[#9ff3ff] shadow-[0_0_8px_#38e1ff]' : 'bg-[#1d2a6b] border-[#5a6bb5]'}`}
        />
      ))}
    </div>
  );
}

export function TeamBadge({ teamId, team, size = 28 }: { teamId?: string; team?: Team; size?: number }) {
  const idx = team?.order ?? Number(teamId?.slice(1) ?? 0);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.62, background: `radial-gradient(circle at 35% 30%, ${team?.color ?? '#2f9bff'}, #0a1440 120%)`, boxShadow: `0 0 0 2px #fff6, 0 0 10px ${team?.color ?? '#2f9bff'}` }}
    >
      {TEAM_SYMBOLS[idx % TEAM_SYMBOLS.length]}
    </span>
  );
}

export const LAB_STYLE: Record<Lab | 'mixed', { color: string; name: string; ring: string }> = {
  biology: { color: '#35d64a', name: 'Biology Lab', ring: 'from-[#5dff6e] to-[#0e8f25]' },
  physics: { color: '#2f9bff', name: 'Physics Lab', ring: 'from-[#58c4ff] to-[#1446c9]' },
  chemistry: { color: '#a64dff', name: 'Chemistry Lab', ring: 'from-[#cf8bff] to-[#5b17b3]' },
  mixed: { color: '#f5b301', name: 'Final Challenge', ring: 'from-[#ffe066] to-[#c27a00]' },
};

// ───────── Answer tiles (A red, B blue, C yellow, D green) ─────────

export const ANSWER_STYLE = [
  { bg: 'from-[#ff3b6b] via-[#e8164f] to-[#b40b39]', glow: '#ff2e63', letter: '#e8164f' },
  { bg: 'from-[#3d8bff] via-[#1f6bff] to-[#0f45c4]', glow: '#2f7bff', letter: '#1f6bff' },
  { bg: 'from-[#ffd84a] via-[#f5b301] to-[#d98a00]', glow: '#ffc21a', letter: '#c67a00' },
  { bg: 'from-[#3ee067] via-[#18b43c] to-[#0b7f27]', glow: '#2fe05a', letter: '#159c34' },
];

export function AnswerTile({ index, text, state = 'normal', count, className = '', onClick, disabled, size = 'lg' }: {
  index: number; text?: string; state?: 'normal' | 'correct' | 'dim' | 'selected'; count?: number; className?: string;
  onClick?: () => void; disabled?: boolean; size?: 'lg' | 'xl';
}) {
  const s = ANSWER_STYLE[index % 4];
  const Tag: any = onClick ? motion.button : motion.div;
  return (
    <Tag
      onClick={onClick}
      disabled={disabled}
      whileTap={onClick && !disabled ? { scale: 0.95 } : undefined}
      animate={state === 'correct' ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.6 }}
      className={`relative flex w-full items-center gap-4 rounded-[28px] bg-gradient-to-b ${s.bg} px-4 text-left text-white transition-opacity ${state === 'dim' ? 'opacity-30 saturate-50' : ''} ${size === 'xl' ? 'py-5' : 'py-3'} ${className}`}
      style={{ boxShadow: `0 0 0 3px ${state === 'correct' ? '#fff' : 'rgba(255,255,255,0.55)'}, 0 0 ${state === 'correct' ? 40 : 22}px ${s.glow}, inset 0 -6px 0 rgba(0,0,0,0.2)` }}
      aria-label={`Answer ${LETTERS[index]}${text ? `: ${text}` : ''}`}
    >
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-white font-display"
        style={{ color: s.letter, width: size === 'xl' ? '2.6em' : '2.1em', height: size === 'xl' ? '2.6em' : '2.1em', fontSize: size === 'xl' ? '1.8em' : '1.5em', boxShadow: `0 0 0 4px ${s.glow}55` }}
      >
        {LETTERS[index]}
      </span>
      {text !== undefined && <span className="game-title flex-1 text-center text-[1.6em] leading-tight drop-shadow">{text}</span>}
      {count !== undefined && <span className="game-title rounded-full bg-black/25 px-3 py-1 text-[1.1em]">{count}</span>}
      {state === 'correct' && <span className="absolute -right-2 -top-3 rounded-full bg-white px-2 text-lg text-green-600 shadow">✓</span>}
    </Tag>
  );
}

// ───────── Countdown ─────────

export function useRemaining(timer: { startedAt?: number | null; accMs?: number; timeLimit?: number } | undefined, serverNow: () => number, running: boolean) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, [running, serverNow]);
  if (!timer?.timeLimit) return { remainingMs: 0, fraction: 0 };
  const elapsed = (timer.accMs ?? 0) + (running && typeof timer.startedAt === 'number' ? Math.max(0, now - timer.startedAt) : 0);
  const remainingMs = Math.max(0, timer.timeLimit * 1000 - elapsed);
  return { remainingMs, fraction: remainingMs / (timer.timeLimit * 1000) };
}

export function CountdownRing({ remainingMs, fraction, size = 170, paused = false }: { remainingMs: number; fraction: number; size?: number; paused?: boolean }) {
  const r = 70, c = 2 * Math.PI * r;
  const secs = Math.ceil(remainingMs / 1000);
  const urgent = secs <= 5 && secs > 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 170 170" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#38e1ff" />
            <stop offset="1" stopColor="#a24bff" />
          </linearGradient>
        </defs>
        <circle cx="85" cy="85" r="80" fill="#0a1450" stroke="rgba(56,225,255,0.35)" strokeWidth="3" />
        <circle cx="85" cy="85" r={r} fill="none" stroke="#1a2a74" strokeWidth="12" />
        <circle cx="85" cy="85" r={r} fill="none" stroke={urgent ? '#ff3b6b' : 'url(#ring)'} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} style={{ transition: 'stroke-dashoffset 0.25s linear', filter: 'drop-shadow(0 0 6px #38e1ff)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`game-title not-italic leading-none ${urgent ? 'text-[#ff6b8b]' : 'text-white'}`} style={{ fontSize: size * 0.32 }}>{paused ? '❚❚' : secs}</span>
        <span className="font-extrabold text-white/90" style={{ fontSize: size * 0.1 }}>{paused ? 'paused' : 'seconds'}</span>
      </div>
    </div>
  );
}

// ───────── Leaderboards ─────────

const AVATAR_COLORS = ['#ff7a59', '#ffb020', '#3dd6a0', '#4aa8ff', '#b07bff', '#ff5fa2', '#40c9ff', '#8bd448'];
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-black text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: AVATAR_COLORS[h % AVATAR_COLORS.length], boxShadow: '0 0 0 2px #fff8' }}>
      {initials}
    </span>
  );
}

export function IndividualLeaderboard({ players, teams, limit = 10, title = 'INDIVIDUAL LEADERBOARD', className = '' }: { players: RankedPlayer[]; teams: Record<string, Team>; limit?: number; title?: string; className?: string }) {
  return (
    <div className={`neon-panel flex flex-col p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-center gap-2 text-center">
        <Users className="h-7 w-7 text-white" />
        <h3 className="game-title text-[1.15em] leading-tight">{title}</h3>
      </div>
      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {players.slice(0, limit).map((p) => (
            <motion.div
              layout
              key={p.uid}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={`flex items-center gap-2 rounded-xl px-2 py-1 ${p.rank === 1 ? 'bg-gradient-to-r from-[#ffd23f] to-[#f59e0b] text-[#2a1a00]' : 'bg-[#0b1a5c]/80 ring-1 ring-[#38e1ff]/30'}`}
            >
              <span className="game-title w-6 text-center">{p.rank}</span>
              <Avatar name={p.name} size={26} />
              <span className="flex-1 truncate font-extrabold">{p.name}</span>
              {p.teamId && teams[p.teamId] && <TeamBadge teamId={p.teamId} team={teams[p.teamId]} size={18} />}
              <span className={`game-title tabular-nums ${p.rank === 1 ? '' : 'text-[#ffd23f]'}`}>{p.total.toLocaleString('en-GB')}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {!players.length && <p className="py-4 text-center text-sm text-white/60">Scores appear after the first correction.</p>}
      </div>
    </div>
  );
}

export function TeamLeaderboard({ teams, className = '', title = 'TEAM LEADERBOARD' }: { teams: (RankedTeam & { order?: number })[]; className?: string; title?: string }) {
  return (
    <div className={`neon-panel p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-center gap-2">
        <Trophy className="h-7 w-7 text-[#ffd23f]" />
        <h3 className="game-title text-[1.15em]">{title}</h3>
      </div>
      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {teams.map((t) => (
            <motion.div
              layout
              key={t.teamId}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex items-center gap-2 rounded-full px-2 py-1"
              style={{ background: t.rank === 1 ? 'linear-gradient(90deg,#ffd23f,#f59e0b)' : `linear-gradient(90deg, ${t.color}cc, ${t.color}55)`, boxShadow: `0 0 10px ${t.color}88` }}
            >
              <span className={`game-title flex h-7 w-7 items-center justify-center rounded-full ${t.rank === 1 ? 'bg-[#0d1a5c] text-[#ffd23f]' : 'bg-white/90 text-[#0d1a5c]'}`}>{t.rank}</span>
              <TeamBadge teamId={t.teamId} team={{ name: t.name, color: t.color, order: Number(t.teamId.slice(1)) }} size={26} />
              <span className={`game-title flex-1 truncate ${t.rank === 1 ? 'text-[#2a1a00]' : ''}`}>{t.name}</span>
              <span className={`game-title tabular-nums ${t.rank === 1 ? 'text-[#2a1a00]' : ''}`}>{t.total.toLocaleString('en-GB')}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ───────── 16:9 stage for projector screens ─────────

/** Renders children on a fixed 1920×1080 canvas scaled to fit the window (letterboxed). */
export function Stage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden">
      <div ref={ref} className="relative shrink-0" style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'center' }}>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block h-6 w-6 rounded-full border-[3px] border-dotted border-[#38e1ff] animate-spin ${className}`} aria-hidden />
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, opacity: 0 }} className={`neon-panel my-6 w-full ${wide ? 'max-w-6xl' : 'max-w-2xl'} p-5`} role="dialog" aria-label={title}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="game-title text-2xl">{title}</h2>
              <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1 text-lg hover:bg-white/20" aria-label="Close">✕</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);
  const node = (
    <AnimatePresence>
      {msg && (
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className={`fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 font-extrabold shadow-xl ${msg.tone === 'ok' ? 'bg-[#18b43c]' : 'bg-[#e8164f]'}`} role="status">
          {msg.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
  return { node, ok: (text: string) => setMsg({ text, tone: 'ok' }), err: (text: string) => setMsg({ text, tone: 'err' }) };
}
