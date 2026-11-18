import { pointerWithin, rectIntersection, MeasuringStrategy, type CollisionDetection, useDraggable, useDroppable, DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, DragOverlay, type DragEndEvent } from '@dnd-kit/core';
import { useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';

// Physical maximum per shell (2n²) — does not give away the 2, 8, 8 pattern students must know.
const SHELL_CAP = [2, 8, 18, 32];

/** Bohr diagram. `shells` = electrons per shell. Used on the projector and inside the builder. */
export function BohrModel({ symbol, protons, shells, maxShells = 4, highlight, className = '' }: { symbol: string; protons: number; shells: number[]; maxShells?: number; highlight?: number | null; className?: string }) {
  const radii = [70, 120, 170, 220].slice(0, maxShells);
  return (
    <svg viewBox="0 0 500 500" className={className} role="img" aria-label={`${symbol} atom with shells ${shells.join(', ')}`}>
      <defs>
        <radialGradient id="nuc" cx="0.4" cy="0.35"><stop offset="0" stopColor="#ffe680" /><stop offset="1" stopColor="#ff9a1f" /></radialGradient>
        <radialGradient id="ele" cx="0.35" cy="0.3"><stop offset="0" stopColor="#bff7ff" /><stop offset="1" stopColor="#13a8ff" /></radialGradient>
      </defs>
      {radii.map((r, i) => (
        <circle key={i} cx="250" cy="250" r={r} fill="none" stroke={highlight === i ? '#ffd23f' : '#5eeaff'} strokeWidth={highlight === i ? 6 : 3} strokeDasharray={shells[i] ? '0' : '10 8'} opacity={highlight === i ? 1 : 0.8} />
      ))}
      <circle cx="250" cy="250" r="44" fill="url(#nuc)" stroke="#fff" strokeWidth="3" />
      <text x="250" y="248" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="32" fill="#4a2500">{symbol}</text>
      <text x="250" y="276" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="600" fontSize="18" fill="#4a2500">{protons}p⁺</text>
      {radii.map((r, si) => Array.from({ length: shells[si] ?? 0 }).map((_, ei) => {
        const n = shells[si];
        const a = (2 * Math.PI * ei) / n - Math.PI / 2 + si * 0.3;
        return <circle key={`${si}-${ei}`} cx={250 + r * Math.cos(a)} cy={250 + r * Math.sin(a)} r="13" fill="url(#ele)" stroke="#fff" strokeWidth="2" />;
      }))}
    </svg>
  );
}

/** Drop where the finger/pointer is; fall back to overlap when the pointer is between targets. */
const fingerFirst: CollisionDetection = (args) => { const hits = pointerWithin(args); return hits.length ? hits : rectIntersection(args); };
const MEASURE = { droppable: { strategy: MeasuringStrategy.Always } };

function Electron({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <button ref={setNodeRef} {...listeners} {...attributes} data-electron aria-label="Electron — drag onto a shell" className={`h-9 w-9 touch-none rounded-full bg-[radial-gradient(circle_at_35%_30%,#bff7ff,#13a8ff)] ring-2 ring-white/80 shadow-[0_0_10px_#38e1ff] ${isDragging ? 'opacity-30' : ''}`} />
  );
}

function ShellDrop({ index, children }: { index: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `shell-${index}` });
  return <div ref={setNodeRef} data-shell={index} className={`rounded-2xl p-2 transition ${isOver ? 'bg-[#ffd23f]/25 ring-2 ring-[#ffd23f]' : 'bg-[#0b1a5c]/80 ring-1 ring-[#38e1ff]/40'}`}>{children}</div>;
}

/** Student control: drag electrons into shells (or use + / −). */
export function AtomBuilder({ symbol, element, atomicNumber, maxShells = 4, value, onChange, disabled }: {
  symbol: string; element: string; atomicNumber: number; maxShells?: number; value: number[]; onChange: (v: number[]) => void; disabled?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }), useSensor(KeyboardSensor));
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  const placed = value.reduce((a, b) => a + b, 0);
  const left = atomicNumber - placed;
  const setShell = (i: number, n: number) => {
    const next = Array.from({ length: maxShells }, (_, k) => value[k] ?? 0);
    next[i] = Math.max(0, Math.min(SHELL_CAP[i] ?? 8, n));
    if (next.reduce((a, b) => a + b, 0) > atomicNumber) return;
    onChange(next);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false); setOver(null);
    const target = e.over?.id ? Number(String(e.over.id).replace('shell-', '')) : null;
    if (target === null || Number.isNaN(target)) return;
    setShell(target, (value[target] ?? 0) + 1);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={fingerFirst} measuring={MEASURE} autoScroll={{ threshold: { x: 0, y: 0.06 }, acceleration: 6 }} onDragStart={() => setDragging(true)} onDragOver={(e) => setOver(e.over ? Number(String(e.over.id).replace('shell-', '')) : null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(false)}>
      <div className={`flex flex-col gap-3 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
        <div className="mx-auto w-full max-w-[300px]">
          <BohrModel symbol={symbol} protons={atomicNumber} shells={value} maxShells={maxShells} highlight={dragging ? over : null} className="w-full" />
        </div>
        <p className="text-center text-sm font-extrabold text-white/80">{element}: {atomicNumber} electrons · <span className="text-[#ffd23f]">{left} left to place</span></p>
        <div className="flex min-h-[44px] flex-wrap justify-center gap-2 rounded-2xl bg-black/20 p-2">
          {Array.from({ length: Math.min(left, 12) }).map((_, i) => <Electron key={`${placed}-${i}`} id={`e-${placed}-${i}`} />)}
          {left > 12 && <span className="self-center font-extrabold">+{left - 12}</span>}
          {left === 0 && <span className="self-center text-sm font-bold text-[#3dff7a]">All electrons placed ✓</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: maxShells }).map((_, i) => (
            <ShellDrop key={i} index={i}>
              <div className="mb-1 text-center text-xs font-extrabold uppercase tracking-wide text-white/70">Shell {i + 1}</div>
              <div className="flex items-center justify-between gap-1">
                <button aria-label={`Remove electron from shell ${i + 1}`} onClick={() => setShell(i, (value[i] ?? 0) - 1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 active:bg-white/30"><Minus /></button>
                <span className="game-title text-3xl tabular-nums">{value[i] ?? 0}</span>
                <button aria-label={`Add electron to shell ${i + 1}`} onClick={() => setShell(i, (value[i] ?? 0) + 1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 active:bg-white/30"><Plus /></button>
              </div>
            </ShellDrop>
          ))}
        </div>
        <button onClick={() => onChange(Array(maxShells).fill(0))} className="mx-auto flex items-center gap-1 text-sm font-bold text-white/70"><RotateCcw className="h-4 w-4" /> Reset</button>
      </div>
      <DragOverlay dropAnimation={null}>{dragging ? <div className="h-10 w-10 rounded-full bg-[radial-gradient(circle_at_35%_30%,#bff7ff,#13a8ff)] ring-2 ring-white shadow-[0_0_14px_#38e1ff]" /> : null}</DragOverlay>
    </DndContext>
  );
}
