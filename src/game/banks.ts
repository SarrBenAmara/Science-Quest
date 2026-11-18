import type { Backend } from '../backend';
import type { Question, QuestionBank } from '../lib/types';

const bankPath = (uid: string, id?: string) => `teachers/${uid}/banks${id ? `/${id}` : ''}`;

export function newId(prefix = 'b'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function listenBanks(db: Backend, uid: string, cb: (banks: Record<string, QuestionBank>) => void) {
  return db.listen(bankPath(uid), (v) => {
    const out: Record<string, QuestionBank> = {};
    for (const [id, b] of Object.entries<any>(v ?? {})) out[id] = { ...b, id, questions: b.questions ?? {}, order: b.order ?? [] };
    cb(out);
  });
}

export async function saveBank(db: Backend, uid: string, bank: Omit<QuestionBank, 'id'> & { id?: string }): Promise<string> {
  const id = bank.id ?? newId();
  const { id: _drop, ...rest } = bank as QuestionBank;
  await db.set(bankPath(uid, id), JSON.parse(JSON.stringify({ ...rest, updatedAt: Date.now() })));
  return id;
}

export async function saveQuestion(db: Backend, uid: string, bank: QuestionBank, q: Question, previousId?: string) {
  const upd: Record<string, any> = { [`questions/${q.id}`]: JSON.parse(JSON.stringify(q)), updatedAt: Date.now() };
  const order = (bank.order ?? []).slice();
  if (previousId && previousId !== q.id) {
    upd[`questions/${previousId}`] = null;
    const i = order.indexOf(previousId);
    if (i >= 0) order[i] = q.id;
  } else if (!order.includes(q.id)) order.push(q.id);
  upd.order = order;
  // Keep presets pointing at the renamed id.
  if (previousId && previousId !== q.id && bank.presets) {
    for (const [pk, p] of Object.entries(bank.presets)) {
      p.rounds.forEach((r, ri) => {
        if (r.questionIds.includes(previousId)) upd[`presets/${pk}/rounds/${ri}/questionIds`] = r.questionIds.map((x) => (x === previousId ? q.id : x));
      });
    }
  }
  await db.update(bankPath(uid, bank.id), upd);
}

export async function deleteQuestions(db: Backend, uid: string, bank: QuestionBank, ids: string[]) {
  const upd: Record<string, any> = { updatedAt: Date.now(), order: (bank.order ?? []).filter((x) => !ids.includes(x)) };
  ids.forEach((id) => (upd[`questions/${id}`] = null));
  for (const [pk, p] of Object.entries(bank.presets ?? {})) {
    p.rounds.forEach((r, ri) => {
      if (r.questionIds.some((x) => ids.includes(x))) upd[`presets/${pk}/rounds/${ri}/questionIds`] = r.questionIds.filter((x) => !ids.includes(x));
    });
  }
  await db.update(bankPath(uid, bank.id), upd);
}

export async function deleteBank(db: Backend, uid: string, id: string) {
  await db.remove(bankPath(uid, id));
}

export function uniqueQuestionId(bank: QuestionBank, base: string): string {
  if (!bank.questions[base]) return base;
  let i = 2;
  while (bank.questions[`${base}_${i}`]) i++;
  return `${base}_${i}`;
}

export function orderedQuestions(bank: QuestionBank): Question[] {
  const order = (bank.order ?? []).filter((id) => bank.questions[id]);
  const rest = Object.keys(bank.questions).filter((id) => !order.includes(id)).sort();
  return [...order, ...rest].map((id) => bank.questions[id]);
}
