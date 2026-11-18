import { confirmAction, askText } from '../../lib/env';
import { useMemo, useRef, useState } from 'react';
import { Copy, Download, Eye, FilePlus2, FolderPlus, Pencil, Plus, Search, Shuffle, Trash2, Upload, ListChecks } from 'lucide-react';
import { GameButton, Modal } from '../../components/ui';
import { deleteBank, deleteQuestions, newId, orderedQuestions, saveBank, saveQuestion, uniqueQuestionId } from '../../game/banks';
import { exportBankCsv, exportBankJson, parseCsvBank, parseJsonBank } from '../../lib/importSchema';
import { shuffle } from '../../lib/game';
import { LAB_LABEL, QTYPE_LABEL, type Question, type QuestionBank as Bank, type RoundPlan } from '../../lib/types';
import { QuestionEditor, blankQuestion } from './QuestionEditor';
import { PreviewModal } from './Preview';
import { download, roundsByLab, Section, type TeacherCtx } from './common';

const LAB_DOT: Record<string, string> = { biology: 'bg-[#35d64a]', physics: 'bg-[#2f9bff]', chemistry: 'bg-[#a64dff]' };

export function QuestionBankManager({ ctx, selectedBankId, setSelectedBankId, onUseInGame }: {
  ctx: TeacherCtx; selectedBankId: string | null; setSelectedBankId: (id: string) => void; onUseInGame: (bank: Bank, rounds: RoundPlan[]) => void;
}) {
  const { db, uid, banks, toast } = ctx;
  const bank = selectedBankId ? banks[selectedBankId] : null;
  const [filters, setFilters] = useState({ lab: '', difficulty: '', type: '', topic: '', text: '' });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ q: Question; isNew: boolean } | null>(null);
  const [preview, setPreview] = useState<Question | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string[] | null>(null);

  const all = useMemo(() => (bank ? orderedQuestions(bank) : []), [bank]);
  const topics = useMemo(() => Array.from(new Set(all.map((q) => q.topic).filter(Boolean))).sort(), [all]);
  const shown = all.filter((q) =>
    (!filters.lab || q.lab === filters.lab) && (!filters.difficulty || q.difficulty === filters.difficulty) &&
    (!filters.type || q.type === filters.type) && (!filters.topic || q.topic === filters.topic) &&
    (!filters.text || `${q.id} ${q.prompt} ${q.topic} ${(q as any).text ?? ''}`.toLowerCase().includes(filters.text.toLowerCase())));
  const toggle = (id: string) => setChecked((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownChecked = shown.length > 0 && shown.every((q) => checked.has(q.id));

  const createBank = async () => {
    const name = askText('Name of the new question bank (e.g. "Year 9 — Class B")', 'New question bank');
    if (!name) return;
    const id = await saveBank(db, uid, { name, questions: {}, order: [] });
    setSelectedBankId(id);
    toast.ok('Question bank created');
  };
  const renameBank = async () => {
    if (!bank) return;
    const name = askText('New name for this bank', bank.name);
    if (!name) return;
    await db.set(`teachers/${uid}/banks/${bank.id}/name`, name);
  };
  const duplicateBank = async () => {
    if (!bank) return;
    const id = await saveBank(db, uid, { ...bank, id: newId(), name: `${bank.name} (copy)` });
    setSelectedBankId(id);
    toast.ok('Bank duplicated');
  };
  const removeBank = async () => {
    if (!bank || !confirmAction(`Delete the whole bank "${bank.name}" (${all.length} questions)? This cannot be undone.`)) return;
    await deleteBank(db, uid, bank.id);
    toast.ok('Bank deleted');
  };
  const shuffleOrder = async () => {
    if (!bank) return;
    await db.set(`teachers/${uid}/banks/${bank.id}/order`, shuffle(all.map((q) => q.id)));
    toast.ok('Question order shuffled');
  };
  const duplicateQ = async (q: Question) => {
    if (!bank) return;
    const copy = { ...structuredClone(q), id: uniqueQuestionId(bank, `${q.id}_copy`) };
    await saveQuestion(db, uid, bank, copy);
    toast.ok(`Duplicated as ${copy.id}`);
  };
  const useSelected = () => {
    if (!bank) return;
    const qs = all.filter((q) => checked.has(q.id));
    if (!qs.length) return toast.err('Tick the questions you want first');
    onUseInGame(bank, roundsByLab(qs));
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Question Bank Manager" icon={<ListChecks className="h-7 w-7" />} right={
        <div className="flex flex-wrap gap-2">
          <GameButton variant="ghost" className="text-sm" onClick={createBank}><FolderPlus className="h-4 w-4" /> New bank</GameButton>
          <GameButton variant="purple" className="text-sm" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import CSV / JSON</GameButton>
        </div>
      }>
        {!Object.keys(banks).length ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="game-title text-2xl">No question banks yet</p>
            <p className="max-w-lg text-white/75">Import the <b>science-quest-50.json</b> file (your 50-question Science Quest bank) or create an empty bank and add your own questions.</p>
            <div className="flex gap-3"><GameButton variant="yellow" onClick={() => setImportOpen(true)}><Upload className="h-5 w-5" /> Import a bank</GameButton><GameButton onClick={createBank}><FolderPlus className="h-5 w-5" /> Empty bank</GameButton></div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm font-extrabold">Bank
                <select className="field" value={selectedBankId ?? ''} onChange={(e) => setSelectedBankId(e.target.value)}>
                  {Object.values(banks).map((b) => <option key={b.id} value={b.id}>{b.name} ({Object.keys(b.questions).length})</option>)}
                </select>
              </label>
              <GameButton variant="ghost" className="text-sm" onClick={renameBank}><Pencil className="h-4 w-4" /> Rename</GameButton>
              <GameButton variant="ghost" className="text-sm" onClick={duplicateBank}><Copy className="h-4 w-4" /> Duplicate</GameButton>
              <GameButton variant="ghost" className="text-sm" onClick={() => bank && download(`${bank.name.replace(/[^\w-]+/g, '_')}.json`, exportBankJson(bank), 'application/json')}><Download className="h-4 w-4" /> JSON</GameButton>
              <GameButton variant="ghost" className="text-sm" onClick={() => bank && download(`${bank.name.replace(/[^\w-]+/g, '_')}.csv`, exportBankCsv(bank), 'text/csv')}><Download className="h-4 w-4" /> CSV</GameButton>
              <GameButton variant="red" className="text-sm" onClick={removeBank}><Trash2 className="h-4 w-4" /> Delete bank</GameButton>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-6">
              <div className="relative md:col-span-2"><Search className="absolute left-2 top-2.5 h-4 w-4 text-white/50" /><input className="field pl-8" placeholder="Search questions…" value={filters.text} onChange={(e) => setFilters({ ...filters, text: e.target.value })} /></div>
              <select className="field" value={filters.lab} onChange={(e) => setFilters({ ...filters, lab: e.target.value })}><option value="">All subjects</option><option value="biology">Biology</option><option value="physics">Physics</option><option value="chemistry">Chemistry</option></select>
              <select className="field" value={filters.topic} onChange={(e) => setFilters({ ...filters, topic: e.target.value })}><option value="">All topics</option>{topics.map((t) => <option key={t}>{t}</option>)}</select>
              <select className="field" value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}><option value="">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Challenging</option></select>
              <select className="field" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">All types</option>{Object.entries(QTYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <GameButton variant="green" className="text-sm" onClick={() => bank && setEditing({ q: blankQuestion('mcq', uniqueQuestionId(bank, `Q${all.length + 1}`), { lab: (filters.lab || 'biology') as any }), isNew: true })} disabled={!bank}><Plus className="h-4 w-4" /> Add question</GameButton>
              <GameButton variant="yellow" className="text-sm" onClick={useSelected} disabled={!checked.size}><FilePlus2 className="h-4 w-4" /> Use {checked.size || ''} selected in the game</GameButton>
              <GameButton variant="ghost" className="text-sm" onClick={shuffleOrder}><Shuffle className="h-4 w-4" /> Shuffle order</GameButton>
              <GameButton variant="red" className="text-sm" disabled={!checked.size} onClick={() => setConfirmDel(Array.from(checked))}><Trash2 className="h-4 w-4" /> Delete selected</GameButton>
              <span className="ml-auto text-sm font-bold text-white/70">{shown.length} of {all.length} questions shown</span>
            </div>
            <div className="mt-3 max-h-[60vh] overflow-auto rounded-xl ring-1 ring-[#38e1ff]/30 scroll-thin">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#0b1a5c]">
                  <tr className="text-white/80">
                    <th className="p-2"><input type="checkbox" aria-label="Select all shown" checked={allShownChecked} onChange={() => setChecked((c) => { const n = new Set(c); shown.forEach((q) => (allShownChecked ? n.delete(q.id) : n.add(q.id))); return n; })} /></th>
                    <th className="p-2">ID</th><th className="p-2">Type</th><th className="p-2">Question</th><th className="p-2">Topic</th><th className="p-2">Level</th><th className="p-2">Time</th><th className="p-2">Pts</th><th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((q) => (
                    <tr key={q.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-2"><input type="checkbox" checked={checked.has(q.id)} onChange={() => toggle(q.id)} aria-label={`Select ${q.id}`} /></td>
                      <td className="whitespace-nowrap p-2 font-extrabold"><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${LAB_DOT[q.lab]}`} title={LAB_LABEL[q.lab]} />{q.id}</td>
                      <td className="whitespace-nowrap p-2">{QTYPE_LABEL[q.type]}{q.adapted ? ' ★' : ''}</td>
                      <td className="max-w-[420px] p-2"><span className="line-clamp-2">{q.type === 'fill' ? (q as any).text : q.prompt}</span></td>
                      <td className="p-2 text-white/80">{q.topic}</td>
                      <td className="p-2 capitalize">{q.difficulty === 'hard' ? 'challenging' : q.difficulty}</td>
                      <td className="p-2">{q.timeLimit}s</td>
                      <td className="p-2">{q.points + (q.speedBonus ?? 0)}</td>
                      <td className="whitespace-nowrap p-2 text-right">
                        <button className="rounded-full p-2 hover:bg-white/10" title="Preview" aria-label={`Preview ${q.id}`} onClick={() => setPreview(q)}><Eye className="h-4 w-4" /></button>
                        <button className="rounded-full p-2 hover:bg-white/10" title="Edit" aria-label={`Edit ${q.id}`} onClick={() => setEditing({ q, isNew: false })}><Pencil className="h-4 w-4" /></button>
                        <button className="rounded-full p-2 hover:bg-white/10" title="Duplicate" aria-label={`Duplicate ${q.id}`} onClick={() => duplicateQ(q)}><Copy className="h-4 w-4" /></button>
                        <button className="rounded-full p-2 hover:bg-white/10" title="Delete" aria-label={`Delete ${q.id}`} onClick={() => setConfirmDel([q.id])}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={9} className="p-6 text-center text-white/60">No questions match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-white/60">★ = has an adapted (simpler) version. Answer keys are stored only in your teacher account and are never sent to student phones before the correction.</p>
          </>
        )}
      </Section>

      {editing && bank && (
        <QuestionEditor
          initial={editing.q}
          isNew={editing.isNew}
          existingIds={Object.keys(bank.questions)}
          onClose={() => setEditing(null)}
          onSave={async (q) => { await saveQuestion(db, uid, bank, q, editing.isNew ? undefined : editing.q.id); toast.ok(`Saved ${q.id}`); }}
        />
      )}
      <PreviewModal question={preview} onClose={() => setPreview(null)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} ctx={ctx} currentBank={bank} onImported={(id) => { setSelectedBankId(id); setImportOpen(false); }} />
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete questions?">
        <p className="mb-4">Delete {confirmDel?.length} question(s): <b>{confirmDel?.join(', ')}</b>? This cannot be undone (export the bank first if you want a backup).</p>
        <div className="flex justify-end gap-3">
          <GameButton variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</GameButton>
          <GameButton variant="red" onClick={async () => { if (bank && confirmDel) { await deleteQuestions(db, uid, bank, confirmDel); setChecked(new Set()); toast.ok('Deleted'); } setConfirmDel(null); }}>Delete</GameButton>
        </div>
      </Modal>
    </div>
  );
}

function ImportModal({ open, onClose, ctx, currentBank, onImported }: { open: boolean; onClose: () => void; ctx: TeacherCtx; currentBank: Bank | null; onImported: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ReturnType<typeof parseJsonBank> | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'new' | 'merge'>('new');
  const [busy, setBusy] = useState(false);
  const read = async (f: File) => {
    const text = await f.text();
    setFileName(f.name);
    const base = f.name.replace(/\.(json|csv)$/i, '');
    setResult(/\.csv$/i.test(f.name) ? parseCsvBank(text, base) : parseJsonBank(text, base));
  };
  const save = async () => {
    if (!result) return;
    setBusy(true);
    try {
      if (mode === 'merge' && currentBank) {
        const upd: Record<string, any> = {};
        const order = (currentBank.order ?? []).slice();
        for (const id of result.bank.order ?? Object.keys(result.bank.questions)) {
          upd[`questions/${id}`] = JSON.parse(JSON.stringify(result.bank.questions[id]));
          if (!order.includes(id)) order.push(id);
        }
        upd.order = order;
        for (const [k, p] of Object.entries(result.bank.presets ?? {})) upd[`presets/${k}`] = p;
        await ctx.db.update(`teachers/${ctx.uid}/banks/${currentBank.id}`, upd);
        ctx.toast.ok(`Merged ${Object.keys(result.bank.questions).length} questions into ${currentBank.name}`);
        onImported(currentBank.id);
      } else {
        const id = await saveBank(ctx.db, ctx.uid, result.bank);
        ctx.toast.ok(`Imported ${Object.keys(result.bank.questions).length} questions`);
        onImported(id);
      }
      setResult(null);
    } catch (e) { ctx.toast.err((e as Error).message); } finally { setBusy(false); }
  };
  const n = result ? Object.keys(result.bank.questions).length : 0;
  return (
    <Modal open={open} onClose={onClose} title="Import questions">
      <p className="mb-3 text-sm text-white/80">Upload a <b>.json</b> file (Science Quest format — all question types) or a <b>.csv</b> file (one question per row). The format is described in <i>docs/IMPORT_SCHEMA.md</i>.</p>
      <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      <GameButton variant="purple" onClick={() => fileRef.current?.click()}><Upload className="h-5 w-5" /> Choose file</GameButton>
      {fileName && <span className="ml-3 text-sm font-bold">{fileName}</span>}
      {result && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="font-extrabold">{n} valid question(s) found{result.bank.presets ? ` · ${Object.keys(result.bank.presets).length} game preset(s)` : ''}.</p>
          {result.errors.length > 0 && <ul className="max-h-40 list-disc overflow-auto rounded-xl bg-[#e8164f]/70 p-3 pl-8 text-sm font-bold scroll-thin">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {result.warnings.length > 0 && <ul className="max-h-32 list-disc overflow-auto rounded-xl bg-[#f5b301]/40 p-3 pl-8 text-sm font-bold scroll-thin">{result.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <div className="flex flex-col gap-1 text-sm font-bold">
            <label className="flex items-center gap-2"><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Create a new bank “{result.bank.name}”</label>
            {currentBank && <label className="flex items-center gap-2"><input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Add to “{currentBank.name}” (questions with the same ID are replaced)</label>}
          </div>
          <div className="flex justify-end"><GameButton variant="green" disabled={!n || busy} onClick={save}>Import {n} questions</GameButton></div>
        </div>
      )}
    </Modal>
  );
}
