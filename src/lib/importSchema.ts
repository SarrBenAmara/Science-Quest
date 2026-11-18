import Papa from 'papaparse';
import type { Difficulty, Lab, QType, Question, QuestionBank, RoundPlan } from './types';
import { DEFAULT_POINTS, electronConfiguration } from './grading';
import { toCsv } from './report';

const LABS: Lab[] = ['biology', 'physics', 'chemistry'];
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const TYPES: QType[] = ['mcq', 'truefalse', 'fill', 'numeric', 'matching', 'dragdrop', 'atom', 'density'];

export interface ImportResult { bank: Omit<QuestionBank, 'id'>; errors: string[]; warnings: string[] }

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

/** Fill defaults and check one question. Returns the cleaned question or a list of problems. */
export function normalizeQuestion(raw: any, where = 'question'): { q?: Question; errors: string[] } {
  const errors: string[] = [];
  const err = (m: string) => errors.push(`${where}: ${m}`);
  if (!raw || typeof raw !== 'object') return { errors: [`${where}: not an object`] };
  const type = String(raw.type ?? '').toLowerCase().replace(/[^a-z]/g, '') as QType;
  const typeAlias: Record<string, QType> = { multiplechoice: 'mcq', tf: 'truefalse', fillintheblanks: 'fill', fillblank: 'fill', numerical: 'numeric', draganddrop: 'dragdrop', buildanatom: 'atom' };
  const t = (typeAlias[type] ?? type) as QType;
  if (!TYPES.includes(t)) return { errors: [`${where}: unknown type "${raw.type}"`] };
  const id = isStr(raw.id) ? raw.id.trim().replace(/[.#$\[\]\/]/g, '_') : '';
  if (!id) err('missing "id"');
  const lab = String(raw.lab ?? '').toLowerCase() as Lab;
  if (!LABS.includes(lab)) err(`"lab" must be biology, physics or chemistry`);
  const difficulty = (DIFFS.includes(String(raw.difficulty).toLowerCase() as Difficulty) ? String(raw.difficulty).toLowerCase() : 'medium') as Difficulty;
  const prompt = isStr(raw.prompt) ? raw.prompt.trim() : '';
  if (!prompt && t !== 'fill') err('missing "prompt"');
  const d = DEFAULT_POINTS[t];
  const base: any = {
    id, type: t, lab, topic: isStr(raw.topic) ? raw.topic.trim() : '', difficulty,
    prompt: prompt || 'Fill in the blanks with the correct words.',
    explanation: isStr(raw.explanation) ? raw.explanation.trim() : '',
    timeLimit: Math.max(5, Math.min(600, num(raw.timeLimit, d.time))),
    points: Math.max(0, num(raw.points, d.points)),
    speedBonus: Math.max(0, num(raw.speedBonus, d.speedBonus)),
  };
  if (isStr(raw.image)) base.image = raw.image.trim();
  if (raw.diagram && typeof raw.diagram === 'object') base.diagram = raw.diagram;
  if (raw.adapted && typeof raw.adapted === 'object') {
    const a = raw.adapted;
    const at = a.type === 'truefalse' ? 'truefalse' : 'mcq';
    const ans = at === 'truefalse' ? (a.answer === true || a.answer === 0 || String(a.answer).toLowerCase() === 'true' || a.answer === 'A' ? 0 : 1) : letterOrIndex(a.answer);
    base.adapted = { type: at, prompt: String(a.prompt ?? ''), answer: ans, ...(at === 'mcq' ? { options: (a.options ?? []).map(String) } : {}) };
  }

  switch (t) {
    case 'mcq': {
      const options: string[] = Array.isArray(raw.options) ? raw.options.map((o: unknown) => String(o).trim()) : [];
      if (options.length < 2 || options.length > 6) err('"options" needs 2–6 entries');
      const answer = letterOrIndex(raw.answer);
      if (!(answer >= 0 && answer < options.length)) err('"answer" must be a letter (A–D) or index of an option');
      return done({ ...base, options, answer });
    }
    case 'truefalse': {
      const a = raw.answer;
      const answer = a === true || /^(true|a|t|1)$/i.test(String(a));
      if (!(typeof a === 'boolean' || /^(true|false|a|b|t|f|0|1)$/i.test(String(a)))) err('"answer" must be true or false');
      return done({ ...base, answer, speedBonus: base.speedBonus });
    }
    case 'fill': {
      const text = isStr(raw.text) ? raw.text : prompt;
      const n = (text.match(/_{3,}/g) ?? []).length;
      const blanks = Array.isArray(raw.blanks) ? raw.blanks.map((b: any) => ({
        accepted: (Array.isArray(b) ? b : b?.accepted ?? []).map((x: unknown) => String(x).trim()).filter(Boolean),
        ...(Array.isArray(b?.rejected) && b.rejected.length ? { rejected: b.rejected.map(String) } : {}),
      })) : [];
      if (!n) err('"text" must contain at least one blank written as ___');
      if (blanks.length !== n) err(`"blanks" has ${blanks.length} entries but the text has ${n} blanks`);
      if (blanks.some((b: any) => !b.accepted.length)) err('every blank needs at least one accepted answer');
      return done({ ...base, text, blanks, speedBonus: 0, prompt: prompt || 'Fill in the blanks with the correct words.' });
    }
    case 'numeric': {
      const answer = num(raw.answer, NaN);
      if (!Number.isFinite(answer)) err('"answer" must be a number');
      return done({ ...base, answer, tolerance: Math.abs(num(raw.tolerance, 0.01)), toleranceType: raw.toleranceType === 'percent' ? 'percent' : 'absolute', unit: String(raw.unit ?? '') });
    }
    case 'matching': {
      const pairs = Array.isArray(raw.pairs) ? raw.pairs.map((p: any) => ({ left: String(p.left ?? p[0] ?? '').trim(), right: String(p.right ?? p[1] ?? '').trim() })) : [];
      if (pairs.length < 2 || pairs.length > 8) err('"pairs" needs 2–8 entries');
      if (pairs.some((p: any) => !p.left || !p.right)) err('each pair needs "left" and "right"');
      return done({ ...base, pairs, speedBonus: 0 });
    }
    case 'dragdrop': {
      const zones = Array.isArray(raw.zones) ? raw.zones.map((z: any, i: number) => ({
        id: isStr(z.id) ? z.id : `z${i + 1}`, x: num(z.x, 0), y: num(z.y, 0), w: num(z.w, 20), h: num(z.h, 10), answer: String(z.answer ?? '').trim(),
        ...(isStr(z.label) ? { label: z.label } : {}),
      })) : [];
      if (!raw.diagram) err('"diagram" is required (e.g. {"kind":"carbon-cycle"})');
      if (zones.length < 1) err('"zones" needs at least one drop zone');
      if (zones.some((z: any) => !z.answer)) err('every zone needs an "answer"');
      if (zones.some((z: any) => z.x < 0 || z.y < 0 || z.x + z.w > 100.01 || z.y + z.h > 100.01)) err('zone coordinates must stay within 0–100 %');
      return done({ ...base, diagram: raw.diagram, zones, distractors: (raw.distractors ?? []).map(String), speedBonus: 0 });
    }
    case 'atom': {
      const z = num(raw.atomicNumber, NaN);
      if (!(z >= 1 && z <= 20)) err('"atomicNumber" must be 1–20');
      const shells = Array.isArray(raw.shells) ? raw.shells.map((s: unknown) => num(s, 0)) : typeof raw.shells === 'string' ? raw.shells.split(/[,\s]+/).filter(Boolean).map(Number) : electronConfiguration(z);
      if (shells.reduce((a: number, b: number) => a + b, 0) !== z) err(`shells (${shells.join(',')}) must add up to ${z} electrons`);
      return done({ ...base, element: String(raw.element ?? ''), symbol: String(raw.symbol ?? ''), atomicNumber: z, shells, maxShells: num(raw.maxShells, 4), speedBonus: 0 });
    }
    case 'density': {
      const mass = num(raw.mass, NaN), before = num(raw.waterBefore, NaN), after = num(raw.waterAfter, NaN);
      if (!(mass > 0 && after > before && before >= 0)) err('density needs mass > 0 and waterAfter > waterBefore');
      return done({ ...base, object: String(raw.object ?? 'stone'), mass, waterBefore: before, waterAfter: after, tolerance: Math.abs(num(raw.tolerance, 0.05)) });
    }
  }
  return { errors };

  function done(q: any) { return errors.length ? { errors } : { q: q as Question, errors }; }
}

function letterOrIndex(a: unknown): number {
  if (typeof a === 'number') return a;
  const s = String(a ?? '').trim().toUpperCase();
  if (/^[A-F]$/.test(s)) return s.charCodeAt(0) - 65;
  return Number.isFinite(Number(s)) && s !== '' ? Number(s) : -1;
}

/** JSON import: either a bank object { name, questions: [...], presets } or a bare array of questions. */
export function parseJsonBank(text: string, fallbackName = 'Imported bank'): ImportResult {
  let data: any;
  try { data = JSON.parse(text); } catch (e) { return { bank: { name: fallbackName, questions: {} }, errors: [`Invalid JSON: ${(e as Error).message}`], warnings: [] }; }
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : data.questions ? Object.values(data.questions) : [];
  return collect(list, isStr(data.name) ? data.name : fallbackName, data.description, data.presets);
}

/** CSV import — one question per row. Columns are documented in docs/IMPORT_SCHEMA.md. */
export function parseCsvBank(text: string, fallbackName = 'Imported bank'): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  const list = parsed.data.map((r) => {
    const g = (k: string) => (r[k] ?? '').trim();
    const type = g('type');
    const q: any = { id: g('id'), type, lab: g('lab'), topic: g('topic'), difficulty: g('difficulty'), prompt: g('prompt'), explanation: g('explanation'), timeLimit: g('timeLimit'), points: g('points'), speedBonus: g('speedBonus') };
    const opts = ['optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'optionF'].map(g).filter(Boolean);
    if (opts.length) q.options = opts;
    q.answer = g('answer');
    if (g('text')) q.text = g('text');
    if (g('accepted')) q.blanks = g('accepted').split('|').map((b) => ({ accepted: b.split(';').map((s) => s.trim()).filter(Boolean) }));
    if (g('rejected') && q.blanks) g('rejected').split('|').forEach((b, i) => q.blanks[i] && (q.blanks[i].rejected = b.split(';').map((s) => s.trim()).filter(Boolean)));
    if (g('unit')) q.unit = g('unit');
    if (g('tolerance')) q.tolerance = g('tolerance');
    if (g('toleranceType')) q.toleranceType = g('toleranceType');
    if (g('pairs')) q.pairs = g('pairs').split('|').map((p) => { const [left, ...rest] = p.split('='); return { left: left?.trim(), right: rest.join('=').trim() }; });
    if (g('atomicNumber')) Object.assign(q, { atomicNumber: g('atomicNumber'), element: g('element'), symbol: g('symbol'), shells: g('shells') || undefined });
    if (g('mass')) Object.assign(q, { object: g('object'), mass: g('mass'), waterBefore: g('waterBefore'), waterAfter: g('waterAfter') });
    if (g('diagram')) { try { q.diagram = JSON.parse(g('diagram')); } catch { /* reported by validation */ } }
    if (g('adapted')) { try { q.adapted = JSON.parse(g('adapted')); } catch { /* ignored */ } }
    if (g('image')) q.image = g('image');
    if (g('distractors')) q.distractors = g('distractors').split('|').map((s) => s.trim()).filter(Boolean);
    if (g('zones')) { try { q.zones = JSON.parse(g('zones')); } catch { /* reported by validation */ } }
    return q;
  });
  const res = collect(list, fallbackName);
  parsed.errors.slice(0, 5).forEach((e) => res.errors.push(`CSV row ${(e.row ?? 0) + 2}: ${e.message}`));
  return res;
}

function collect(list: any[], name: string, description?: string, presets?: any): ImportResult {
  const questions: Record<string, Question> = {};
  const order: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  list.forEach((raw, i) => {
    const { q, errors: e } = normalizeQuestion(raw, `Question ${i + 1}${raw?.id ? ` (${raw.id})` : ''}`);
    if (e.length || !q) { errors.push(...e); return; }
    if (questions[q.id]) { warnings.push(`Duplicate id ${q.id} — later copy renamed ${q.id}_${i}`); q.id = `${q.id}_${i}`; }
    questions[q.id] = q;
    order.push(q.id);
  });
  const cleanPresets: Record<string, { name: string; rounds: RoundPlan[] }> = {};
  if (presets && typeof presets === 'object') {
    for (const [k, p] of Object.entries<any>(presets)) {
      if (!Array.isArray(p?.rounds)) continue;
      cleanPresets[k.replace(/[.#$\[\]\/]/g, '_')] = {
        name: String(p.name ?? k),
        rounds: p.rounds.map((r: any) => ({
          title: String(r.title ?? 'Round'), lab: ['biology', 'physics', 'chemistry'].includes(r.lab) ? r.lab : 'mixed', subtitle: String(r.subtitle ?? ''),
          questionIds: (r.questionIds ?? []).filter((id: string) => { const ok = !!questions[id]; if (!ok) warnings.push(`Preset "${p.name ?? k}" refers to missing question ${id}`); return ok; }),
        })),
      };
    }
  }
  return { bank: { name, ...(description ? { description } : {}), questions, order, ...(Object.keys(cleanPresets).length ? { presets: cleanPresets } : {}) }, errors, warnings };
}

export function exportBankJson(bank: QuestionBank): string {
  const order = bank.order?.filter((id) => bank.questions[id]) ?? [];
  const ids = [...order, ...Object.keys(bank.questions).filter((id) => !order.includes(id))];
  return JSON.stringify({ schema: 'science-quest/v1', name: bank.name, description: bank.description ?? '', questions: ids.map((id) => bank.questions[id]), presets: bank.presets ?? {} }, null, 2);
}

export function exportBankCsv(bank: QuestionBank): string {
  const cols = ['id', 'type', 'lab', 'topic', 'difficulty', 'prompt', 'optionA', 'optionB', 'optionC', 'optionD', 'answer', 'text', 'accepted', 'rejected', 'unit', 'tolerance', 'toleranceType', 'pairs', 'atomicNumber', 'element', 'symbol', 'shells', 'object', 'mass', 'waterBefore', 'waterAfter', 'diagram', 'zones', 'distractors', 'adapted', 'image', 'explanation', 'timeLimit', 'points', 'speedBonus'];
  const rows: (string | number)[][] = [cols];
  for (const q of Object.values(bank.questions)) {
    const r: Record<string, string | number> = { id: q.id, type: q.type, lab: q.lab, topic: q.topic, difficulty: q.difficulty, prompt: q.prompt, explanation: q.explanation, timeLimit: q.timeLimit, points: q.points, speedBonus: q.speedBonus ?? 0 };
    if (q.type === 'mcq') { q.options.forEach((o, i) => (r['option' + 'ABCDEF'[i]] = o)); r.answer = 'ABCDEF'[q.answer]; }
    if (q.type === 'truefalse') r.answer = q.answer ? 'true' : 'false';
    if (q.type === 'fill') { r.text = q.text; r.accepted = q.blanks.map((b) => b.accepted.join(';')).join('|'); r.rejected = q.blanks.map((b) => (b.rejected ?? []).join(';')).join('|'); }
    if (q.type === 'numeric') Object.assign(r, { answer: q.answer, unit: q.unit, tolerance: q.tolerance, toleranceType: q.toleranceType });
    if (q.type === 'matching') r.pairs = q.pairs.map((p) => `${p.left}=${p.right}`).join('|');
    if (q.type === 'atom') Object.assign(r, { atomicNumber: q.atomicNumber, element: q.element, symbol: q.symbol, shells: q.shells.join(',') });
    if (q.type === 'density') Object.assign(r, { object: q.object, mass: q.mass, waterBefore: q.waterBefore, waterAfter: q.waterAfter, tolerance: q.tolerance });
    if (q.type === 'dragdrop') { r.zones = JSON.stringify(q.zones); r.distractors = (q.distractors ?? []).join('|'); }
    if (q.diagram) r.diagram = JSON.stringify(q.diagram);
    if (q.adapted) r.adapted = JSON.stringify(q.adapted);
    if (q.image) r.image = q.image;
    rows.push(cols.map((c) => r[c] ?? ''));
  }
  return toCsv(rows, false);
}
