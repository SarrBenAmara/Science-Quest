import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Scale, Droplets } from 'lucide-react';
import { AnswerTile, GameButton } from '../ui';
import { DragDropBoard } from './DragDrop';
import { AtomBuilder } from './Atom';
import type { Answer, PublicQuestion } from '../../lib/types';
import { LETTERS } from '../../lib/game';

export function SubmitButton({ disabled, onClick, label = 'Submit' }: { disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <GameButton variant="purple" className="mx-auto w-full max-w-xs py-4 text-2xl" disabled={disabled} onClick={onClick}>
      <Send className="h-7 w-7" /> {label}
    </GameButton>
  );
}

/** Big A–D (or A/B for True/False) answer pad. One tap submits. */
export function ChoicePad({ count, labels, onPick, disabled, picked }: { count: number; labels?: string[]; onPick: (i: number) => void; disabled?: boolean; picked?: number | null }) {
  return (
    <div className={`grid gap-4 ${count === 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {Array.from({ length: count }).map((_, i) => (
        <AnswerTile
          key={i}
          index={i}
          text={labels?.[i]}
          size="xl"
          state={picked === undefined || picked === null ? 'normal' : picked === i ? 'selected' : 'dim'}
          className={`${count === 2 ? 'min-h-[110px]' : 'min-h-[150px] flex-col justify-center !gap-1'} text-base`}
          onClick={() => onPick(i)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

export function FillForm({ count, value, onChange, disabled }: { count: number; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="glass-white flex flex-col gap-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <label key={i} className="flex items-center gap-3">
          <span className="game-title flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-[#6a2bd9] to-[#3a1499] text-2xl not-italic text-white shadow">{i + 1}</span>
          <input
            className="sq-input"
            value={value[i] ?? ''}
            placeholder="Type your answer…"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint={i === count - 1 ? 'done' : 'next'}
            maxLength={60}
            disabled={disabled}
            aria-label={`Blank ${i + 1}`}
            onChange={(e) => { const v = value.slice(); v[i] = e.target.value; onChange(v); }}
            onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)}
          />
        </label>
      ))}
    </div>
  );
}

export function NumericForm({ unit, value, onChange, disabled }: { unit?: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="glass-white flex flex-col items-center gap-3 p-5">
      <span className="game-title text-xl not-italic">Your answer</span>
      <div className="flex w-full items-center gap-2">
        <input
          className="sq-input text-center text-3xl"
          inputMode="decimal"
          value={value}
          placeholder="0"
          disabled={disabled}
          aria-label="Numerical answer"
          maxLength={14}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,\-−eE]/g, ''))}
          onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)}
        />
        {unit && <span className="game-title shrink-0 text-2xl not-italic">{unit}</span>}
      </div>
      <p className="text-sm font-bold text-[#3a3f7a]">Numbers only — decimals and negative values are fine.</p>
    </div>
  );
}

const PAIR_COLORS = ['#ff4d6d', '#2f7bff', '#f5b301', '#18b43c', '#a24bff', '#00b7c7', '#ff7a1f', '#7a8bff'];

/** Tap a term, then tap its description. Tap a matched description to undo. */
export function MatchingBoard({ left, right, value, onChange, disabled }: { left: { id: string; text: string }[]; right: { id: string; text: string }[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void; disabled?: boolean }) {
  const [sel, setSel] = useState<string | null>(left[0]?.id ?? null);
  const leftIndex = (id: string) => left.findIndex((l) => l.id === id);
  const ownerOf = (rid: string) => Object.entries(value).find(([, r]) => r === rid)?.[0];
  const pick = (rid: string) => {
    const owner = ownerOf(rid);
    const next = { ...value };
    if (owner && (!sel || owner === sel)) { delete next[owner]; onChange(next); setSel(owner); return; }
    if (!sel) return;
    if (owner) delete next[owner];
    next[sel] = rid;
    onChange(next);
    const nextFree = left.find((l) => !next[l.id]);
    setSel(nextFree?.id ?? null);
  };
  return (
    <div className={`flex flex-col gap-3 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <p className="text-center text-sm font-bold text-white/80">1 · Tap a term &nbsp; 2 · Tap its description</p>
      <div className="flex flex-wrap justify-center gap-2">
        {left.map((l, i) => (
          <button key={l.id} onClick={() => setSel(l.id)} className={`game-title rounded-full px-4 py-2 text-lg text-white transition ${sel === l.id ? 'scale-105 ring-4 ring-white' : value[l.id] ? 'opacity-70' : ''}`} style={{ background: PAIR_COLORS[i % PAIR_COLORS.length], boxShadow: `0 0 12px ${PAIR_COLORS[i % PAIR_COLORS.length]}` }}>
            {l.text} {value[l.id] ? '✓' : ''}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {right.map((r) => {
          const owner = ownerOf(r.id);
          const c = owner ? PAIR_COLORS[leftIndex(owner) % PAIR_COLORS.length] : undefined;
          return (
            <motion.button key={r.id} whileTap={{ scale: 0.97 }} onClick={() => pick(r.id)} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3 text-left font-extrabold text-[#14135a]" style={{ boxShadow: c ? `0 0 0 4px ${c}, 0 0 14px ${c}` : '0 0 0 2px rgba(56,225,255,0.6)' }}>
              <span className="flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm text-white" style={{ background: c ?? '#9aa3c7' }}>{owner ? left[leftIndex(owner)].text.slice(0, 3) : '?'}</span>
              <span className="flex-1">{r.text}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** Virtual Density Challenge: weigh, then lower into the measuring cylinder, then calculate. */
export function DensityLab({ object, mass, waterBefore, waterAfter, interactive = true, auto = false }: { object: string; mass: number; waterBefore: number; waterAfter: number; interactive?: boolean; auto?: boolean }) {
  const [weighed, setWeighed] = useState(auto);
  const [dropped, setDropped] = useState(auto);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!weighed) { setShown(0); return; }
    let v = 0;
    const id = setInterval(() => { v = Math.min(mass, v + Math.ceil(mass / 25)); setShown(v); if (v >= mass) clearInterval(id); }, 40);
    return () => clearInterval(id);
  }, [weighed, mass]);
  const max = Math.max(50, Math.ceil((waterAfter * 1.2) / 10) * 10);
  const level = dropped ? waterAfter : waterBefore;
  const stone = (
    <div className="h-12 w-16 rounded-[45%_55%_50%_45%] bg-[radial-gradient(circle_at_35%_30%,#ddd6cc,#6d665e)] shadow-lg ring-2 ring-[#4d463f]" aria-label={object} />
  );
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[#0b1a5c]/80 p-3 ring-2 ring-[#38e1ff]/60">
      <div className="grid grid-cols-2 items-end gap-3">
        {/* Balance */}
        <div className="flex flex-col items-center">
          <div className="flex h-16 items-end">{weighed && !dropped && <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{stone}</motion.div>}</div>
          <div className="h-2 w-28 rounded bg-[#e6ecf7]" />
          <div className="flex h-14 w-32 items-center justify-center rounded-b-xl rounded-t-sm bg-[#cfd8ea]">
            <div className="rounded-md bg-[#0a1450] px-2 py-1 font-mono text-lg font-bold text-[#3dff7a] ring-1 ring-[#38e1ff]">{weighed ? `${shown} g` : '0 g'}</div>
          </div>
          <span className="mt-1 text-xs font-bold text-white/70">Balance</span>
        </div>
        {/* Measuring cylinder */}
        <div className="flex flex-col items-center">
          <div className="relative h-44 w-20 rounded-b-xl border-x-4 border-b-4 border-[#e8f6ff]">
            <motion.div className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-[#7fdcff] to-[#2f8fff] opacity-85" animate={{ height: `${(level / max) * 100}%` }} transition={{ duration: 1.2, ease: 'easeInOut' }} />
            {dropped && <motion.div className="absolute bottom-1 left-1/2 -translate-x-1/2 scale-75" initial={{ y: -150 }} animate={{ y: 0 }} transition={{ duration: 1 }}>{stone}</motion.div>}
            {Array.from({ length: max / 10 + 1 }).map((_, i) => (
              <div key={i} className="absolute left-0 flex items-center" style={{ bottom: `${(i * 10 * 100) / max}%` }}>
                <span className="h-0.5 w-3 bg-white" />
                {i > 0 && i % (max > 80 ? 2 : 1) === 0 && <span className="ml-0.5 text-[10px] font-bold">{i * 10}</span>}
              </div>
            ))}
            {Array.from({ length: max / 5 }).map((_, i) => <span key={`m${i}`} className="absolute left-0 h-px w-1.5 bg-white/70" style={{ bottom: `${(i * 5 * 100) / max}%` }} />)}
          </div>
          <span className="mt-1 text-xs font-bold text-white/70">Measuring cylinder (mL)</span>
        </div>
      </div>
      {interactive && (
        <div className="grid grid-cols-2 gap-2">
          <GameButton variant="navy" className="text-base" onClick={() => setWeighed(true)} disabled={weighed}><Scale className="h-5 w-5" /> Weigh</GameButton>
          <GameButton variant="navy" className="text-base" onClick={() => setDropped(true)} disabled={!weighed || dropped}><Droplets className="h-5 w-5" /> Lower in</GameButton>
        </div>
      )}
      {interactive && <p className="text-center text-xs font-bold text-white/70">Read the water level before and after — 1 mL = 1 cm³.</p>}
    </div>
  );
}

/** Renders the right control for a question type and returns the answer on submit. */
export function StudentControls({ q, onSubmit, busy, adapted }: { q: PublicQuestion; onSubmit: (a: Answer) => void; busy: boolean; adapted: boolean }) {
  const [texts, setTexts] = useState<string[]>([]);
  const [num, setNum] = useState('');
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [shells, setShells] = useState<number[]>([0, 0, 0, 0]);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setTexts([]); setNum(''); setPairs({}); setShells(Array(q.atom?.maxShells ?? 4).fill(0)); setPicked(null); }, [q.index, q.atom?.maxShells]);

  if (adapted && q.adapted) {
    const n = q.adapted.type === 'truefalse' ? 2 : q.adapted.options?.length ?? 4;
    return (
      <div className="flex flex-col gap-3">
        <div className="glass-white p-4 text-center text-lg font-extrabold">{q.adapted.prompt}</div>
        {q.adapted.type === 'mcq' && (
          <ul className="grid gap-1 rounded-2xl bg-white/10 p-3 text-sm font-bold">
            {q.adapted.options!.map((o, i) => <li key={i}><span className="game-title mr-2">{LETTERS[i]}</span>{o}</li>)}
          </ul>
        )}
        <ChoicePad count={n} labels={q.adapted.type === 'truefalse' ? ['True', 'False'] : undefined} disabled={busy} picked={picked} onPick={(i) => { setPicked(i); onSubmit({ kind: 'choice', value: i }); }} />
      </div>
    );
  }

  switch (q.type) {
    case 'mcq':
    case 'truefalse':
      return <ChoicePad count={q.optionCount ?? 4} labels={q.type === 'truefalse' ? ['True', 'False'] : undefined} disabled={busy} picked={picked} onPick={(i) => { setPicked(i); onSubmit({ kind: 'choice', value: i }); }} />;
    case 'fill': {
      const n = q.blankCount ?? 1;
      const filled = Array.from({ length: n }).every((_, i) => (texts[i] ?? '').trim());
      return (
        <div className="flex flex-col gap-5">
          <FillForm count={n} value={texts} onChange={setTexts} disabled={busy} />
          <SubmitButton disabled={busy || !filled} onClick={() => onSubmit({ kind: 'texts', value: Array.from({ length: n }, (_, i) => (texts[i] ?? '').trim()) })} />
          {!filled && <p className="-mt-3 text-center text-xs font-bold text-white/60">Fill every box to submit.</p>}
        </div>
      );
    }
    case 'numeric':
    case 'density':
      return (
        <div className="flex flex-col gap-4">
          {q.type === 'density' && q.density && <DensityLab {...q.density} />}
          <NumericForm unit={q.unit} value={num} onChange={setNum} disabled={busy} />
          <SubmitButton disabled={busy || !/\d/.test(num)} onClick={() => onSubmit({ kind: 'number', value: num })} />
        </div>
      );
    case 'matching': {
      const m = q.matching!;
      const done = m.left.every((l) => pairs[l.id]);
      return (
        <div className="flex flex-col gap-4">
          <MatchingBoard left={m.left} right={m.right} value={pairs} onChange={setPairs} disabled={busy} />
          <SubmitButton disabled={busy || !done} onClick={() => onSubmit({ kind: 'pairs', value: pairs })} />
        </div>
      );
    }
    case 'dragdrop': {
      const d = q.dragdrop!;
      const done = d.zones.every((z) => pairs[z.id]);
      return (
        <div className="flex flex-col gap-4">
          <DragDropBoard diagram={d.diagram} zones={d.zones} items={d.items} value={pairs} onChange={setPairs} disabled={busy} />
          <SubmitButton disabled={busy || !done} onClick={() => onSubmit({ kind: 'pairs', value: pairs })} />
        </div>
      );
    }
    case 'atom': {
      const a = q.atom!;
      const total = shells.reduce((x, y) => x + y, 0);
      return (
        <div className="flex flex-col gap-4">
          <AtomBuilder symbol={a.symbol} element={a.element} atomicNumber={a.atomicNumber} maxShells={a.maxShells} value={shells} onChange={setShells} disabled={busy} />
          <SubmitButton disabled={busy || total !== a.atomicNumber} onClick={() => onSubmit({ kind: 'shells', value: shells })} />
        </div>
      );
    }
  }
}
