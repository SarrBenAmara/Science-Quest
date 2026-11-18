import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Backend } from '../../backend';
import type { HostRoom } from '../../game/host';
import { orderedQuestions } from '../../game/banks';
import type { Lab, Question, QuestionBank, RoundPlan } from '../../lib/types';

export interface TeacherCtx {
  db: Backend;
  uid: string;
  banks: Record<string, QuestionBank>;
  bank: QuestionBank | null; // bank used by the current room
  code: string | null;
  room: HostRoom | null | undefined;
  toast: { ok: (t: string) => void; err: (t: string) => void };
}

export function download(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const LAB_ROUND: Record<Lab, { title: string; subtitle: string }> = {
  biology: { title: 'Biology Lab', subtitle: 'Photosynthesis & the Carbon Cycle' },
  physics: { title: 'Physics Lab', subtitle: 'Matter, Density & Heat' },
  chemistry: { title: 'Chemistry Lab', subtitle: 'Atomic Structure' },
};

const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

/** Group question ids into one round per lab (in bank order). */
export function roundsByLab(questions: Question[]): RoundPlan[] {
  const labs: Lab[] = ['biology', 'physics', 'chemistry'];
  return labs
    .map((lab) => ({ lab, ids: questions.filter((q) => q.lab === lab).map((q) => q.id) }))
    .filter((r) => r.ids.length)
    .map((r, i) => ({ title: `Round ${i + 1}: ${LAB_ROUND[r.lab].title}`, lab: r.lab, subtitle: LAB_ROUND[r.lab].subtitle, questionIds: r.ids }));
}

/** Quick builder: N per lab (easy → hard) + optional mixed final round. */
export function quickBuild(bank: QuestionBank, opts: { labs: Lab[]; perRound: number; difficulties: string[]; types: string[]; finalRound: boolean }): RoundPlan[] {
  const pool = orderedQuestions(bank).filter((q) => opts.difficulties.includes(q.difficulty) && opts.types.includes(q.type));
  const used = new Set<string>();
  const rounds: RoundPlan[] = [];
  opts.labs.forEach((lab) => {
    const ids = pool.filter((q) => q.lab === lab).sort((a, b) => DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]).slice(0, opts.perRound).map((q) => q.id);
    ids.forEach((id) => used.add(id));
    if (ids.length) rounds.push({ title: `Round ${rounds.length + 1}: ${LAB_ROUND[lab].title}`, lab, subtitle: LAB_ROUND[lab].subtitle, questionIds: ids });
  });
  if (opts.finalRound) {
    const left = pool.filter((q) => !used.has(q.id) && opts.labs.includes(q.lab)).sort((a, b) => DIFF_ORDER[b.difficulty] - DIFF_ORDER[a.difficulty]);
    const ids: string[] = [];
    let li = 0;
    while (ids.length < opts.perRound && left.length) {
      const lab = opts.labs[li++ % opts.labs.length];
      const i = left.findIndex((q) => q.lab === lab);
      if (i < 0) { if (!left.some((q) => opts.labs.includes(q.lab))) break; continue; }
      ids.push(left.splice(i, 1)[0].id);
      if (li > 200) break;
    }
    if (ids.length) rounds.push({ title: `Round ${rounds.length + 1}: Final Science Challenge`, lab: 'mixed', subtitle: 'Biology · Physics · Chemistry', questionIds: ids });
  }
  return rounds;
}

export function defaultSelection(bank: QuestionBank): RoundPlan[] {
  const presets = bank.presets ?? {};
  const p = presets.default24 ?? Object.values(presets)[0];
  if (p?.rounds?.length) return p.rounds.map((r) => ({ ...r, questionIds: (r.questionIds ?? []).filter((id) => bank.questions[id]) }));
  return roundsByLab(orderedQuestions(bank));
}

/** Renders a 1920×1080 design scaled to the width of its container (used for previews). */
export function ScaledBox({ width = 1920, height = 1080, children }: { width?: number; height?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-2xl bg-[#0a1240] ring-2 ring-[#38e1ff]/50" style={{ aspectRatio: `${width}/${height}` }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
}

export function Section({ title, icon, children, className = '', right }: { title: string; icon?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`neon-panel p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {icon}
        <h2 className="game-title flex-1 text-xl">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
