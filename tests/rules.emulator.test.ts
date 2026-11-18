// Runs database.rules.json on the OFFICIAL Firebase emulator (npm run test:rules; also run in GitHub Actions).
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, serverTimestamp, set, update } from 'firebase/database';

let env: RulesTestEnvironment;
const ROOM = 'rooms/123456';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-science-quest',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
afterAll(async () => env?.cleanup());

const teacher = () => env.authenticatedContext('teacher1', { firebase: { sign_in_provider: 'password' } }).database();
const other = () => env.authenticatedContext('teacher2', { firebase: { sign_in_provider: 'password' } }).database();
const stu = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).database();
const join = (uid: string, name: string) =>
  update(ref(stu(uid), ROOM), { [`players/${uid}`]: { name, nameKey: name.toLowerCase(), joinedAt: serverTimestamp() }, [`names/${name.toLowerCase()}`]: uid });

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'teacherAllowlist'), { teacher1: true, teacher2: true }));
  await assertSucceeds(set(ref(teacher(), ROOM), {
    meta: { hostUid: 'teacher1', createdAt: serverTimestamp() },
    settings: { maxPlayers: 3, allowLateJoin: false },
    state: { phase: 'LOBBY', qIndex: -1, qKey: 'none', roundIndex: 0, totalQuestions: 24 },
    hostPrivate: { questions: [{ q: { answer: 2 } }] },
  }));
});

describe('emulator: rooms and secrecy', () => {
  it('students cannot read answer keys; other teachers cannot take over', async () => {
    await assertSucceeds(get(ref(stu('s1'), `${ROOM}/state`)));
    await assertFails(get(ref(stu('s1'), `${ROOM}/hostPrivate`)));
    await assertFails(get(ref(other(), `${ROOM}/hostPrivate`)));
    await assertFails(set(ref(other(), `${ROOM}/state/phase`), 'GAME_COMPLETE'));
    await assertFails(set(ref(stu('s1'), `${ROOM}/state/phase`), 'GAME_COMPLETE'));
  });
});

describe('emulator: teacher allow-list', () => {
  it('a self-made account cannot act as a teacher', async () => {
    const stranger = env.authenticatedContext('signup1', { firebase: { sign_in_provider: 'password' } }).database();
    await assertFails(set(ref(stranger, 'rooms/333333'), { meta: { hostUid: 'signup1', createdAt: serverTimestamp() } }));
    await assertFails(set(ref(stranger, 'teacherAllowlist/signup1'), true));
    await assertFails(set(ref(stranger, 'teachers/signup1/banks/b1'), { name: 'x' }));
  });
});

describe('emulator: joining', () => {
  it('unique names, no self-assigned teams', async () => {
    await assertSucceeds(join('s1', 'Youssef'));
    await assertFails(join('s2', 'Youssef'));
    await assertFails(set(ref(stu('s1'), `${ROOM}/players/s1/teamId`), 't0'));
    await assertSucceeds(join('s2', 'Mariem'));
    await assertSucceeds(join('s3', 'Khalil'));
  });
});

describe('emulator: submissions', () => {
  beforeEach(async () => {
    await join('s1', 'Youssef');
    await join('s2', 'Mariem');
    await set(ref(teacher(), `${ROOM}/state`), { phase: 'QUESTION_OPEN', qIndex: 0, qKey: 'q0', roundIndex: 0, totalQuestions: 24 });
  });
  const sub = (uid: string, q = 'q0') => set(ref(stu(uid), `${ROOM}/submissions/${q}/${uid}`), { a: '{}', at: serverTimestamp() });

  it('one locked answer per student, only while open', async () => {
    await assertSucceeds(sub('s1'));
    await assertFails(sub('s1'));
    await assertFails(sub('s1', 'q1'));
    await assertFails(set(ref(stu('s1'), `${ROOM}/submissions/q0/s1`), null));
    await assertFails(set(ref(stu('s2'), `${ROOM}/submissions/q0/s2`), { a: '{}', at: 1 }));
    await set(ref(teacher(), `${ROOM}/state/phase`), 'SUBMISSIONS_CLOSED');
    await assertFails(sub('s2'));
  });
  it('privacy of answers and results', async () => {
    await sub('s1');
    await assertFails(get(ref(stu('s2'), `${ROOM}/submissions/q0/s1`)));
    await assertSucceeds(get(ref(stu('s1'), `${ROOM}/submissions/q0/s1`)));
    await assertFails(get(ref(stu('s2'), `${ROOM}/results/q0/s1`)));
    await assertFails(set(ref(stu('s1'), `${ROOM}/scores/s1/total`), 9999));
  });
});
