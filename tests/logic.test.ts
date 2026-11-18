import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { grade, judgeBlank, normalizeText, parseNumber, speedBonus, elapsedAt, electronConfiguration } from '../src/lib/grading';
import {
  assignTeams, buildReveal, canTransition, nextStep, prepareGame, prepareQuestion, rankPlayers, rankTeams, seededRng,
  smallestTeam, toPublicQuestion, totalsFromResults, makeTeams, nameKey,
} from '../src/lib/game';
import { parseCsvBank, parseJsonBank, exportBankCsv, exportBankJson } from '../src/lib/importSchema';
import { buildReport, reportCsv } from '../src/lib/report';
import { DEFAULT_SETTINGS, type Player, type Question, type QuestionBank } from '../src/lib/types';

// The question banks hold answer keys, so they are kept out of the public repository.
// Tests that need them run on the teacher's computer and are skipped on GitHub.
const BANK_URL = new URL('../question-banks/science-quest-50.json', import.meta.url);
const EXTRAS_URL = new URL('../question-banks/science-quest-extras.json', import.meta.url);
const HAS_BANKS = existsSync(BANK_URL) && existsSync(EXTRAS_URL);
const imported = HAS_BANKS ? parseJsonBank(readFileSync(BANK_URL, 'utf8')) : { bank: { name: '', questions: {} as Record<string, Question>, presets: {} as any }, errors: [], warnings: [] };
const bank = imported.bank.questions;
const rng = seededRng(42);
const prep = (id: string, shuffle = false) => prepareQuestion(bank[id], 0, 0, 1, shuffle, seededRng(7));

describe.skipIf(!HAS_BANKS)('starter bank', () => {
  it('imports all 50 questions without errors', () => {
    expect(imported.errors).toEqual([]);
    expect(Object.keys(bank)).toHaveLength(50);
    const byLab = Object.values(bank).reduce<Record<string, number>>((a, q) => ((a[q.lab] = (a[q.lab] ?? 0) + 1), a), {});
    expect(byLab).toEqual({ biology: 18, physics: 16, chemistry: 16 });
  });
  it('default preset has 4 rounds of 6', () => {
    const p = imported.bank.presets!.default24;
    expect(p.rounds.map((r) => r.questionIds.length)).toEqual([6, 6, 6, 6]);
  });
  it('density example is C = 3.0 g/cm³', () => {
    const extras = parseJsonBank(readFileSync(EXTRAS_URL, 'utf8'));
    expect(extras.errors).toEqual([]);
    const pq = prepareQuestion(extras.bank.questions.X02, 0, 0, 1, false);
    expect(buildReveal(pq, 'q0').correctLetter).toBe('C');
    expect(buildReveal(pq, 'q0').correctText).toBe('3.0 g/cm³');
    expect(grade(pq, { kind: 'choice', value: 3 }).points).toBe(0); // D is wrong
  });
});

describe.skipIf(!HAS_BANKS)('scoring', () => {
  it('MCQ: 100 + speed bonus up to 30, wrong = 0', () => {
    const pq = prep('B01');
    expect(grade(pq, { kind: 'choice', value: 2 }, { elapsedMs: 0 }).points).toBe(130);
    expect(grade(pq, { kind: 'choice', value: 2 }, { elapsedMs: 15000 }).points).toBe(115);
    expect(grade(pq, { kind: 'choice', value: 2 }, { elapsedMs: 60000 }).points).toBe(100);
    expect(grade(pq, { kind: 'choice', value: 0 }, { elapsedMs: 0 }).points).toBe(0);
    expect(grade(pq, undefined).answered).toBe(false);
  });
  it('MCQ option shuffle keeps the correct mapping', () => {
    for (let s = 1; s < 30; s++) {
      const pq = prepareQuestion(bank.B01, 0, 0, 1, true, seededRng(s));
      const shownCorrect = pq.optionOrder!.indexOf(2);
      expect(grade(pq, { kind: 'choice', value: shownCorrect }).correct).toBe(true);
      expect(buildReveal(pq, 'q0').correctText).toBe('Carbon dioxide');
    }
  });
  it('True/False: A = True, B = False', () => {
    expect(grade(prep('B02'), { kind: 'choice', value: 0 }).correct).toBe(true);
    expect(grade(prep('B05'), { kind: 'choice', value: 1 }).correct).toBe(true);
    expect(grade(prep('B05'), { kind: 'choice', value: 0 }).correct).toBe(false);
  });
  it('fill blanks: case/space insensitive, alternatives, no near-miss auto-accept', () => {
    expect(judgeBlank('  Carbon ', ['carbon'])).toBe('correct');
    expect(judgeBlank('DECOMPOSERS', ['decomposers'])).toBe('correct');
    expect(judgeBlank('decomposors', ['decomposers'])).toBe('uncertain');
    expect(judgeBlank('photosynthesis', ['respiration'])).toBe('wrong');
    expect(judgeBlank('kg/m³', ['kg/m3'])).toBe('correct');
    expect(judgeBlank('g/cm3', ['kg/m3'], ['g/cm3'])).toBe('wrong');
    expect(normalizeText('O₂')).toBe('o2');
    const pq = prep('P06');
    expect(grade(pq, { kind: 'texts', value: ['KG / M3'] }).points).toBe(300);
    expect(grade(pq, { kind: 'texts', value: ['g/cm³'] }).points).toBe(0);
  });
  it('fill blanks: partial credit and teacher overrides', () => {
    const q: Question = { ...(bank.B03 as any), id: 'T', text: '___ / ___ / ___', blanks: [{ accepted: ['carbon'] }, { accepted: ['respiration'] }, { accepted: ['decomposers'] }] };
    const pq = prepareQuestion(q, 0, 0, 1, false);
    const r = grade(pq, { kind: 'texts', value: ['carbon', 'respiraton', 'nope'] });
    expect(r.points).toBe(100);
    expect(r.uncertain).toEqual([1]);
    expect(grade(pq, { kind: 'texts', value: ['carbon', 'respiraton', 'nope'] }, { overrides: { 1: true } }).points).toBe(200);
  });
  it('numeric: decimals, commas, negatives, units, tolerance', () => {
    expect(parseNumber('3,0')).toBe(3);
    expect(parseNumber('-2.5')).toBe(-2.5);
    expect(parseNumber('3 g/cm3')).toBe(3);
    expect(parseNumber('abc')).toBeNaN();
    const pq = prep('P03');
    expect(grade(pq, { kind: 'number', value: '3.0' }, { elapsedMs: 0 }).points).toBe(130);
    expect(grade(pq, { kind: 'number', value: '3.005' }).correct).toBe(true);
    expect(grade(pq, { kind: 'number', value: '4' }).correct).toBe(false);
    const neg = prepareQuestion({ ...(bank.P03 as any), answer: -12.5, tolerance: 2, toleranceType: 'percent' }, 0, 0, 1, false);
    expect(grade(neg, { kind: 'number', value: '-12.7' }).correct).toBe(true);
    expect(grade(neg, { kind: 'number', value: '12.5' }).correct).toBe(false);
  });
  it('matching: partial credit via opaque ids', () => {
    const pq = prep('B11');
    const pub = toPublicQuestion(pq);
    const right = pub.matching!.right;
    const correctMap: Record<string, string> = {};
    pub.matching!.left.forEach((l, i) => { correctMap[l.id] = right.find((r) => r.text === (bank.B11 as any).pairs[i].right)!.id; });
    expect(grade(pq, { kind: 'pairs', value: correctMap }).points).toBe(300);
    const half = { ...correctMap };
    const [a, b] = pub.matching!.left;
    [half[a.id], half[b.id]] = [half[b.id], half[a.id]];
    expect(grade(pq, { kind: 'pairs', value: half }).points).toBe(150);
  });
  it('drag and drop: partial credit, 100 per correct zone', () => {
    const pq = prep('B12');
    const items = pq.dragIds!.items;
    const id = (t: string) => items.find((i) => i.text === t)!.id;
    expect(grade(pq, { kind: 'pairs', value: { z1: id('Photosynthesis'), z2: id('Feeding'), z3: id('Respiration'), z4: id('Decomposition') } }).points).toBe(400);
    expect(grade(pq, { kind: 'pairs', value: { z1: id('Respiration'), z2: id('Feeding'), z3: id('Photosynthesis'), z4: id('Decomposition') } }).points).toBe(200);
  });
  it('build an atom: per-shell credit, extra shells penalised', () => {
    expect(electronConfiguration(20)).toEqual([2, 8, 8, 2]);
    const pq = prep('C10');
    expect(grade(pq, { kind: 'shells', value: [2, 8, 1, 0] }).points).toBe(300);
    expect(grade(pq, { kind: 'shells', value: [2, 9, 0, 0] }).points).toBe(100);
    const r = grade(pq, { kind: 'shells', value: [2, 8, 0, 1] });
    expect(r.correct).toBe(false);
    expect(r.points).toBe(150);
  });
  it('speed bonus ignores paused time', () => {
    const segs = [{ s: 1000, e: 6000 }, { s: 20000, e: null }];
    expect(elapsedAt(4000, segs)).toBe(3000);
    expect(elapsedAt(22000, segs)).toBe(7000);
    expect(speedBonus(30, 0, 30)).toBe(30);
    expect(speedBonus(30, 30000, 30)).toBe(0);
  });
});

describe.skipIf(!HAS_BANKS)('answer secrecy', () => {
  it('public payloads never contain answer keys or explanations', () => {
    const { prepared } = prepareGame(imported.bank.presets!.all50.rounds, bank, DEFAULT_SETTINGS, rng);
    for (const pq of prepared) {
      const full = toPublicQuestion(pq);
      expect(JSON.stringify(full.adapted ?? {})).not.toMatch(/"answer"/);
      const pub = JSON.stringify({ ...full, adapted: undefined });
      expect(pub).not.toMatch(/"answer"|"accepted"|"explanation"|"shells"|"pairs"|"options"|"prompt"/);
      if (pq.q.type === 'dragdrop') expect(JSON.parse(pub).dragdrop.zones.every((z: any) => !('answer' in z))).toBe(true);
      if (pq.q.type === 'matching') {
        const m = toPublicQuestion(pq).matching!;
        // Right-hand ids do not reveal which left item they belong to.
        expect(m.right.map((r) => r.id)).not.toEqual(m.left.map((l) => l.id));
      }
    }
  });
});

describe('state machine', () => {
  const rounds = [{ title: 'R1', lab: 'biology' as const, start: 0, count: 2 }, { title: 'R2', lab: 'physics' as const, start: 2, count: 1 }];
  it('individual mode: lobby goes straight to the first round, no teams', () => {
    expect(canTransition('LOBBY', 'ROUND_INTRO')).toBe(true);
    expect(makeTeams({ ...DEFAULT_SETTINGS, playMode: 'individual' })).toEqual({});
    expect(Object.keys(makeTeams(DEFAULT_SETTINGS))).toHaveLength(4);
  });
  it('only allows legal transitions', () => {
    expect(canTransition('LOBBY', 'QUESTION_OPEN')).toBe(false);
    expect(canTransition('QUESTION_OPEN', 'LEADERBOARD')).toBe(false); // must close/reveal first
    expect(canTransition('QUESTION_OPEN', 'SUBMISSIONS_CLOSED')).toBe(true);
    expect(canTransition('GAME_COMPLETE', 'LOBBY')).toBe(false);
  });
  it('walks through a whole game', () => {
    const s = { leaderboardFrequency: 'question' as const };
    let st = nextStep('TEAM_ASSIGNMENT', { qIndex: -1, roundIndex: 0, rounds, settings: s });
    expect(st).toEqual({ phase: 'ROUND_INTRO', qIndex: -1, roundIndex: 0 });
    st = nextStep('ROUND_INTRO', { ...st, rounds, settings: s });
    expect(st.phase).toBe('QUESTION_OPEN');
    expect(nextStep('CORRECTION_REVEALED', { qIndex: 0, roundIndex: 0, rounds, settings: s }).phase).toBe('LEADERBOARD');
    expect(nextStep('LEADERBOARD', { qIndex: 0, roundIndex: 0, rounds, settings: s })).toMatchObject({ phase: 'QUESTION_OPEN', qIndex: 1 });
    expect(nextStep('LEADERBOARD', { qIndex: 1, roundIndex: 0, rounds, settings: s }).phase).toBe('ROUND_COMPLETE');
    expect(nextStep('ROUND_COMPLETE', { qIndex: 1, roundIndex: 0, rounds, settings: s })).toMatchObject({ phase: 'ROUND_INTRO', roundIndex: 1 });
    expect(nextStep('LEADERBOARD', { qIndex: 2, roundIndex: 1, rounds, settings: s }).phase).toBe('GAME_COMPLETE');
    expect(nextStep('CORRECTION_REVEALED', { qIndex: 0, roundIndex: 0, rounds, settings: { leaderboardFrequency: 'round' } }).phase).toBe('QUESTION_OPEN');
    expect(() => nextStep('QUESTION_OPEN', { qIndex: 0, roundIndex: 0, rounds, settings: s })).toThrow();
  });
});

describe('teams and leaderboards', () => {
  it('random assignment is balanced for every class size', () => {
    for (let n = 1; n <= 33; n++) for (let t = 2; t <= 5; t++) {
      const uids = Array.from({ length: n }, (_, i) => `u${i}`);
      const teams = Array.from({ length: t }, (_, i) => `t${i}`);
      const a = assignTeams(uids, teams, seededRng(n * 10 + t));
      const counts = teams.map((tid) => Object.values(a).filter((x) => x === tid).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      expect(Object.keys(a)).toHaveLength(n);
    }
  });
  it('late joiners go to the smallest team', () => {
    const players: Record<string, Player> = { a: { name: 'A', nameKey: 'a', joinedAt: 1, teamId: 't0' }, b: { name: 'B', nameKey: 'b', joinedAt: 2, teamId: 't0' }, c: { name: 'C', nameKey: 'c', joinedAt: 3, teamId: 't1' } };
    expect(smallestTeam(['t0', 't1', 't2'], players)).toBe('t2');
  });
  it('ranks deterministically and sums team scores', () => {
    const players: Record<string, Player> = {
      a: { name: 'Youssef', nameKey: 'youssef', joinedAt: 3, teamId: 't0' },
      b: { name: 'Mariem', nameKey: 'mariem', joinedAt: 1, teamId: 't1' },
      c: { name: 'Khalil', nameKey: 'khalil', joinedAt: 2, teamId: 't0' },
      d: { name: 'Gone', nameKey: 'gone', joinedAt: 0, teamId: 't1', removed: true },
    };
    const results = {
      q0: { a: { points: 130, max: 130, correct: true, partsCorrect: 1, partsTotal: 1, answered: true, elapsedMs: 1000 }, b: { points: 130, max: 130, correct: true, partsCorrect: 1, partsTotal: 1, answered: true, elapsedMs: 900 }, d: { points: 999, max: 130, correct: true, partsCorrect: 1, partsTotal: 1, answered: true } },
      q1: { a: { points: 100, max: 130, correct: true, partsCorrect: 1, partsTotal: 1, answered: true, elapsedMs: 5000 }, b: { points: 100, max: 130, correct: true, partsCorrect: 1, partsTotal: 1, answered: true, elapsedMs: 5000 } },
    };
    const scores = totalsFromResults(results);
    const ranked = rankPlayers(players, scores);
    expect(ranked.map((r) => r.name)).toEqual(['Mariem', 'Youssef', 'Khalil']); // tie on points → faster wins
    const teams = rankTeams(makeTeams({ ...DEFAULT_SETTINGS, teamCount: 2 }), players, scores);
    expect(teams[0].total).toBe(230);
    expect(teams.find((t) => t.teamId === 't1')!.total).toBe(230); // removed player excluded
    // Idempotent: recomputing gives the same totals.
    expect(totalsFromResults(results)).toEqual(scores);
  });
  it('name keys catch duplicates regardless of case and spacing', () => {
    expect(nameKey('  Youssef ')).toBe(nameKey('youssef'));
    expect(nameKey('a.b/c')).not.toMatch(/[.\/]/);
  });
});

describe.skipIf(!HAS_BANKS)('import / export', () => {
  it('round-trips the bank through JSON and CSV', () => {
    const full: QuestionBank = { id: 'x', ...imported.bank };
    const again = parseJsonBank(exportBankJson(full));
    expect(again.errors).toEqual([]);
    expect(again.bank.questions).toEqual(bank);
    const csv = parseCsvBank(exportBankCsv(full));
    expect(csv.errors).toEqual([]);
    expect(Object.keys(csv.bank.questions)).toHaveLength(50);
    expect(csv.bank.questions.B12).toEqual(bank.B12);
    expect(csv.bank.questions.C16).toEqual(bank.C16);
    expect(csv.bank.questions.B06).toEqual(bank.B06);
  });
  it('reports clear errors for bad rows', () => {
    const bad = parseJsonBank(JSON.stringify([{ id: 'A1', type: 'mcq', lab: 'biology', prompt: 'x', options: ['a', 'b'], answer: 'D' }, { id: 'A2', type: 'atom', lab: 'chemistry', prompt: 'x', atomicNumber: 11, shells: [2, 8, 2] }]));
    expect(bad.errors.join('\n')).toMatch(/A1.*answer/);
    expect(bad.errors.join('\n')).toMatch(/A2.*11 electrons/);
  });
});

describe.skipIf(!HAS_BANKS)('report', () => {
  it('builds per-lab percentages and a CSV', () => {
    const { prepared } = prepareGame(imported.bank.presets!.default24.rounds, bank, DEFAULT_SETTINGS, rng);
    const players: Record<string, Player> = { a: { name: '=cmd', nameKey: 'x', joinedAt: 1, teamId: 't0' } };
    const results = { q0: { a: grade(prepared[0], { kind: 'choice', value: 2 }, { elapsedMs: 0 }) }, q6: { a: grade(prepared[6], { kind: 'choice', value: 0 }) } };
    const rep = buildReport(prepared, players, makeTeams(DEFAULT_SETTINGS), results);
    expect(rep.rows[0].labs.biology.pct).toBe(100);
    expect(rep.rows[0].labs.physics.pct).toBe(0);
    expect(rep.rows[0].revise).toEqual(['P01']);
    const csv = reportCsv(rep, prepared);
    expect(csv).toContain("'=cmd"); // formula injection neutralised
  });
});
