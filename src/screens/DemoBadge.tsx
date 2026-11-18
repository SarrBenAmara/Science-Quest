import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackend, IS_DEMO } from '../backend';
import { resetDemo } from '../backend/demoBackend';
import { confirmAction } from '../lib/env';

/** Demo-only menu: explains demo mode and lets you switch views in a single window. */
export function DemoBadge() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (!IS_DEMO) return null;
  const go = async (to: string) => {
    setOpen(false);
    if (to === 'projector') {
      const u = getBackend('host').user();
      const code = u ? await getBackend('host').get(`teachers/${u.uid}/activeRoom`).catch(() => null) : null;
      nav(code ? `/projector/${code}` : '/teacher');
    } else nav(to);
  };
  return (
    <div className="fixed bottom-2 left-2 z-[70] text-xs">
      {open ? (
        <div className="w-72 rounded-2xl bg-[#0b1a5c]/95 p-3 font-bold ring-2 ring-[#ffd23f]">
          <p className="mb-2">DEMO MODE: the game runs inside this browser only. In the Teacher Panel, press <b>Add 8 demo students</b>, then switch views here to watch the projector or play as a student.</p>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <button className="rounded-full bg-white/15 px-2 py-1.5" onClick={() => go('/')}>🏠 Home</button>
            <button className="rounded-full bg-white/15 px-2 py-1.5" onClick={() => go('/teacher')}>⚙️ Teacher Panel</button>
            <button className="rounded-full bg-white/15 px-2 py-1.5" onClick={() => go('projector')}>🖥️ Projector</button>
            <button className="rounded-full bg-white/15 px-2 py-1.5" onClick={() => go('/play')}>📱 Student</button>
          </div>
          <div className="flex gap-2">
            <button className="rounded-full bg-[#e8164f] px-3 py-1" onClick={() => confirmAction('Delete all demo rooms, banks and players?') && resetDemo()}>Reset demo</button>
            <button className="rounded-full bg-white/15 px-3 py-1" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-full bg-[#ffd23f] px-4 py-2 text-sm font-extrabold text-[#0d1a5c] shadow-[0_0_14px_#ffd23f]">DEMO ☰ views</button>
      )}
    </div>
  );
}
