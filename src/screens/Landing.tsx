import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Atom, Play, Settings, Sprout, FlaskConical } from 'lucide-react';
import { Logo, Persona, CreatedBy } from '../components/Brand';
import { Stage } from '../components/ui';
import { useIsPortrait } from '../hooks';

const PORTALS = [
  { name: 'BIOLOGY', from: '#7dff5a', to: '#1a9e1f', glow: '#49ff4a', Icon: Sprout },
  { name: 'PHYSICS', from: '#5ec8ff', to: '#1458e0', glow: '#38b6ff', Icon: Atom },
  { name: 'CHEMISTRY', from: '#d58bff', to: '#6a17c4', glow: '#c25bff', Icon: FlaskConical },
];

/** Glass laboratory capsule (decorative). */
export function LabPortal({ name, from, to, glow, Icon, size = 1, delay = 0 }: (typeof PORTALS)[number] & { size?: number; delay?: number }) {
  return (
    <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay, type: 'spring' }} whileHover={{ y: -8, scale: 1.03 }} className="relative flex flex-col items-center" style={{ width: 300 * size }}>
      <div className="relative z-10 -mb-5 rounded-2xl px-6 py-2" style={{ background: `linear-gradient(180deg, ${from}, ${to})`, boxShadow: `0 0 0 3px #ffffffaa, 0 0 22px ${glow}` }}>
        <span className="game-title text-white drop-shadow" style={{ fontSize: 34 * size }}>{name}</span>
      </div>
      <div className="relative w-full overflow-hidden" style={{ height: 300 * size, borderRadius: `${40 * size}px ${40 * size}px ${16 * size}px ${16 * size}px`, background: `linear-gradient(180deg, ${from}55, ${to}cc)`, boxShadow: `0 0 0 ${4 * size}px ${from}, 0 0 40px ${glow}, inset 0 0 50px ${glow}` }}>
        <div className="absolute inset-[10%] rounded-[20px] border-2" style={{ borderColor: `${from}aa`, boxShadow: `inset 0 0 30px ${glow}` }} />
        <div className="absolute inset-y-0 left-[12%] w-[8%] bg-white/25 blur-[2px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon strokeWidth={1.4} className="animate-glow text-white" style={{ width: 150 * size, height: 150 * size, filter: `drop-shadow(0 0 12px ${glow})` }} />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="absolute rounded-full bg-white/70" style={{ width: 8 * size, height: 8 * size, left: `${15 + i * 13}%`, bottom: '12%', animation: `bubble ${3 + i * 0.5}s ease-in ${i * 0.4}s infinite` }} />
        ))}
      </div>
      <div className="w-[115%] rounded-[50%] bg-gradient-to-b from-[#cfd8ff] to-[#4a5bb3]" style={{ height: 34 * size, marginTop: -10 * size, boxShadow: `0 0 26px ${glow}` }} />
    </motion.div>
  );
}

function PlayButton({ onClick, big = true }: { onClick: () => void; big?: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      animate={{ boxShadow: ['0 0 30px rgba(255,200,40,0.6)', '0 0 55px rgba(255,200,40,0.95)', '0 0 30px rgba(255,200,40,0.6)'] }}
      transition={{ duration: 2.2, repeat: Infinity }}
      className="relative flex items-center justify-center gap-5 bg-gradient-to-b from-[#ffe95c] via-[#ffc41f] to-[#ff9d0a] text-[#0d1a5c]"
      style={{
        clipPath: 'polygon(7% 0, 93% 0, 100% 50%, 93% 100%, 7% 100%, 0 50%)',
        width: big ? 620 : '100%', height: big ? 170 : 96,
        outline: '4px solid #38e1ff',
      }}
      aria-label="Play — join a game"
    >
      <Play fill="#0d1a5c" strokeWidth={0} style={{ width: big ? 90 : 52, height: big ? 90 : 52 }} />
      <span className="font-display" style={{ fontSize: big ? 110 : 60, fontStyle: 'italic' }}>PLAY</span>
    </motion.button>
  );
}

function TeacherButton({ onClick, big = true }: { onClick: () => void; big?: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className="chip flex items-center gap-4 !rounded-full bg-gradient-to-b from-[#1a3fae] to-[#0a1a63]"
      style={{ padding: big ? '22px 46px' : '14px 26px' }}
      aria-label="Teacher panel"
    >
      <Settings className="animate-spin-slow text-white" style={{ width: big ? 72 : 40, height: big ? 72 : 40 }} />
      <span className="game-title text-left not-italic leading-none text-white" style={{ fontSize: big ? 46 : 26 }}>TEACHER<br />PANEL</span>
    </motion.button>
  );
}

export default function Landing() {
  const nav = useNavigate();
  const portrait = useIsPortrait();

  if (portrait) {
    return (
      <div className="relative z-10 flex min-h-full flex-col items-center gap-4 overflow-x-hidden px-4 pb-8 pt-4">
        <Logo width={320} />
        <p className="game-title -mt-2 text-center text-lg text-[#ffe36b]">Year 9 Science Revision Challenge</p>
        <Persona className="h-[250px] w-auto" />
        <div className="-mt-2 flex w-full justify-center gap-3">
          {PORTALS.map((p, i) => <LabPortal key={p.name} {...p} size={0.36} delay={0.1 * i} />)}
        </div>
        <div className="w-full max-w-sm"><PlayButton big={false} onClick={() => nav('/play')} /></div>
        <TeacherButton big={false} onClick={() => nav('/teacher')} />
        <CreatedBy className="mt-2 text-center" />
      </div>
    );
  }

  return (
    <Stage>
      <div className="absolute bottom-0 left-[-40px] h-[1040px]"><Persona className="h-full w-auto" /></div>
      <div className="absolute left-[660px] top-[20px] w-[780px]"><Logo width={780} /></div>
      <div className="absolute right-[36px] top-[120px] rotate-[-6deg] text-right">
        <p className="game-title text-[44px] leading-tight">Year 9 Science<br />Revision Challenge</p>
        <div className="ml-auto mt-1 h-1.5 w-72 rounded bg-gradient-to-r from-transparent to-[#ffd23f]" />
        <p className="game-title mt-3 text-[30px] text-white/90">Let&apos;s explore, learn and win!</p>
        <div className="ml-auto mt-1 h-1.5 w-60 rounded bg-gradient-to-r from-transparent to-[#ffd23f]" />
      </div>
      <div className="absolute left-[700px] top-[440px] flex gap-[40px]">
        {PORTALS.map((p, i) => <LabPortal key={p.name} {...p} delay={0.15 * i} size={1} />)}
      </div>
      <div className="absolute left-[690px] top-[860px]"><PlayButton onClick={() => nav('/play')} /></div>
      <div className="absolute right-[70px] top-[880px]"><TeacherButton onClick={() => nav('/teacher')} /></div>
      <div className="absolute bottom-[40px] left-0 flex items-center gap-4 rounded-r-full bg-gradient-to-r from-[#0a1a63] to-[#173a9e] py-4 pl-10 pr-14 shadow-[0_0_0_3px_#38e1ff,0_0_24px_rgba(56,225,255,0.5)]">
        <Atom className="h-14 w-14 text-white" />
        <span className="game-title text-[52px]">Good Luck! ♡</span>
      </div>
      <p className="absolute bottom-[14px] right-[40px] text-[22px] text-white/80">Created by <b className="text-white">Mrs Sarra Ben Amara</b></p>
    </Stage>
  );
}
