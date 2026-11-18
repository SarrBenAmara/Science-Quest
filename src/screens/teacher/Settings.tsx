import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, SlidersHorizontal, Trash2, Wand2, X } from 'lucide-react';
import { GameButton } from '../../components/ui';
import { orderedQuestions } from '../../game/banks';
import { QTYPE_LABEL, type GameSettings, type Lab, type QuestionBank, type RoundPlan } from '../../lib/types';
import { quickBuild, Section } from './common';

const LABS: (Lab | 'mixed')[] = ['biology', 'physics', 'chemistry', 'mixed'];

export function SettingsPanel({ bank, banks, settings, selection, locked, onSave, onChangeBank }: {
  bank: QuestionBank | null; banks: Record<string, QuestionBank>; settings: GameSettings; selection: RoundPlan[]; locked: boolean;
  onSave: (s: GameSettings, sel: RoundPlan[]) => Promise<void>; onChangeBank: (id: string) => void;
}) {
  const [s, setS] = useState(settings);
  const [sel, setSel] = useState<RoundPlan[]>(selection);
  const [dirty, setDirty] = useState(false);
  const [quick, setQuick] = useState({ labs: ['biology', 'physics', 'chemistry'] as Lab[], perRound: 6, difficulties: ['easy', 'medium', 'hard'], types: Object.keys(QTYPE_LABEL), finalRound: true });
  useEffect(() => { if (!dirty) { setS(settings); setSel(selection); } }, [settings, selection, dirty]);
  const upd = (p: Partial<GameSettings>) => { setS({ ...s, ...p }); setDirty(true); };
  const updSel = (next: RoundPlan[]) => { setSel(next); setDirty(true); };
  const total = sel.reduce((n, r) => n + r.questionIds.length, 0);
  const qs = bank ? orderedQuestions(bank) : [];
  const save = async () => { await onSave(s, sel); setDirty(false); };
  const move = (ri: number, qi: number, d: number) => {
    const next = structuredClone(sel);
    const ids = next[ri].questionIds;
    const j = qi + d;
    if (j < 0 || j >= ids.length) return;
    [ids[qi], ids[j]] = [ids[j], ids[qi]];
    updSel(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Game Settings" icon={<SlidersHorizontal className="h-7 w-7" />} right={<GameButton variant="green" disabled={!dirty} onClick={save}><Save className="h-5 w-5" /> Save settings</GameButton>}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-extrabold">How students play
            <select className="field" value={s.playMode ?? 'teams'} disabled={locked} onChange={(e) => upd({ playMode: e.target.value as any })}><option value="teams">Teams + individual scores</option><option value="individual">Individual only (no teams)</option></select>
          </label>
          <label className={`flex flex-col gap-1 text-sm font-extrabold ${s.playMode === 'individual' ? 'opacity-40' : ''}`}>Number of teams
            <div className="flex gap-2">{[2, 3, 4, 5].map((n) => <button key={n} onClick={() => upd({ teamCount: n })} disabled={locked || s.playMode === 'individual'} className={`game-title h-11 flex-1 rounded-xl text-xl ${s.teamCount === n ? 'bg-[#2f7bff] shadow-[0_0_14px_#38e1ff]' : 'bg-white/10'} disabled:opacity-50`}>{n}</button>)}</div>
          </label>
          <label className="flex flex-col gap-1 text-sm font-extrabold">Question order
            <select className="field" value={s.questionOrder} disabled={locked} onChange={(e) => upd({ questionOrder: e.target.value as any })}><option value="listed">As listed in the rounds</option><option value="shuffle-within-rounds">Shuffle within each round</option></select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-extrabold">Show rankings
            <select className="field" value={s.leaderboardFrequency} onChange={(e) => upd({ leaderboardFrequency: e.target.value as any })}><option value="question">After every question</option><option value="round">After every round</option><option value="end">Only at the end</option></select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-extrabold">Time limits
            <select className="field" value={s.timeMultiplier} disabled={locked} onChange={(e) => upd({ timeMultiplier: Number(e.target.value) })}><option value={0.75}>Shorter (×0.75)</option><option value={1}>Each question&apos;s own time</option><option value={1.5}>Longer (×1.5)</option><option value={2}>Double (×2)</option></select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-extrabold">Maximum players
            <input className="field" type="number" min={2} max={100} disabled={locked} value={s.maxPlayers} onChange={(e) => upd({ maxPlayers: Math.max(2, Math.min(100, Number(e.target.value))) })} />
          </label>
          <div className="flex flex-col gap-2 text-sm font-bold">
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.shuffleOptions} disabled={locked} onChange={(e) => upd({ shuffleOptions: e.target.checked })} /> Shuffle A–D options</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.autoRevealWhenAllSubmitted} onChange={(e) => upd({ autoRevealWhenAllSubmitted: e.target.checked })} /> Reveal automatically when everyone has answered</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.autoCloseOnTimeout} onChange={(e) => upd({ autoCloseOnTimeout: e.target.checked })} /> Close automatically when the timer ends</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.allowLateJoin} onChange={(e) => upd({ allowLateJoin: e.target.checked })} /> Allow late joiners</label>
          </div>
        </div>
        <p className="mt-3 text-xs text-white/60">Scoring: each question has its own maximum points (edit them in the Question Bank). Single-answer questions add a speed bonus; multi-part questions give partial credit per correct part. Team score = sum of its members&apos; scores.</p>
      </Section>

      <Section title={`Questions in this game · ${total}`} icon={<Wand2 className="h-7 w-7" />} right={locked ? <span className="text-sm font-bold text-[#ffd23f]">Locked — the game has started</span> : undefined}>
        <div className={`flex flex-col gap-4 ${locked ? 'pointer-events-none opacity-60' : ''}`}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-extrabold">Question bank
              <select className="field" value={bank?.id ?? ''} onChange={(e) => { onChangeBank(e.target.value); setDirty(false); }}>{Object.values(banks).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </label>
            {bank?.presets && Object.keys(bank.presets).length > 0 && (
              <label className="flex flex-col gap-1 text-sm font-extrabold">Load a ready-made game
                <select className="field" value="" onChange={(e) => { const p = bank.presets![e.target.value]; if (p) updSel(p.rounds.map((r) => ({ ...r, questionIds: (r.questionIds ?? []).filter((id) => bank.questions[id]) }))); }}>
                  <option value="">Choose…</option>
                  {Object.entries(bank.presets).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
                </select>
              </label>
            )}
          </div>

          <details className="rounded-2xl bg-black/20 p-3">
            <summary className="cursor-pointer font-extrabold">Quick build: pick by laboratory, difficulty and question type</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <fieldset className="text-sm font-bold"><legend className="mb-1 font-extrabold">Laboratories</legend>
                {(['biology', 'physics', 'chemistry'] as Lab[]).map((l) => <label key={l} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={quick.labs.includes(l)} onChange={(e) => setQuick({ ...quick, labs: e.target.checked ? [...quick.labs, l] : quick.labs.filter((x) => x !== l) })} /> {l}</label>)}
                <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={quick.finalRound} onChange={(e) => setQuick({ ...quick, finalRound: e.target.checked })} /> Final mixed round</label>
              </fieldset>
              <fieldset className="text-sm font-bold"><legend className="mb-1 font-extrabold">Difficulty</legend>
                {['easy', 'medium', 'hard'].map((d) => <label key={d} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={quick.difficulties.includes(d)} onChange={(e) => setQuick({ ...quick, difficulties: e.target.checked ? [...quick.difficulties, d] : quick.difficulties.filter((x) => x !== d) })} /> {d === 'hard' ? 'challenging' : d}</label>)}
              </fieldset>
              <fieldset className="text-sm font-bold"><legend className="mb-1 font-extrabold">Question types</legend>
                {Object.entries(QTYPE_LABEL).map(([k, v]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={quick.types.includes(k)} onChange={(e) => setQuick({ ...quick, types: e.target.checked ? [...quick.types, k] : quick.types.filter((x) => x !== k) })} /> {v}</label>)}
              </fieldset>
              <div className="flex flex-col gap-2 text-sm font-extrabold">
                <label className="flex flex-col gap-1">Questions per round<input className="field" type="number" min={1} max={30} value={quick.perRound} onChange={(e) => setQuick({ ...quick, perRound: Number(e.target.value) })} /></label>
                <GameButton variant="yellow" className="text-base" onClick={() => bank && updSel(quickBuild(bank, quick))}><Wand2 className="h-5 w-5" /> Build rounds</GameButton>
              </div>
            </div>
          </details>

          {sel.map((r, ri) => (
            <div key={ri} className="rounded-2xl bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input className="field max-w-xs font-extrabold" value={r.title} onChange={(e) => { const n = structuredClone(sel); n[ri].title = e.target.value; updSel(n); }} aria-label="Round title" />
                <input className="field max-w-xs" value={r.subtitle ?? ''} placeholder="Subtitle" onChange={(e) => { const n = structuredClone(sel); n[ri].subtitle = e.target.value; updSel(n); }} aria-label="Round subtitle" />
                <select className="field max-w-[160px]" value={r.lab} onChange={(e) => { const n = structuredClone(sel); n[ri].lab = e.target.value as any; updSel(n); }}>{LABS.map((l) => <option key={l} value={l}>{l === 'mixed' ? 'Final / mixed' : l[0].toUpperCase() + l.slice(1)}</option>)}</select>
                <span className="text-sm font-bold text-white/70">{r.questionIds.length} questions</span>
                <button className="ml-auto rounded-full p-2 hover:bg-white/10" onClick={() => updSel(sel.filter((_, k) => k !== ri))} aria-label="Remove round"><Trash2 className="h-4 w-4" /></button>
              </div>
              <ol className="mt-2 flex flex-col gap-1">
                {r.questionIds.map((id, qi) => {
                  const q = bank?.questions[id];
                  return (
                    <li key={`${id}-${qi}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-sm">
                      <span className="w-6 text-white/50">{qi + 1}.</span>
                      <b className="w-12">{id}</b>
                      <span className="flex-1 truncate">{q ? (q.type === 'fill' ? (q as any).text : q.prompt) : '⚠ missing from bank'}</span>
                      <span className="hidden text-white/60 md:inline">{q ? QTYPE_LABEL[q.type] : ''}</span>
                      <button onClick={() => move(ri, qi, -1)} aria-label="Move up" className="p-1"><ArrowUp className="h-4 w-4" /></button>
                      <button onClick={() => move(ri, qi, 1)} aria-label="Move down" className="p-1"><ArrowDown className="h-4 w-4" /></button>
                      <button onClick={() => { const n = structuredClone(sel); n[ri].questionIds.splice(qi, 1); updSel(n); }} aria-label="Remove from round" className="p-1"><X className="h-4 w-4" /></button>
                    </li>
                  );
                })}
              </ol>
              <select className="field mt-2 max-w-md" value="" onChange={(e) => { if (!e.target.value) return; const n = structuredClone(sel); n[ri].questionIds.push(e.target.value); updSel(n); }}>
                <option value="">+ Add a question to this round…</option>
                {qs.filter((q) => !sel.some((x) => x.questionIds.includes(q.id))).map((q) => <option key={q.id} value={q.id}>{q.id} · {QTYPE_LABEL[q.type]} · {(q.type === 'fill' ? (q as any).text : q.prompt).slice(0, 60)}</option>)}
              </select>
            </div>
          ))}
          <GameButton variant="ghost" className="self-start" onClick={() => updSel([...sel, { title: `Round ${sel.length + 1}`, lab: 'mixed', subtitle: '', questionIds: [] }])}><Plus className="h-5 w-5" /> Add round</GameButton>
        </div>
      </Section>
    </div>
  );
}
