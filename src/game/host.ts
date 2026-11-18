// The teacher's laptop is the game's referee: it holds the answer keys, grades
// submissions and publishes results. Firebase rules stop students from doing any of this.
import type { Backend } from '../backend';
import {
  assertTransition, assignTeams, buildReveal, isIndividual, makeTeams, nextStep, prepareGame, roomCode, smallestTeam,
  toPublicQuestion, totalsFromResults,
} from '../lib/game';
import { elapsedAt, grade } from '../lib/grading';
import type {
  Answer, GameSettings, GameState, GradeResult, Player, PreparedQuestion, PublicQuestion, PublicRound, Question, RevealPayload, RoundPlan, ScoreRecord, Submission, Team,
} from '../lib/types';

export const roomPath = (code: string) => `rooms/${code}`;

export interface HostRoom {
  meta: { hostUid: string; createdAt: number; bankId?: string; bankName?: string };
  settings: GameSettings;
  plan: { rounds: PublicRound[] };
  state: GameState;
  teams?: Record<string, Team>;
  players?: Record<string, Player>;
  presence?: Record<string, boolean>;
  scores?: Record<string, ScoreRecord>;
  reveal?: RevealPayload | null;
  question?: PublicQuestion | null;
  submissions?: Record<string, Record<string, Submission>>;
  results?: Record<string, Record<string, GradeResult>>;
  hostPrivate?: {
    questions?: PreparedQuestion[];
    selection?: RoundPlan[];
    segments?: Record<string, { s: number; e?: number | null }[]>;
    overrides?: Record<string, Record<string, Record<string, boolean>>>;
  };
}

export async function createRoom(db: Backend, hostUid: string, settings: GameSettings, selection: RoundPlan[], bank: { id: string; name: string; questions: Record<string, Question> }): Promise<string> {
  const { rounds } = prepareGame(selection, bank.questions, settings);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = roomCode();
    try {
      await db.set(roomPath(code), {
        meta: { hostUid, createdAt: db.TS, bankId: bank.id, bankName: bank.name },
        settings,
        plan: { rounds },
        state: { phase: 'LOBBY', qIndex: -1, qKey: 'none', roundIndex: 0, totalQuestions: rounds.reduce((s, r) => s + r.count, 0) },
        teams: makeTeams(settings),
        hostPrivate: { selection },
      });
      await db.set(`teachers/${hostUid}/activeRoom`, code);
      return code;
    } catch {
      // Code already taken (rules forbid overwriting another room) — try another.
    }
  }
  throw new Error('Could not create a room code. Check your connection and try again.');
}

/** While in the lobby the teacher can still change settings and the question selection. */
export async function updateLobbySetup(db: Backend, code: string, settings: GameSettings, selection: RoundPlan[], bank: { id: string; name: string; questions: Record<string, Question> }) {
  const { rounds } = prepareGame(selection, bank.questions, settings);
  await db.update(roomPath(code), {
    settings,
    plan: { rounds },
    'state/totalQuestions': rounds.reduce((s, r) => s + r.count, 0),
    teams: makeTeams(settings),
    'hostPrivate/selection': selection,
    'meta/bankId': bank.id,
    'meta/bankName': bank.name,
  });
}

function setState(room: HostRoom, patch: Partial<GameState>): Record<string, any> {
  if (patch.phase && patch.phase !== room.state.phase) assertTransition(room.state.phase, patch.phase);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) out[`state/${k}`] = v ?? null;
  return out;
}

/** Lock the lobby: prepare questions (answer keys stay in hostPrivate) and assign random balanced teams. */
export async function lockLobby(db: Backend, code: string, room: HostRoom, bankQuestions: Record<string, Question>) {
  const selection = room.hostPrivate?.selection ?? [];
  const { rounds, prepared } = prepareGame(selection, bankQuestions, room.settings);
  if (!prepared.length) throw new Error('Select at least one question before starting.');
  const active = Object.entries(room.players ?? {}).filter(([, p]) => !p.removed).map(([uid]) => uid);
  if (!active.length) throw new Error('No students have joined yet.');
  if (isIndividual(room.settings)) {
    // Individual mode: no teams — go straight to the first round.
    await db.update(roomPath(code), {
      ...setState(room, { phase: 'ROUND_INTRO', qIndex: -1, roundIndex: 0, totalQuestions: prepared.length }),
      'plan/rounds': rounds,
      teams: null,
      'hostPrivate/questions': prepared,
    });
    return;
  }
  const teams = makeTeams(room.settings);
  const assignment = assignTeams(active, Object.keys(teams));
  const upd: Record<string, any> = {
    ...setState(room, { phase: 'TEAM_ASSIGNMENT', totalQuestions: prepared.length }),
    'plan/rounds': rounds,
    teams,
    'hostPrivate/questions': prepared,
  };
  for (const [uid, t] of Object.entries(assignment)) upd[`players/${uid}/teamId`] = t;
  await db.update(roomPath(code), upd);
}

export async function reshuffleTeams(db: Backend, code: string, room: HostRoom) {
  if (room.state.phase !== 'TEAM_ASSIGNMENT') throw new Error('Teams can only be reshuffled before the game starts.');
  const teams = room.teams ?? makeTeams(room.settings);
  const active = Object.entries(room.players ?? {}).filter(([, p]) => !p.removed).map(([uid]) => uid);
  const assignment = assignTeams(active, Object.keys(teams));
  const upd: Record<string, any> = {};
  for (const [uid, t] of Object.entries(assignment)) upd[`players/${uid}/teamId`] = t;
  await db.update(roomPath(code), upd);
}

/** Late joiners (or anyone without a team after the lobby is locked) go to the smallest team. */
export async function placeUnassigned(db: Backend, code: string, room: HostRoom) {
  if (room.state.phase === 'LOBBY' || isIndividual(room.settings)) return;
  const players = { ...(room.players ?? {}) };
  const teamIds = Object.keys(room.teams ?? {});
  if (!teamIds.length) return;
  const upd: Record<string, any> = {};
  for (const [uid, p] of Object.entries(players)) {
    if (p.removed || p.teamId) continue;
    const t = smallestTeam(teamIds, players);
    players[uid] = { ...p, teamId: t };
    upd[`players/${uid}/teamId`] = t;
  }
  if (Object.keys(upd).length) await db.update(roomPath(code), upd);
}

function openQuestionUpdate(db: Backend, room: HostRoom, qIndex: number, roundIndex: number): Record<string, any> {
  const pq = room.hostPrivate!.questions![qIndex];
  const qKey = `q${qIndex}`;
  return {
    ...setState(room, { phase: 'QUESTION_OPEN', prevPhase: null, qIndex, qKey, roundIndex, startedAt: db.TS as any, accMs: 0, timeLimit: pq.q.timeLimit }),
    question: toPublicQuestion(pq),
    reveal: null,
    [`hostPrivate/segments/${qKey}`]: [{ s: db.TS }],
  };
}

export async function advance(db: Backend, code: string, room: HostRoom) {
  const step = nextStep(room.state.phase, { qIndex: room.state.qIndex, roundIndex: room.state.roundIndex, rounds: room.plan.rounds, settings: room.settings });
  if (step.phase === 'QUESTION_OPEN') return db.update(roomPath(code), openQuestionUpdate(db, room, step.qIndex, step.roundIndex));
  return db.update(roomPath(code), {
    ...setState(room, { phase: step.phase, qIndex: step.qIndex, roundIndex: step.roundIndex }),
    ...(step.phase === 'ROUND_INTRO' ? { question: null, reveal: null } : {}),
  });
}

export async function pause(db: Backend, code: string, room: HostRoom) {
  const s = room.state;
  if (s.phase === 'PAUSED' || s.phase === 'LOBBY' || s.phase === 'TEAM_ASSIGNMENT' || s.phase === 'GAME_COMPLETE') return;
  const upd: Record<string, any> = setState(room, { phase: 'PAUSED', prevPhase: s.phase });
  if (s.phase === 'QUESTION_OPEN') {
    upd['state/accMs'] = (s.accMs ?? 0) + Math.max(0, db.serverNow() - (s.startedAt ?? db.serverNow()));
    upd['state/startedAt'] = null;
    const segs = room.hostPrivate?.segments?.[s.qKey] ?? [];
    upd[`hostPrivate/segments/${s.qKey}/${Math.max(0, segs.length - 1)}/e`] = db.TS;
  }
  await db.update(roomPath(code), upd);
}

export async function resume(db: Backend, code: string, room: HostRoom) {
  const s = room.state;
  if (s.phase !== 'PAUSED' || !s.prevPhase) return;
  const upd: Record<string, any> = setState(room, { phase: s.prevPhase, prevPhase: null });
  if (s.prevPhase === 'QUESTION_OPEN') {
    upd['state/startedAt'] = db.TS;
    const segs = room.hostPrivate?.segments?.[s.qKey] ?? [];
    upd[`hostPrivate/segments/${s.qKey}/${segs.length}`] = { s: db.TS };
  }
  await db.update(roomPath(code), upd);
}

export async function closeSubmissions(db: Backend, code: string, room: HostRoom) {
  const s = room.state;
  if (s.phase !== 'QUESTION_OPEN') return;
  const segs = room.hostPrivate?.segments?.[s.qKey] ?? [];
  await db.update(roomPath(code), {
    ...setState(room, { phase: 'SUBMISSIONS_CLOSED' }),
    'state/accMs': (s.accMs ?? 0) + Math.max(0, db.serverNow() - (s.startedAt ?? db.serverNow())),
    'state/startedAt': null,
    [`hostPrivate/segments/${s.qKey}/${Math.max(0, segs.length - 1)}/e`]: db.TS,
  });
}

export function parseSubmission(sub: Submission | undefined): { answer: Answer; adapted: boolean } | null {
  if (!sub) return null;
  try {
    const p = JSON.parse(sub.a);
    return { answer: p.answer as Answer, adapted: !!p.adapted };
  } catch { return null; }
}

/** Grade every player for the current question. Pure — used for the teacher's review panel too. */
export function gradeAll(room: HostRoom, submissions: Record<string, Submission>, overrides: Record<string, Record<string, boolean>> = {}) {
  const s = room.state;
  const pq = room.hostPrivate!.questions![s.qIndex];
  const segments = room.hostPrivate?.segments?.[s.qKey] ?? [];
  const results: Record<string, GradeResult> = {};
  const counts = new Array(pq.q.type === 'mcq' ? pq.q.options.length : 2).fill(0);
  for (const [uid, p] of Object.entries(room.players ?? {})) {
    if (p.removed) continue;
    const sub = parseSubmission(submissions[uid]);
    const adapted = !!(sub?.adapted && p.adapted && pq.q.adapted);
    const elapsedMs = submissions[uid] ? elapsedAt(submissions[uid].at, segments as any) : undefined;
    const ov = overrides[uid] ? Object.fromEntries(Object.entries(overrides[uid]).map(([k, v]) => [Number(k), v])) : undefined;
    results[uid] = grade(pq, sub && (!sub.adapted || adapted) ? sub.answer : null, { elapsedMs, overrides: ov, adapted });
    if (sub && !adapted && sub.answer.kind === 'choice' && counts[sub.answer.value] !== undefined) counts[sub.answer.value]++;
  }
  return { pq, results, distribution: pq.q.type === 'mcq' || pq.q.type === 'truefalse' ? counts : undefined };
}

/**
 * Reveal: if submissions are still open they are closed FIRST (rules then reject any late
 * answer), then everything is graded and the correction + scores are published in ONE update.
 */
export async function reveal(db: Backend, code: string, room: HostRoom) {
  let s = room.state;
  if (s.phase !== 'QUESTION_OPEN' && s.phase !== 'SUBMISSIONS_CLOSED') return;
  if (s.phase === 'QUESTION_OPEN') {
    await closeSubmissions(db, code, room);
    s = { ...s, phase: 'SUBMISSIONS_CLOSED' };
  }
  const [subs, allResults, overrides, segs, players] = await Promise.all([
    db.get(`${roomPath(code)}/submissions/${s.qKey}`),
    db.get(`${roomPath(code)}/results`),
    db.get(`${roomPath(code)}/hostPrivate/overrides/${s.qKey}`),
    db.get(`${roomPath(code)}/hostPrivate/segments/${s.qKey}`),
    db.get(`${roomPath(code)}/players`),
  ]);
  const closed: HostRoom = {
    ...room,
    players: players ?? room.players,
    state: s,
    hostPrivate: { ...room.hostPrivate, segments: { ...(room.hostPrivate?.segments ?? {}), [s.qKey]: Object.values(segs ?? {}) as any } },
  };
  const { pq, results, distribution } = gradeAll(closed, subs ?? {}, overrides ?? {});
  const scores = totalsFromResults({ ...(allResults ?? {}), [s.qKey]: results });
  await db.update(roomPath(code), {
    ...setState(closed, { phase: 'CORRECTION_REVEALED' }),
    reveal: buildReveal(pq, s.qKey, distribution),
    [`results/${s.qKey}`]: results,
    scores,
  });
}

export async function setOverride(db: Backend, code: string, qKey: string, uid: string, blank: number, accept: boolean | null) {
  await db.set(`${roomPath(code)}/hostPrivate/overrides/${qKey}/${uid}/${blank}`, accept);
}

export async function endGame(db: Backend, code: string, room: HostRoom) {
  if (room.state.phase === 'GAME_COMPLETE') return;
  await db.update(roomPath(code), { ...setState(room, { phase: 'GAME_COMPLETE', prevPhase: null }), 'state/startedAt': null });
}

export async function removePlayer(db: Backend, code: string, uid: string) {
  await db.update(roomPath(code), { [`players/${uid}/removed`]: true, [`presence/${uid}`]: null });
}

export async function restorePlayer(db: Backend, code: string, uid: string) {
  await db.set(`${roomPath(code)}/players/${uid}/removed`, null);
}

export async function setAdapted(db: Backend, code: string, uid: string, adapted: boolean) {
  await db.set(`${roomPath(code)}/players/${uid}/adapted`, adapted || null);
}

export async function renameTeam(db: Backend, code: string, teamId: string, name: string) {
  await db.set(`${roomPath(code)}/teams/${teamId}/name`, name.slice(0, 24));
}

/** Players who count for "everyone has answered": in the room, not removed, currently connected. */
export function activePlayers(room: HostRoom): string[] {
  return Object.entries(room.players ?? {}).filter(([uid, p]) => !p.removed && room.presence?.[uid]).map(([uid]) => uid);
}
