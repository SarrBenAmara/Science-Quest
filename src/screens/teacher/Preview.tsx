import { useState } from 'react';
import { Logo, Persona } from '../../components/Brand';
import { Modal } from '../../components/ui';
import { ProjectorQuestionBody } from '../../components/questions/ProjectorQuestion';
import { StudentControls } from '../../components/questions/StudentControls';
import { buildReveal, prepareQuestion, toPublicQuestion } from '../../lib/game';
import type { Answer, Question } from '../../lib/types';
import { grade } from '../../lib/grading';
import { ScaledBox } from './common';

/** Shows a question exactly as the projector and a student phone will show it. */
export function PreviewModal({ question, onClose }: { question: Question | null; onClose: () => void }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [adapted, setAdapted] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if (!question) return null;
  const pq = prepareQuestion(question, 0, 0, 1, false);
  const pub = toPublicQuestion(pq);
  const reveal = showAnswer ? buildReveal(pq, 'q0') : null;
  const tryAnswer = (a: Answer) => {
    const r = grade(pq, a, { elapsedMs: 0, adapted });
    setLast(`Test answer → ${r.points} / ${r.max} points (${r.partsCorrect}/${r.partsTotal} parts correct${r.uncertain?.length ? `, blanks ${r.uncertain.map((u) => u + 1).join(', ')} would be flagged for your review` : ''})`);
  };
  return (
    <Modal open onClose={onClose} title={`Preview · ${question.id}`} wide>
      <div className="mb-3 flex flex-wrap gap-4 text-sm font-bold">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showAnswer} onChange={(e) => setShowAnswer(e.target.checked)} /> Show correction</label>
        {question.adapted && <label className="flex items-center gap-2"><input type="checkbox" checked={adapted} onChange={(e) => setAdapted(e.target.checked)} /> Phone: adapted version</label>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div>
          <p className="mb-2 font-extrabold text-white/80">Projector</p>
          <ScaledBox>
            <div className="sq-bg !absolute" />
            <div className="absolute left-[30px] top-[10px]"><Logo width={400} /></div>
            <div className="absolute bottom-0 left-[-20px] h-[860px]"><Persona className="h-full w-auto" float={false} /></div>
            <div className="absolute left-[460px] right-[40px] top-[175px] bottom-[60px]"><ProjectorQuestionBody pq={pq} reveal={reveal} /></div>
          </ScaledBox>
        </div>
        <div>
          <p className="mb-2 font-extrabold text-white/80">Student phone</p>
          <div className="mx-auto max-h-[720px] w-[340px] overflow-y-auto rounded-[40px] border-[6px] border-[#b9a6ff] bg-[#0a1240] p-3 shadow-[0_0_30px_rgba(162,75,255,0.5)] scroll-thin">
            <Logo width={170} />
            <div className="mt-3"><StudentControls key={`${question.id}-${adapted}`} q={pub} onSubmit={tryAnswer} busy={false} adapted={adapted} /></div>
          </div>
          {last && <p className="mt-3 rounded-xl bg-black/30 p-3 text-sm font-bold">{last}</p>}
        </div>
      </div>
    </Modal>
  );
}
