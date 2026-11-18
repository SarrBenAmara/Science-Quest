import type {
  GameSettings, Phase, Player, PreparedQuestion, PublicQuestion, PublicRound, Question, RevealPayload,
  RoundPlan, ScoreRecord, GradeResult, Team,
} from './types';
import { densityAnswer } from './grading';

// ───────────────────────── Random helpers ─────────────────────────

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so tests are reproducible. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const cryptoRng: Rng = () => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 4294967296;
};

export function shuffle<T>(arr: T[], rng: Rng = cryptoRng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function opaqueId(rng: Rng = cryptoRng): string {
  return Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0');
}

export function roomCode(rng: Rng = cryptoRng): string {
  return String(100000 + Math.floor(rng() * 900000));
}

/** Firebase key for a display name: lower-case, no forbidden characters. */
export function nameKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.#$\[\]\/]/g, '_');
}

export function cleanName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 20);
}

// ───────────────────────── State machine ─────────────────────────

export const TRANSITIONS: Record<Phase, Phase[]> = {
  LOBBY: ['TEAM_ASSIGNMENT', 'ROUND_INTRO', 'GAME_COMPLETE'], // ROUND_INTRO directly = individual mode
  TEAM_ASSIGNMENT: ['ROUND_INTRO', 'LOBBY', 'GAME_COMPLETE'],
  ROUND_INTRO: ['QUESTION_OPEN', 'PAUSED', 'GAME_COMPLETE'],
  QUESTION_OPEN: ['SUBMISSIONS_CLOSED', 'CORRECTION_REVEALED', 'PAUSED', 'GAME_COMPLETE'],
  SUBMISSIONS_CLOSED: ['CORRECTION_REVEALED', 'PAUSED', 'GAME_COMPLETE'],
  CORRECTION_REVEALED: ['LEADERBOARD', 'QUESTION_OPEN', 'ROUND_COMPLETE', 'PAUSED', 'GAME_COMPLETE'],
  LEADERBOARD: ['QUESTION_OPEN', 'ROUND_COMPLETE', 'PAUSED', 'GAME_COMPLETE'],
  ROUND_COMPLETE: ['ROUND_INTRO', 'PAUSED', 'GAME_COMPLETE'],
  PAUSED: ['ROUND_INTRO', 'QUESTION_OPEN', 'SUBMISSIONS_CLOSED', 'CORRECTION_REVEALED', 'LEADERBOARD', 'ROUND_COMPLETE', 'GAME_COMPLETE'],
  GAME_COMPLETE: [],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: Phase, to: Phase): void {
  if (!canTransition(from, to)) throw new Error(`Illegal game transition ${from} → ${to}`);
}

export interface Position { qIndex: number; roundIndex: number; rounds: PublicRound[]; settings: Pick<GameSettings, 'leaderboardFrequency'> }

/** What the teacher's "Next" button does from the current phase. */
export function nextStep(phase: Phase, pos: Position): { phase: Phase; qIndex: number; roundIndex: number } {
  const { qIndex, roundIndex, rounds, settings } = pos;
  const round = rounds[roundIndex];
  const lastInRound = round ? qIndex >= round.start + round.count - 1 : true;
  const lastRound = roundIndex >= rounds.length - 1;
  switch (phase) {
    case 'TEAM_ASSIGNMENT':
      return { phase: 'ROUND_INTRO', qIndex: -1, roundIndex: 0 };
    case 'ROUND_INTRO':
      return { phase: 'QUESTION_OPEN', qIndex: round.start, roundIndex };
    case 'CORRECTION_REVEALED':
      if (settings.leaderboardFrequency === 'question') return { phase: 'LEADERBOARD', qIndex, roundIndex };
      if (lastInRound) return { phase: lastRound ? 'GAME_COMPLETE' : 'ROUND_COMPLETE', qIndex, roundIndex };
      return { phase: 'QUESTION_OPEN', qIndex: qIndex + 1, roundIndex };
    case 'LEADERBOARD':
      if (lastInRound) return { phase: lastRound ? 'GAME_COMPLETE' : 'ROUND_COMPLETE', qIndex, roundIndex };
      return { phase: 'QUESTION_OPEN', qIndex: qIndex + 1, roundIndex };
    case 'ROUND_COMPLETE':
      return { phase: 'ROUND_INTRO', qIndex, roundIndex: roundIndex + 1 };
    default:
      throw new Error(`"Next" is not available during ${phase}`);
  }
}

// ───────────────────────── Teams ─────────────────────────

export const TEAM_COLORS = ['#2f9bff', '#35d64a', '#a64dff', '#ff7a1f', '#ff3d8b'];
export const TEAM_SYMBOLS = ['α', 'β', 'γ', 'δ', 'ε'];

/** Individual mode: no teams at all. Older rooms without the setting play in teams. */
export function isIndividual(settings?: Partial<GameSettings> | null): boolean {
  return settings?.playMode === 'individual';
}

export function makeTeams(settings: GameSettings): Record<string, Team> {
  const out: Record<string, Team> = {};
  if (isIndividual(settings)) return out;
  for (let i = 0; i < settings.teamCount; i++) {
    out[`t${i}`] = { name: settings.teamNames[i] || `Team ${i + 1}`, color: TEAM_COLORS[i % TEAM_COLORS.length], order: i };
  }
  return out;
}

/** Random, balanced assignment: team sizes never differ by more than one. */
export function assignTeams(uids: string[], teamIds: string[], rng: Rng = cryptoRng): Record<string, string> {
  const order = shuffle(uids, rng);
  const startOffset = Math.floor(rng() * teamIds.length);
  const out: Record<string, string> = {};
  order.forEach((uid, i) => { out[uid] = teamIds[(i + startOffset) % teamIds.length]; });
  return out;
}

/** Late joiner: smallest team (ties → lowest team order). */
export function smallestTeam(teamIds: string[], players: Record<string, Player>): string {
  const counts = new Map(teamIds.map((t) => [t, 0]));
  Object.values(players).forEach((p) => { if (!p.removed && p.teamId && counts.has(p.teamId)) counts.set(p.teamId, counts.get(p.teamId)! + 1); });
  return teamIds.slice().sort((a, b) => counts.get(a)! - counts.get(b)! || teamIds.indexOf(a) - teamIds.indexOf(b))[0];
}

// ───────────────────────── Leaderboards ─────────────────────────

export interface RankedPlayer { uid: string; name: string; teamId?: string; total: number; correct: number; rank: number }
export interface RankedTeam { teamId: string; name: string; color: string; total: number; members: string[]; rank: number }

const EMPTY: ScoreRecord = { total: 0, correct: 0, incorrect: 0, answered: 0, timeMs: 0 };

/** Deterministic ranking: points ↓, correct answers ↓, total response time ↑, join time ↑, id. */
export function rankPlayers(players: Record<string, Player>, scores: Record<string, ScoreRecord> = {}): RankedPlayer[] {
  return Object.entries(players)
    .filter(([, p]) => !p.removed)
    .map(([uid, p]) => ({ uid, p, s: scores[uid] ?? EMPTY }))
    .sort((a, b) =>
      b.s.total - a.s.total || b.s.correct - a.s.correct || a.s.timeMs - b.s.timeMs ||
      a.p.joinedAt - b.p.joinedAt || (a.uid < b.uid ? -1 : 1))
    .map(({ uid, p, s }, i) => ({ uid, name: p.name, teamId: p.teamId, total: s.total, correct: s.correct, rank: i + 1 }));
}

/** Team score = sum of its (non-removed) members' individual scores. */
export function rankTeams(teams: Record<string, Team>, players: Record<string, Player>, scores: Record<string, ScoreRecord> = {}): RankedTeam[] {
  return Object.entries(teams)
    .map(([teamId, t]) => {
      const members = Object.entries(players).filter(([, p]) => !p.removed && p.teamId === teamId);
      const total = members.reduce((s, [uid]) => s + (scores[uid]?.total ?? 0), 0);
      const avg = members.length ? total / members.length : 0;
      return { teamId, name: t.name, color: t.color, order: t.order, total, avg, members: members.map(([, p]) => p.name) };
    })
    .sort((a, b) => b.total - a.total || b.avg - a.avg || a.order - b.order)
    .map(({ teamId, name, color, total, members }, i) => ({ teamId, name, color, total, members, rank: i + 1 }));
}

/** Recompute every player's totals from all graded results — idempotent (safe if reveal runs twice). */
export function totalsFromResults(results: Record<string, Record<string, GradeResult>>): Record<string, ScoreRecord> {
  const out: Record<string, ScoreRecord> = {};
  for (const perPlayer of Object.values(results ?? {})) {
    for (const [uid, r] of Object.entries(perPlayer ?? {})) {
      const s = (out[uid] ??= { total: 0, correct: 0, incorrect: 0, answered: 0, timeMs: 0 });
      s.total += r.points;
      if (r.answered) {
        s.answered++;
        s.timeMs += r.elapsedMs ?? 0;
        if (r.correct) s.correct++; else s.incorrect++;
      } else s.incorrect++;
    }
  }
  return out;
}

// ───────────────────────── Preparing a game ─────────────────────────

export function buildRounds(plan: RoundPlan[]): PublicRound[] {
  let start = 0;
  return plan.filter((r) => r.questionIds.length).map((r) => {
    const out: PublicRound = { title: r.title, lab: r.lab, subtitle: r.subtitle ?? '', start, count: r.questionIds.length };
    start += r.questionIds.length;
    return out;
  });
}

/** Turn the teacher's selection into prepared questions (answer keys, host-only) with shuffles applied. */
export function prepareGame(
  plan: RoundPlan[], bank: Record<string, Question>, settings: GameSettings, rng: Rng = cryptoRng,
): { rounds: PublicRound[]; prepared: PreparedQuestion[] } {
  const effectivePlan = plan
    .map((r) => ({ ...r, questionIds: r.questionIds.filter((id) => bank[id]) }))
    .filter((r) => r.questionIds.length)
    .map((r) => ({ ...r, questionIds: settings.questionOrder === 'shuffle-within-rounds' ? shuffle(r.questionIds, rng) : r.questionIds }));
  const rounds = buildRounds(effectivePlan);
  const prepared: PreparedQuestion[] = [];
  effectivePlan.forEach((r, ri) => r.questionIds.forEach((id, n) => {
    const q = structuredClone(bank[id]);
    q.timeLimit = Math.max(5, Math.round(q.timeLimit * (settings.timeMultiplier || 1)));
    prepared.push(prepareQuestion(q, prepared.length, ri, n + 1, settings.shuffleOptions, rng));
  }));
  return { rounds, prepared };
}

export function prepareQuestion(q: Question, index: number, roundIndex: number, numberInRound: number, shuffleOptions: boolean, rng: Rng = cryptoRng): PreparedQuestion {
  const pq: PreparedQuestion = { index, roundIndex, numberInRound, q };
  if (q.type === 'mcq' && shuffleOptions) pq.optionOrder = shuffle(q.options.map((_, i) => i), rng);
  if (q.type === 'matching') {
    const left = q.pairs.map(() => opaqueId(rng));
    const rightOrder = shuffle(q.pairs.map((_, i) => i), rng);
    const right = rightOrder.map(() => opaqueId(rng));
    pq.matchingIds = { left, right, rightOrder };
  }
  if (q.type === 'dragdrop') {
    const texts = [...q.zones.map((z) => z.answer), ...(q.distractors ?? [])];
    pq.dragIds = { items: shuffle(texts, rng).map((text) => ({ id: opaqueId(rng), text })) };
  }
  return pq;
}

/** MCQ options in the order they are displayed (after optional shuffle). */
export function displayedOptions(pq: PreparedQuestion): string[] {
  if (pq.q.type !== 'mcq') return pq.q.type === 'truefalse' ? ['True', 'False'] : [];
  const opts = pq.q.options;
  return pq.optionOrder ? pq.optionOrder.map((i) => opts[i]) : opts.slice();
}

export function correctDisplayIndex(pq: PreparedQuestion): number {
  if (pq.q.type === 'truefalse') return pq.q.answer ? 0 : 1;
  if (pq.q.type !== 'mcq') return -1;
  return pq.optionOrder ? pq.optionOrder.indexOf(pq.q.answer) : pq.q.answer;
}

/** The ONLY function that produces student-readable question data. It never copies answer keys. */
export function toPublicQuestion(pq: PreparedQuestion): PublicQuestion {
  const q = pq.q;
  const base: PublicQuestion = {
    index: pq.index, numberInRound: pq.numberInRound, roundIndex: pq.roundIndex,
    type: q.type, lab: q.lab, topic: q.topic, timeLimit: q.timeLimit,
  };
  switch (q.type) {
    case 'mcq': base.optionCount = q.options.length; break;
    case 'truefalse': base.optionCount = 2; break;
    case 'fill': base.blankCount = q.blanks.length; break;
    case 'numeric': base.unit = q.unit; break;
    case 'matching': {
      const ids = pq.matchingIds!;
      base.matching = {
        left: q.pairs.map((p, i) => ({ id: ids.left[i], text: p.left })),
        right: ids.rightOrder.map((orig, pos) => ({ id: ids.right[pos], text: q.pairs[orig].right })),
      };
      break;
    }
    case 'dragdrop':
      base.dragdrop = {
        diagram: q.diagram,
        zones: q.zones.map(({ id, x, y, w, h, label }) => ({ id, x, y, w, h, ...(label ? { label } : {}) })),
        items: pq.dragIds!.items.map((i) => ({ ...i })),
      };
      break;
    case 'atom':
      base.atom = { element: q.element, symbol: q.symbol, atomicNumber: q.atomicNumber, maxShells: q.maxShells ?? 4 };
      break;
    case 'density':
      base.density = { object: q.object, mass: q.mass, waterBefore: q.waterBefore, waterAfter: q.waterAfter };
      base.unit = 'g/cm³';
      break;
  }
  if (q.adapted) {
    base.adapted = { type: q.adapted.type, prompt: q.adapted.prompt, ...(q.adapted.type === 'mcq' ? { options: q.adapted.options ?? [] } : {}) };
  }
  return base;
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

/** Correction data published at reveal time. */
export function buildReveal(pq: PreparedQuestion, qKey: string, distribution?: number[]): RevealPayload {
  const q = pq.q;
  const r: RevealPayload = { qKey, type: q.type, correctText: '', explanation: q.explanation };
  switch (q.type) {
    case 'mcq': case 'truefalse': {
      const i = correctDisplayIndex(pq);
      r.correctLetter = LETTERS[i];
      r.correctText = displayedOptions(pq)[i];
      if (distribution) r.distribution = distribution;
      break;
    }
    case 'fill': r.parts = q.blanks.map((b) => b.accepted[0] ?? ''); r.correctText = r.parts.join(' · '); break;
    case 'numeric': r.correctText = `${fmt(q.answer)}${q.unit ? ' ' + q.unit : ''}`; break;
    case 'density': r.correctText = `${fmt(densityAnswer(q))} g/cm³`; break;
    case 'matching': r.parts = q.pairs.map((p) => `${p.left} → ${p.right}`); r.correctText = r.parts.join(' · '); break;
    case 'dragdrop': r.parts = q.zones.map((z) => z.answer); r.correctText = r.parts.join(' · '); break;
    case 'atom': r.parts = q.shells.map(String); r.correctText = `${q.element}: ${q.shells.join(', ')}`; break;
  }
  if (q.adapted) {
    const opts = q.adapted.type === 'truefalse' ? ['True', 'False'] : q.adapted.options ?? [];
    r.adapted = { correctLetter: LETTERS[q.adapted.answer], correctText: opts[q.adapted.answer] ?? '' };
  }
  return r;
}
