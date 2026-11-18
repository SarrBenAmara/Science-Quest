// DEMO ONLY: simulated students that join a room and answer questions, so the whole game
// can be previewed in one window. They submit through the normal security rules.
import { demoWriteAs } from '../backend/demoBackend';
import { correctDisplayIndex, nameKey } from '../lib/game';
import type { Answer, PreparedQuestion } from '../lib/types';
import type { HostRoom } from './host';

const NAMES = ['Youssef', 'Mariem', 'Khalil', 'Selim', 'Yasmeen', 'Malek', 'Zaineb', 'Mewen', 'Yazan', 'Mohamed Ali'];

export function addDemoStudents(code: string, room: HostRoom, count = 8): number {
  const taken = new Set(Object.values(room.players ?? {}).map((p) => p.nameKey));
  let added = 0;
  for (const name of NAMES) {
    if (added >= count) break;
    const key = nameKey(name);
    if (taken.has(key)) continue;
    const uid = `bot_${key.replace(/\W/g, '')}_${code}`;
    const ok = demoWriteAs(uid, `rooms/${code}`, {
      [`players/${uid}`]: { name, nameKey: key, joinedAt: { '.sv': 'timestamp' } },
      [`names/${key}`]: uid,
    }, true);
    if (ok) { demoWriteAs(uid, `rooms/${code}/presence/${uid}`, true); added++; }
  }
  return added;
}

/** Answer built from the answer key; `good` decides right or wrong. */
function botAnswer(pq: PreparedQuestion, good: boolean): Answer {
  const q = pq.q;
  switch (q.type) {
    case 'mcq': case 'truefalse': {
      const c = correctDisplayIndex(pq);
      const n = q.type === 'mcq' ? q.options.length : 2;
      return { kind: 'choice', value: good ? c : (c + 1 + Math.floor(Math.random() * (n - 1))) % n };
    }
    case 'fill': return { kind: 'texts', value: q.blanks.map((b) => (good ? b.accepted[0] : 'not sure')) };
    case 'numeric': return { kind: 'number', value: String(good ? q.answer : q.answer + 5) };
    case 'density': return { kind: 'number', value: String(good ? q.mass / (q.waterAfter - q.waterBefore) : 2) };
    case 'matching': {
      const ids = pq.matchingIds!;
      const map: Record<string, string> = {};
      ids.left.forEach((lid, i) => {
        const target = good ? i : (i + 1) % ids.left.length;
        map[lid] = ids.right[ids.rightOrder.indexOf(target)];
      });
      return { kind: 'pairs', value: map };
    }
    case 'dragdrop': {
      const items = pq.dragIds!.items;
      const map: Record<string, string> = {};
      q.zones.forEach((z, i) => {
        const want = good ? z.answer : q.zones[(i + 1) % q.zones.length].answer;
        map[z.id] = items.find((it) => it.text === want)!.id;
      });
      return { kind: 'pairs', value: map };
    }
    case 'atom': return { kind: 'shells', value: good ? q.shells : [2, Math.max(0, q.atomicNumber - 2)] };
  }
}

const scheduled = new Set<string>();

/** Called on every room update in the teacher's window: bots answer after a short random delay. */
export function runDemoStudents(code: string, room: HostRoom) {
  const s = room.state;
  if (s.phase !== 'QUESTION_OPEN') return;
  const pq = room.hostPrivate?.questions?.[s.qIndex];
  if (!pq) return;
  const subs = room.submissions?.[s.qKey] ?? {};
  for (const [uid, p] of Object.entries(room.players ?? {})) {
    if (!uid.startsWith('bot_') || p.removed || subs[uid]) continue;
    const key = `${code}:${s.qKey}:${uid}`;
    if (scheduled.has(key)) continue;
    scheduled.add(key);
    const skill = 0.55 + (uid.length % 5) * 0.08; // each bot has its own "ability"
    const delay = 1500 + Math.random() * Math.min(9000, pq.q.timeLimit * 250);
    setTimeout(() => {
      const ok = demoWriteAs(uid, `rooms/${code}/submissions/${s.qKey}/${uid}`, {
        a: JSON.stringify({ answer: botAnswer(pq, Math.random() < skill) }),
        at: { '.sv': 'timestamp' },
      });
      if (!ok) scheduled.delete(key); // e.g. game paused — try again on the next update
    }, delay);
  }
}
