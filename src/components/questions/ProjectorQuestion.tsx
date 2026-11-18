import { motion } from 'framer-motion';
import { Hand, PencilLine, Calculator, Link2, Atom as AtomIco, FlaskConical, Lightbulb } from 'lucide-react';
import { AnswerTile } from '../ui';
import { DiagramArt, DiagramWithZones } from '../../diagrams/Diagrams';
import { BohrModel } from './Atom';
import { DensityLab } from './StudentControls';
import { ZONE_FONT } from './DragDrop';
import { displayedOptions, correctDisplayIndex, toPublicQuestion } from '../../lib/game';
import type { PreparedQuestion, RevealPayload } from '../../lib/types';

const ICON = { dragdrop: Hand, fill: PencilLine, numeric: Calculator, matching: Link2, atom: AtomIco, density: FlaskConical } as const;

export function InstructionBar({ type, text }: { type: keyof typeof ICON; text: string }) {
  const Icon = ICON[type];
  return (
    <div className="lilac-bar flex items-center gap-6 !rounded-[28px] px-5 py-3">
      <span className="flex h-[88px] w-[110px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-b from-[#6a2bd9] to-[#3a1499] shadow-lg"><Icon className="h-14 w-14 text-white" /></span>
      <p className="game-title flex-1 text-center text-[44px] leading-tight text-[#14135a]">{text}</p>
    </div>
  );
}

/** Fill-in-the-blank text: "___" becomes a numbered blank (or the correct word after reveal). */
function FillText({ text, answers }: { text: string; answers?: string[] }) {
  let n = 0;
  return (
    <ul className="flex flex-col gap-6">
      {text.split('\n').filter(Boolean).map((line, li) => (
        <li key={li} className="flex gap-4 text-[46px] font-extrabold leading-snug text-[#14135a]">
          <span className="mt-6 h-4 w-4 shrink-0 rounded-full bg-[#14135a]" />
          <span>
            {line.split(/_{3,}/).map((part, pi, arr) => {
              const idx = n;
              if (pi < arr.length - 1) n++;
              return (
                <span key={pi}>
                  {part}
                  {pi < arr.length - 1 && (
                    answers
                      ? <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-2 inline-block rounded-xl bg-[#18b43c] px-4 text-white shadow-[0_0_16px_#3dff7a]">{answers[idx]}</motion.span>
                      : <span className="mx-2 inline-flex items-end gap-2"><span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#6a2bd9] text-[28px] text-white">{idx + 1}</span><span className="inline-block min-w-[220px] border-b-[5px] border-[#14135a]">&nbsp;</span></span>
                  )}
                </span>
              );
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ExplanationCard({ reveal }: { reveal: RevealPayload }) {
  return (
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="relative mt-4">
      <span className="game-title absolute -top-6 left-6 z-10 flex items-center gap-2 rounded-full bg-gradient-to-b from-[#ffe25a] to-[#ffb21a] px-5 py-1.5 text-[30px] text-[#14135a] shadow-[0_0_14px_#ffc21a]"><Lightbulb className="h-8 w-8" /> Explanation</span>
      <div className="glass-white px-8 pb-5 pt-8 text-[30px] font-extrabold leading-snug">{reveal.explanation || '—'}</div>
    </motion.div>
  );
}

/**
 * The question as shown on the classroom projector (also used by Preview).
 * When `reveal` is given, the correct answer is shown.
 */
export function ProjectorQuestionBody({ pq, reveal, submittedCount }: { pq: PreparedQuestion; reveal?: RevealPayload | null; submittedCount?: number }) {
  const q = pq.q;
  const pub = toPublicQuestion(pq);

  if (q.type === 'mcq' || q.type === 'truefalse') {
    const opts = displayedOptions(pq);
    const correct = correctDisplayIndex(pq);
    const hasDiagram = !!q.diagram || !!q.image;
    return (
      <div className="flex h-full flex-col gap-6">
        <div className="neon-panel flex flex-1 flex-col gap-4 p-5">
          <div className={`glass-white flex min-h-[150px] items-center justify-center px-8 py-4 text-center ${!hasDiagram && !reveal ? 'flex-1' : ''}`}>
            <p className={`game-title not-italic leading-tight ${!hasDiagram && !reveal ? 'text-[60px]' : 'text-[48px]'}`}>{q.type === 'truefalse' && <span className="mr-3 rounded-full bg-[#6a2bd9] px-4 py-1 text-[30px] text-white">True or False?</span>}{q.prompt}</p>
          </div>
          {reveal && <ExplanationCard reveal={reveal} />}
          {hasDiagram && !reveal && (
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl">
              {q.diagram ? <DiagramArt diagram={q.diagram} /> : <img src={q.image} alt="" className="h-full w-full object-contain" />}
            </div>
          )}
        </div>
        <div className={`grid gap-5 ${opts.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`} style={{ fontSize: 24 }}>
          {opts.map((o, i) => (
            <AnswerTile key={i} index={i} text={o} state={reveal ? (i === correct ? 'correct' : 'dim') : 'normal'} count={reveal?.distribution?.[i]} className="min-h-[118px]" />
          ))}
        </div>
      </div>
    );
  }

  if (q.type === 'fill') {
    return (
      <div className="flex h-full flex-col gap-6">
        <InstructionBar type="fill" text={q.prompt || 'Fill in the blanks with the correct words.'} />
        <div className="neon-panel flex flex-1 flex-col p-6">
          <div className="glass-white flex flex-1 flex-col justify-center px-12 py-8"><FillText text={q.text} answers={reveal?.parts} /></div>
          {reveal && <ExplanationCard reveal={reveal} />}
        </div>
      </div>
    );
  }

  if (q.type === 'dragdrop') {
    const d = pub.dragdrop!;
    return (
      <div className="flex h-full flex-col gap-5">
        <InstructionBar type="dragdrop" text={q.prompt} />
        <div className="neon-panel flex min-h-0 flex-1 items-center justify-center p-4">
          <div className="h-full" style={{ aspectRatio: d.diagram.kind === 'sequence' ? '16/6' : '16/9', maxWidth: '100%' }}>
            <DiagramWithZones
              diagram={d.diagram}
              zones={d.zones}
              className="h-full"
              renderZone={(z) => {
                const ans = reveal ? q.zones.find((qz) => qz.id === z.id)?.answer : undefined;
                return (
                  <div className={`game-title flex h-full w-full items-center justify-center rounded-[14px] border-[3px] ${ans ? 'border-white bg-[#18b43c] text-white shadow-[0_0_18px_#3dff7a]' : 'border-dashed border-[#14135a] bg-[#fbf0d9]/95 text-[#14135a]'}`} style={{ fontSize: ZONE_FONT }}>
                    {ans ?? z.label ?? '?'}
                  </div>
                );
              }}
            />
          </div>
        </div>
        {!reveal && (
          <div className="drag-bank neon-panel neon-panel-purple flex items-center gap-5 px-6 py-3">
            <span className="game-title text-[30px]">Drag the {d.diagram.kind === 'sequence' ? 'stages' : 'processes'}:</span>
            {d.items.map((it) => <span key={it.id} className="game-title flex-1 whitespace-nowrap rounded-full bg-[#fbf0d9] px-3 py-3 text-center text-[28px] text-[#14135a] shadow-[0_0_0_2px_#fff,0_0_14px_rgba(255,255,255,0.4)]">{it.text}</span>)}
          </div>
        )}
        {reveal && <ExplanationCard reveal={reveal} />}
      </div>
    );
  }

  if (q.type === 'matching') {
    const m = pub.matching!;
    return (
      <div className="flex h-full flex-col gap-5">
        <InstructionBar type="matching" text={q.prompt} />
        <div className="neon-panel grid flex-1 grid-cols-[1fr_1.6fr] gap-6 p-6">
          <div className="flex flex-col justify-center gap-4">
            {m.left.map((l, i) => {
              const pairText = reveal ? q.pairs[i].right : null;
              return <div key={l.id} className="game-title rounded-2xl bg-gradient-to-b from-[#3d8bff] to-[#1446c9] px-5 py-4 text-[36px] shadow-[0_0_14px_#2f7bff]">{l.text}{pairText && <span className="ml-3 text-[26px] text-[#bff7ff]">→</span>}</div>;
            })}
          </div>
          <div className="flex flex-col justify-center gap-4">
            {(reveal ? q.pairs.map((p) => ({ id: p.left, text: p.right })) : m.right).map((r) => (
              <div key={r.id} className={`rounded-2xl px-5 py-4 text-[30px] font-extrabold ${reveal ? 'bg-[#18b43c] text-white shadow-[0_0_14px_#3dff7a]' : 'bg-white text-[#14135a]'}`}>{r.text}</div>
            ))}
          </div>
        </div>
        {reveal && <ExplanationCard reveal={reveal} />}
      </div>
    );
  }

  if (q.type === 'atom') {
    return (
      <div className="flex h-full flex-col gap-5">
        <InstructionBar type="atom" text={q.prompt} />
        <div className="neon-panel flex min-h-0 flex-1 items-center justify-center gap-10 p-4">
          <BohrModel symbol={q.symbol} protons={q.atomicNumber} shells={reveal ? q.shells : []} maxShells={q.maxShells ?? 4} className={reveal ? "h-[360px] w-[360px]" : "h-[480px] w-[480px]"} />
          <div className="flex flex-col gap-4 text-[36px] font-extrabold">
            <div className="glass-white px-8 py-5">Element: <b>{q.element} ({q.symbol})</b><br />Atomic number: <b>{q.atomicNumber}</b></div>
            {reveal && <div className="game-title rounded-2xl bg-[#18b43c] px-8 py-5 text-[56px] shadow-[0_0_20px_#3dff7a]">{q.shells.join(', ')}</div>}
          </div>
        </div>
        {reveal && <ExplanationCard reveal={reveal} />}
      </div>
    );
  }

  // numeric & density
  return (
    <div className="flex h-full flex-col gap-5">
      <InstructionBar type={q.type === 'density' ? 'density' : 'numeric'} text={q.prompt} />
      <div className="neon-panel flex flex-1 items-center justify-center gap-10 p-6">
        {q.type === 'density' && <div className="w-[560px] text-[22px]"><DensityLab object={q.object} mass={q.mass} waterBefore={q.waterBefore} waterAfter={q.waterAfter} interactive={false} auto /></div>}
        {q.diagram && <div className="h-[420px] flex-1 overflow-hidden rounded-2xl"><DiagramArt diagram={q.diagram} /></div>}
        <div className="flex flex-col items-center gap-6">
          <div className="glass-white px-10 py-6 text-center">
            <p className="text-[30px] font-extrabold">Type a number on your phone</p>
            <p className="game-title text-[56px] not-italic">Answer in <span className="text-[#6a2bd9]">{pub.unit || '—'}</span></p>
          </div>
          {reveal && <div className="game-title rounded-2xl bg-[#18b43c] px-10 py-5 text-[64px] shadow-[0_0_20px_#3dff7a]">{reveal.correctText}</div>}
          {submittedCount !== undefined && null}
        </div>
      </div>
      {reveal && <ExplanationCard reveal={reveal} />}
    </div>
  );
}
