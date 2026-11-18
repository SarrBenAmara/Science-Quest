import { useEffect, useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { GameButton, Modal } from '../../components/ui';
import { DiagramWithZones } from '../../diagrams/Diagrams';
import { normalizeQuestion } from '../../lib/importSchema';
import { DEFAULT_POINTS, electronConfiguration } from '../../lib/grading';
import { LETTERS } from '../../lib/game';
import { QTYPE_LABEL, type QType, type Question } from '../../lib/types';

const L = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`flex flex-col gap-1 text-sm font-extrabold ${className}`}><span className="text-white/80">{label}</span>{children}</label>
);
const split = (s: string) => s.split('|').map((x) => x.trim()).filter(Boolean);

export function blankQuestion(type: QType, id: string, base?: Partial<Question>): any {
  const d = DEFAULT_POINTS[type];
  const common = { id, type, lab: base?.lab ?? 'biology', topic: base?.topic ?? '', difficulty: base?.difficulty ?? 'medium', prompt: base?.prompt ?? '', explanation: base?.explanation ?? '', timeLimit: d.time, points: d.points, speedBonus: d.speedBonus };
  switch (type) {
    case 'mcq': return { ...common, options: ['', '', '', ''], answer: 0 };
    case 'truefalse': return { ...common, answer: true };
    case 'fill': return { ...common, prompt: 'Fill in the blanks with the correct words.', text: 'Plants take in ___ dioxide from the air.', blanks: [{ accepted: ['carbon'] }] };
    case 'numeric': return { ...common, answer: 0, tolerance: 0.01, toleranceType: 'absolute', unit: '' };
    case 'matching': return { ...common, pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] };
    case 'dragdrop': return { ...common, diagram: { kind: 'carbon-cycle' }, zones: [{ id: 'z1', x: 15, y: 25, w: 24, h: 11, answer: 'Photosynthesis' }], distractors: [] };
    case 'atom': return { ...common, lab: 'chemistry', element: 'Sodium', symbol: 'Na', atomicNumber: 11, shells: [2, 8, 1], maxShells: 4, prompt: 'Arrange the electrons in the shells of a neutral sodium atom (atomic number 11).' };
    case 'density': return { ...common, lab: 'physics', object: 'stone', mass: 81, waterBefore: 35, waterAfter: 62, tolerance: 0.05, prompt: 'Weigh the stone, lower it into the measuring cylinder, then calculate its density.' };
  }
}

export function QuestionEditor({ initial, isNew, existingIds, onSave, onClose }: { initial: Question | null; isNew: boolean; existingIds: string[]; onSave: (q: Question) => Promise<void>; onClose: () => void }) {
  const [q, setQ] = useState<any>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setQ(initial ? structuredClone(initial) : null); setErrors([]); }, [initial]);
  if (!q) return null;
  const set = (patch: any) => setQ((cur: any) => ({ ...cur, ...patch }));
  const single = ['mcq', 'truefalse', 'numeric', 'density'].includes(q.type);

  const changeType = (t: QType) => setQ(blankQuestion(t, q.id, q));
  const syncBlanks = (text: string) => {
    const n = (text.match(/_{3,}/g) ?? []).length;
    const blanks = Array.from({ length: n }, (_, i) => q.blanks?.[i] ?? { accepted: [] });
    set({ text, blanks });
  };

  const save = async () => {
    const { q: clean, errors: errs } = normalizeQuestion(q, q.id || 'Question');
    if ((isNew || q.id !== initial?.id) && existingIds.includes(q.id)) errs.push(`The id "${q.id}" is already used in this bank.`);
    setErrors(errs);
    if (errs.length || !clean) return;
    setSaving(true);
    try { await onSave(clean); onClose(); } catch (e) { setErrors([(e as Error).message]); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? 'New question' : `Edit question ${initial?.id}`} wide>
      <div className="grid gap-4 md:grid-cols-4">
        <L label="Question type"><select className="field" value={q.type} onChange={(e) => changeType(e.target.value as QType)}>{Object.entries(QTYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
        <L label="ID (unique)"><input className="field" value={q.id} onChange={(e) => set({ id: e.target.value.replace(/[.#$\[\]\/\s]/g, '_') })} /></L>
        <L label="Subject"><select className="field" value={q.lab} onChange={(e) => set({ lab: e.target.value })}><option value="biology">Biology</option><option value="physics">Physics</option><option value="chemistry">Chemistry</option></select></L>
        <L label="Difficulty"><select className="field" value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Challenging</option></select></L>
        <L label="Topic" className="md:col-span-2"><input className="field" value={q.topic} onChange={(e) => set({ topic: e.target.value })} /></L>
        <L label="Time limit (s)"><input className="field" type="number" min={5} max={600} value={q.timeLimit} onChange={(e) => set({ timeLimit: Number(e.target.value) })} /></L>
        <div className="grid grid-cols-2 gap-2">
          <L label="Max points"><input className="field" type="number" min={0} value={q.points} onChange={(e) => set({ points: Number(e.target.value) })} /></L>
          <L label="Speed bonus"><input className="field" type="number" min={0} disabled={!single} value={single ? q.speedBonus : 0} onChange={(e) => set({ speedBonus: Number(e.target.value) })} /></L>
        </div>
        <L label={q.type === 'fill' ? 'Instruction (projector heading)' : 'Question (shown on the projector)'} className="md:col-span-4"><textarea className="field min-h-[70px]" value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} /></L>
      </div>

      <div className="mt-5 rounded-2xl bg-black/20 p-4">
        {q.type === 'mcq' && (
          <div className="flex flex-col gap-2">
            <p className="font-extrabold">Options — select the correct answer</p>
            {q.options.map((o: string, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" checked={q.answer === i} onChange={() => set({ answer: i })} aria-label={`Option ${LETTERS[i]} is correct`} />
                <span className="game-title w-6">{LETTERS[i]}</span>
                <input className="field" value={o} onChange={(e) => { const opts = q.options.slice(); opts[i] = e.target.value; set({ options: opts }); }} />
                <button className="rounded-full p-2 hover:bg-white/10 disabled:opacity-30" disabled={q.options.length <= 2} onClick={() => { const opts = q.options.filter((_: string, k: number) => k !== i); set({ options: opts, answer: Math.min(q.answer, opts.length - 1) }); }} aria-label="Remove option"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {q.options.length < 4 && <button className="flex items-center gap-1 self-start text-sm font-bold text-[#38e1ff]" onClick={() => set({ options: [...q.options, ''] })}><Plus className="h-4 w-4" /> Add option</button>}
          </div>
        )}
        {q.type === 'truefalse' && (
          <div className="flex gap-6 font-extrabold">
            <label className="flex items-center gap-2"><input type="radio" checked={q.answer === true} onChange={() => set({ answer: true })} /> A = True is correct</label>
            <label className="flex items-center gap-2"><input type="radio" checked={q.answer === false} onChange={() => set({ answer: false })} /> B = False is correct</label>
          </div>
        )}
        {q.type === 'fill' && (
          <div className="flex flex-col gap-3">
            <L label="Text on the projector — write each blank as ___ (three underscores); one sentence per line"><textarea className="field min-h-[110px] font-mono" value={q.text} onChange={(e) => syncBlanks(e.target.value)} /></L>
            {q.blanks.map((b: any, i: number) => (
              <div key={i} className="grid gap-2 md:grid-cols-2">
                <L label={`Blank ${i + 1}: accepted answers (separate with | )`}><input className="field" value={(b.accepted ?? []).join(' | ')} onChange={(e) => { const bl = q.blanks.slice(); bl[i] = { ...bl[i], accepted: split(e.target.value) }; set({ blanks: bl }); }} /></L>
                <L label="Never accept (optional, separate with | )"><input className="field" value={(b.rejected ?? []).join(' | ')} onChange={(e) => { const bl = q.blanks.slice(); bl[i] = { ...bl[i], rejected: split(e.target.value) }; set({ blanks: bl }); }} /></L>
              </div>
            ))}
            <p className="text-xs text-white/60">Capitals, extra spaces and ³/² vs 3/2 are ignored automatically. Close misspellings are never accepted automatically — they are flagged for your review before the correction.</p>
          </div>
        )}
        {q.type === 'numeric' && (
          <div className="grid gap-3 md:grid-cols-4">
            <L label="Correct value"><input className="field" type="number" step="any" value={q.answer} onChange={(e) => set({ answer: Number(e.target.value) })} /></L>
            <L label="Tolerance"><input className="field" type="number" step="any" min={0} value={q.tolerance} onChange={(e) => set({ tolerance: Number(e.target.value) })} /></L>
            <L label="Tolerance type"><select className="field" value={q.toleranceType} onChange={(e) => set({ toleranceType: e.target.value })}><option value="absolute">± absolute</option><option value="percent">± percent</option></select></L>
            <L label="Unit (shown on the projector)"><input className="field" value={q.unit} onChange={(e) => set({ unit: e.target.value })} /></L>
          </div>
        )}
        {q.type === 'matching' && (
          <div className="flex flex-col gap-2">
            <p className="font-extrabold">Pairs (each term with its correct description)</p>
            {q.pairs.map((p: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                <input className="field" placeholder="Term" value={p.left} onChange={(e) => { const ps = q.pairs.slice(); ps[i] = { ...p, left: e.target.value }; set({ pairs: ps }); }} />
                <input className="field" placeholder="Description" value={p.right} onChange={(e) => { const ps = q.pairs.slice(); ps[i] = { ...p, right: e.target.value }; set({ pairs: ps }); }} />
                <button className="rounded-full p-2 hover:bg-white/10" onClick={() => set({ pairs: q.pairs.filter((_: any, k: number) => k !== i) })} aria-label="Remove pair"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {q.pairs.length < 8 && <button className="flex items-center gap-1 self-start text-sm font-bold text-[#38e1ff]" onClick={() => set({ pairs: [...q.pairs, { left: '', right: '' }] })}><Plus className="h-4 w-4" /> Add pair</button>}
          </div>
        )}
        {q.type === 'dragdrop' && <DragDropEditor q={q} set={set} />}
        {q.type === 'atom' && (
          <div className="grid gap-3 md:grid-cols-5">
            <L label="Element"><input className="field" value={q.element} onChange={(e) => set({ element: e.target.value })} /></L>
            <L label="Symbol"><input className="field" value={q.symbol} onChange={(e) => set({ symbol: e.target.value })} /></L>
            <L label="Atomic number (1–20)"><input className="field" type="number" min={1} max={20} value={q.atomicNumber} onChange={(e) => set({ atomicNumber: Number(e.target.value) })} /></L>
            <L label="Correct shells (e.g. 2, 8, 1)"><input className="field" value={(q.shells ?? []).join(', ')} onChange={(e) => set({ shells: e.target.value.split(/[,\s]+/).filter(Boolean).map(Number) })} /></L>
            <div className="flex items-end"><GameButton variant="ghost" className="text-sm" onClick={() => set({ shells: electronConfiguration(q.atomicNumber) })}><Wand2 className="h-4 w-4" /> From atomic number</GameButton></div>
          </div>
        )}
        {q.type === 'density' && (
          <div className="grid gap-3 md:grid-cols-5">
            <L label="Object"><input className="field" value={q.object} onChange={(e) => set({ object: e.target.value })} /></L>
            <L label="Mass (g)"><input className="field" type="number" value={q.mass} onChange={(e) => set({ mass: Number(e.target.value) })} /></L>
            <L label="Water before (mL)"><input className="field" type="number" value={q.waterBefore} onChange={(e) => set({ waterBefore: Number(e.target.value) })} /></L>
            <L label="Water after (mL)"><input className="field" type="number" value={q.waterAfter} onChange={(e) => set({ waterAfter: Number(e.target.value) })} /></L>
            <L label="Tolerance (g/cm³)"><input className="field" type="number" step="any" value={q.tolerance} onChange={(e) => set({ tolerance: Number(e.target.value) })} /></L>
            <p className="text-sm font-bold text-white/70 md:col-span-5">Correct density = {q.mass} ÷ ({q.waterAfter} − {q.waterBefore}) = <b>{(q.mass / Math.max(1e-9, q.waterAfter - q.waterBefore)).toFixed(2)} g/cm³</b></p>
          </div>
        )}
        {(q.type === 'mcq' || q.type === 'numeric' || q.type === 'truefalse') && (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <L label="Diagram"><select className="field" value={q.diagram?.kind ?? (q.image ? 'url' : 'none')} onChange={(e) => {
              const k = e.target.value;
              if (k === 'none') set({ diagram: undefined, image: undefined });
              else if (k === 'balance-cylinder') set({ diagram: { kind: 'balance-cylinder', mass: 120, volume: 40, object: 'rock' }, image: undefined });
              else if (k === 'carbon-cycle') set({ diagram: { kind: 'carbon-cycle' }, image: undefined });
              else set({ diagram: undefined, image: q.image ?? 'https://' });
            }}>
              <option value="none">None</option><option value="balance-cylinder">Balance + measuring cylinder</option><option value="carbon-cycle">Carbon cycle scene</option><option value="url">Image from a web address</option>
            </select></L>
            {q.diagram?.kind === 'balance-cylinder' && (<>
              <L label="Mass shown (g)"><input className="field" type="number" value={q.diagram.mass} onChange={(e) => set({ diagram: { ...q.diagram, mass: Number(e.target.value) } })} /></L>
              <L label="Volume shown (cm³)"><input className="field" type="number" value={q.diagram.volume} onChange={(e) => set({ diagram: { ...q.diagram, volume: Number(e.target.value) } })} /></L>
              <L label="Object"><select className="field" value={q.diagram.object ?? 'rock'} onChange={(e) => set({ diagram: { ...q.diagram, object: e.target.value } })}><option value="rock">Rock</option><option value="block">Block</option></select></L>
            </>)}
            {q.image !== undefined && !q.diagram && <L label="Image address (https://…)" className="md:col-span-3"><input className="field" value={q.image} onChange={(e) => set({ image: e.target.value })} /></L>}
          </div>
        )}
      </div>

      <L label="Explanation (shown with the correction)" className="mt-4"><textarea className="field min-h-[70px]" value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} /></L>

      <details className="mt-4 rounded-2xl bg-black/20 p-4" open={!!q.adapted}>
        <summary className="cursor-pointer font-extrabold">Adapted version (optional) — a simpler multiple-choice or true/false version for selected students</summary>
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!q.adapted} onChange={(e) => set({ adapted: e.target.checked ? { type: 'mcq', prompt: '', options: ['', '', '', ''], answer: 0 } : undefined })} /> Enable adapted version</label>
          {q.adapted && (
            <>
              <div className="grid gap-2 md:grid-cols-4">
                <L label="Type"><select className="field" value={q.adapted.type} onChange={(e) => set({ adapted: { ...q.adapted, type: e.target.value, answer: 0 } })}><option value="mcq">Multiple choice</option><option value="truefalse">True / False</option></select></L>
                <L label="Question shown on their phone" className="md:col-span-3"><input className="field" value={q.adapted.prompt} onChange={(e) => set({ adapted: { ...q.adapted, prompt: e.target.value } })} /></L>
              </div>
              {q.adapted.type === 'mcq' ? (q.adapted.options ?? []).map((o: string, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" checked={q.adapted.answer === i} onChange={() => set({ adapted: { ...q.adapted, answer: i } })} />
                  <span className="game-title w-6">{LETTERS[i]}</span>
                  <input className="field" value={o} onChange={(e) => { const opts = q.adapted.options.slice(); opts[i] = e.target.value; set({ adapted: { ...q.adapted, options: opts } }); }} />
                </div>
              )) : (
                <div className="flex gap-6 text-sm font-bold">
                  <label className="flex items-center gap-2"><input type="radio" checked={q.adapted.answer === 0} onChange={() => set({ adapted: { ...q.adapted, answer: 0 } })} /> True</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={q.adapted.answer === 1} onChange={() => set({ adapted: { ...q.adapted, answer: 1 } })} /> False</label>
                </div>
              )}
            </>
          )}
        </div>
      </details>

      {errors.length > 0 && <ul className="mt-4 list-disc rounded-xl bg-[#e8164f]/80 p-3 pl-8 text-sm font-bold" role="alert">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <div className="mt-5 flex justify-end gap-3">
        <GameButton variant="ghost" onClick={onClose}>Cancel</GameButton>
        <GameButton variant="green" onClick={save} disabled={saving}>Save question</GameButton>
      </div>
    </Modal>
  );
}

function DragDropEditor({ q, set }: { q: any; set: (p: any) => void }) {
  const zones = q.zones as any[];
  const upd = (i: number, patch: any) => { const zs = zones.slice(); zs[i] = { ...zs[i], ...patch }; set({ zones: zs }); };
  const presetCarbon = () => set({ diagram: { kind: 'carbon-cycle' }, zones: [
    { id: 'z1', x: 15, y: 25, w: 24, h: 11, answer: 'Photosynthesis' }, { id: 'z2', x: 22, y: 86, w: 24, h: 11, answer: 'Feeding' },
    { id: 'z3', x: 56, y: 36, w: 24, h: 11, answer: 'Respiration' }, { id: 'z4', x: 69, y: 60, w: 24, h: 11, answer: 'Decomposition' }] });
  const presetSequence = (n: number) => set({ diagram: { kind: 'sequence' }, zones: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, x: 1 + i * (100 / n), y: 38, w: 100 / n - 3, h: 24, label: String(i + 1), answer: zones[i]?.answer ?? '' })) });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <L label="Diagram"><select className="field" value={q.diagram?.kind} onChange={(e) => e.target.value === 'carbon-cycle' ? presetCarbon() : e.target.value === 'sequence' ? presetSequence(4) : set({ diagram: { kind: 'image', src: 'https://', aspect: 16 / 9 } })}>
            <option value="carbon-cycle">Carbon cycle (built-in)</option><option value="sequence">Sequence / ordering (built-in)</option><option value="image">My own image (web address)</option>
          </select></L>
          {q.diagram?.kind === 'image' && <L label="Image address" className="flex-1"><input className="field" value={q.diagram.src} onChange={(e) => set({ diagram: { ...q.diagram, src: e.target.value } })} /></L>}
          {q.diagram?.kind === 'sequence' && <GameButton variant="ghost" className="text-sm" onClick={() => presetSequence(zones.length + 1 > 6 ? 6 : zones.length + 1)}>+ step</GameButton>}
        </div>
        <p className="text-xs text-white/60">Drop zones use % of the diagram: x/y = top-left corner, w/h = size. Keep zones from overlapping; the preview updates live.</p>
        <div className="grid grid-cols-[1.6fr_0.6fr_repeat(4,0.55fr)_auto] gap-1 text-xs font-extrabold text-white/70"><span>Correct label</span><span>Hint</span><span>x</span><span>y</span><span>w</span><span>h</span><span /></div>
        {zones.map((z, i) => (
          <div key={i} className="grid grid-cols-[1.6fr_0.6fr_repeat(4,0.55fr)_auto] gap-1">
            <input className="field" value={z.answer} onChange={(e) => upd(i, { answer: e.target.value })} />
            <input className="field" value={z.label ?? ''} onChange={(e) => upd(i, { label: e.target.value || undefined })} />
            {(['x', 'y', 'w', 'h'] as const).map((k) => <input key={k} className="field !px-1" type="number" min={0} max={100} value={z[k]} onChange={(e) => upd(i, { [k]: Number(e.target.value) })} />)}
            <button className="rounded-full p-2 hover:bg-white/10" onClick={() => set({ zones: zones.filter((_, k) => k !== i) })} aria-label="Remove zone"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button className="flex items-center gap-1 self-start text-sm font-bold text-[#38e1ff]" onClick={() => set({ zones: [...zones, { id: `z${Date.now() % 100000}`, x: 40, y: 40, w: 22, h: 11, answer: '' }] })}><Plus className="h-4 w-4" /> Add drop zone</button>
        <L label="Extra wrong labels (distractors, separate with | )"><input className="field" value={(q.distractors ?? []).join(' | ')} onChange={(e) => set({ distractors: split(e.target.value) })} /></L>
      </div>
      <div className="rounded-2xl p-1 ring-2 ring-[#38e1ff]/60">
        <DiagramWithZones diagram={q.diagram} zones={zones} renderZone={(z) => (
          <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-[#14135a] bg-[#fbf0d9]/90 text-[10px] font-extrabold text-[#14135a]">{zones.find((x) => x.id === z.id)?.answer || '?'}</div>
        )} />
      </div>
    </div>
  );
}
