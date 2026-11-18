// Permission tests for database.rules.json using the local rules evaluator.
// The same scenarios run against the official Firebase emulator in tests/rules.emulator.test.ts (CI).
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — plain JS module
import { RulesEngine, resolveServerValues, writesFor } from '../devserver/rules.mjs';

const rules = new RulesEngine(JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8')));
const teacher = { uid: 'teacher1', provider: 'password' };
const teacher2 = { uid: 'teacher2', provider: 'password' };
const s1 = { uid: 'stu1', provider: 'anonymous' };
const s2 = { uid: 'stu2', provider: 'anonymous' };
const TS = { '.sv': 'timestamp' };

let tree: any;
function write(auth: any, path: string, val: any, update = false) {
  const now = Date.now();
  const res = rules.tryWrite(tree, writesFor(path, resolveServerValues(val, now), update), auth, now);
  if (res.ok) tree = res.newTree;
  return res.ok as boolean;
}
const read = (auth: any, path: string) => rules.canRead(tree, path, auth) as boolean;
const join = (who: any, name: string) =>
  write(who, 'rooms/123456', { [`players/${who.uid}`]: { name, nameKey: name.toLowerCase(), joinedAt: TS }, [`names/${name.toLowerCase()}`]: who.uid }, true);

beforeEach(() => {
  tree = { teacherAllowlist: { teacher1: true, teacher2: true } };
  expect(write(teacher, 'rooms/123456', {
    meta: { hostUid: 'teacher1', createdAt: TS },
    settings: { maxPlayers: 3, allowLateJoin: false },
    state: { phase: 'LOBBY', qIndex: -1, qKey: 'none', roundIndex: 0, totalQuestions: 24 },
    hostPrivate: { questions: [{ q: { answer: 2 } }] },
  })).toBe(true);
});

describe('rooms', () => {
  it('only signed-in teachers create rooms, with valid 6-digit codes', () => {
    expect(write(s1, 'rooms/222222', { meta: { hostUid: 'stu1', createdAt: TS } })).toBe(false);
    expect(write(teacher2, 'rooms/123456/state/phase', 'GAME_COMPLETE')).toBe(false); // someone else's room
    expect(write(teacher2, 'rooms/123456', { meta: { hostUid: 'teacher2', createdAt: TS } })).toBe(false); // can't take over
    expect(write(teacher2, 'rooms/abc', { meta: { hostUid: 'teacher2', createdAt: TS } })).toBe(false);
    expect(write(teacher2, 'rooms/654321', { meta: { hostUid: 'teacher2', createdAt: TS } })).toBe(true);
  });
  it('students can read public data but never answer keys', () => {
    expect(read(s1, 'rooms/123456/state')).toBe(true);
    expect(read(s1, 'rooms/123456/question')).toBe(true);
    expect(read(s1, 'rooms/123456/hostPrivate')).toBe(false);
    expect(read(s1, 'rooms/123456')).toBe(false);
    expect(read(null, 'rooms/123456/state')).toBe(false);
    expect(read(teacher, 'rooms/123456/hostPrivate')).toBe(true);
    expect(read(teacher2, 'rooms/123456/hostPrivate')).toBe(false);
  });
  it('students cannot change game state, scores, reveal or teams', () => {
    join(s1, 'Youssef');
    for (const p of ['state/phase', 'scores/stu1/total', 'reveal/correctText', 'teams/t0/name', 'question/type', 'results/q0/stu1/points'])
      expect(write(s1, `rooms/123456/${p}`, 'x')).toBe(false);
  });
});

describe('joining', () => {
  it('a student joins once with a unique name', () => {
    expect(join(s1, 'Youssef')).toBe(true);
    expect(join(s2, 'Youssef')).toBe(false); // duplicate name
    expect(join(s2, 'Mariem')).toBe(true);
    expect(join(s1, 'Other')).toBe(false); // cannot join twice / rename
  });
  it('a student cannot assign their own team', () => {
    expect(write(s1, 'rooms/123456', { 'players/stu1': { name: 'Y', nameKey: 'y', joinedAt: TS, teamId: 't0' }, 'names/y': 'stu1' }, true)).toBe(false);
    join(s1, 'A'); join(s2, 'B'); join({ uid: 's3', provider: 'anonymous' }, 'C');
    expect(write(s1, 'rooms/123456/players/stu1/teamId', 't1')).toBe(false);
    expect(write(teacher, 'rooms/123456/players/stu1/teamId', 't1')).toBe(true);
  });
  it('late joining follows the setting', () => {
    write(teacher, 'rooms/123456/state/phase', 'QUESTION_OPEN');
    expect(join(s1, 'Late')).toBe(false);
    write(teacher, 'rooms/123456/settings/allowLateJoin', true);
    expect(join(s1, 'Late')).toBe(true);
  });
});

describe('submissions', () => {
  beforeEach(() => {
    join(s1, 'Youssef');
    join(s2, 'Mariem');
    write(teacher, 'rooms/123456/state', { phase: 'QUESTION_OPEN', qIndex: 0, qKey: 'q0', roundIndex: 0, totalQuestions: 24 });
  });
  const sub = (who: any, q = 'q0', at: any = TS) => write(who, `rooms/123456/submissions/${q}/${who.uid}`, { a: '{"answer":{"kind":"choice","value":2}}', at });

  it('accepts exactly one answer per student per question', () => {
    expect(sub(s1)).toBe(true);
    expect(sub(s1)).toBe(false); // no change after submitting
    expect(write(s1, 'rooms/123456/submissions/q0/stu1', null)).toBe(false); // cannot delete either
  });
  it('rejects answers for another student, another question or with a fake timestamp', () => {
    expect(write(s1, 'rooms/123456/submissions/q0/stu2', { a: 'x', at: TS })).toBe(false);
    expect(sub(s1, 'q1')).toBe(false);
    expect(sub(s1, 'q0', 1)).toBe(false);
  });
  it('rejects late answers once submissions are closed or paused', () => {
    write(teacher, 'rooms/123456/state/phase', 'SUBMISSIONS_CLOSED');
    expect(sub(s1)).toBe(false);
    write(teacher, 'rooms/123456/state/phase', 'PAUSED');
    expect(sub(s1)).toBe(false);
  });
  it('removed students cannot answer', () => {
    write(teacher, 'rooms/123456/players/stu2/removed', true);
    expect(sub(s2)).toBe(false);
  });
  it('students cannot read each other\'s answers or results', () => {
    sub(s1);
    expect(read(s2, 'rooms/123456/submissions/q0/stu1')).toBe(false);
    expect(read(s2, 'rooms/123456/submissions/q0')).toBe(false);
    expect(read(s1, 'rooms/123456/submissions/q0/stu1')).toBe(true);
    expect(read(s2, 'rooms/123456/results/q0/stu1')).toBe(false);
    expect(read(s1, 'rooms/123456/results/q0/stu1')).toBe(true);
    expect(read(teacher, 'rooms/123456/submissions/q0')).toBe(true);
  });
});

describe('presence and question banks', () => {
  it('students only set their own presence', () => {
    join(s1, 'Youssef');
    expect(write(s1, 'rooms/123456/presence/stu1', true)).toBe(true);
    expect(write(s1, 'rooms/123456/presence/stu2', true)).toBe(false);
    expect(write(s2, 'rooms/123456/presence/stu2', true)).toBe(false); // not a player
  });
  it('only allow-listed teachers can create rooms or banks', () => {
    const stranger = { uid: 'signup1', provider: 'password' }; // someone who created their own email account
    expect(write(stranger, 'rooms/333333', { meta: { hostUid: 'signup1', createdAt: TS } })).toBe(false);
    expect(write(stranger, 'teachers/signup1/banks/b1', { name: 'x' })).toBe(false);
    expect(write(stranger, 'teacherAllowlist/signup1', true)).toBe(false); // cannot add themselves
    expect(read(stranger, 'teacherAllowlist/signup1')).toBe(true); // can check their own status
    expect(read(stranger, 'teacherAllowlist/teacher1')).toBe(false);
  });
  it('question banks are private to their teacher', () => {
    expect(write(teacher, 'teachers/teacher1/banks/b1', { name: 'Bank', questions: { a: { answer: 1 } } })).toBe(true);
    expect(read(teacher, 'teachers/teacher1/banks/b1')).toBe(true);
    expect(read(teacher2, 'teachers/teacher1/banks/b1')).toBe(false);
    expect(read(s1, 'teachers/teacher1')).toBe(false);
    expect(write(s1, 'teachers/stu1/banks/b1', { name: 'x' })).toBe(false); // anonymous users are not teachers
  });
});
