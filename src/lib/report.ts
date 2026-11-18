import type { GradeResult, Lab, Player, PreparedQuestion, QType, Team } from './types';
import { LAB_LABEL, QTYPE_LABEL } from './types';
import { rankPlayers, totalsFromResults } from './game';

export interface ReportRow {
  rank: number;
  name: string;
  team: string;
  total: number;
  max: number;
  correct: number;
  incorrect: number;
  labs: Record<Lab, { points: number; max: number; pct: number }>;
  types: Partial<Record<QType, { points: number; max: number; pct: number }>>;
  revise: string[]; // question ids scored below 50 %
}

export interface QuestionSummary { id: string; lab: Lab; topic: string; type: QType; prompt: string; avgPct: number; fullyCorrect: number; answered: number }

const pct = (p: number, m: number) => (m ? Math.round((100 * p) / m) : 0);

export function buildReport(
  prepared: PreparedQuestion[], players: Record<string, Player>, teams: Record<string, Team>,
  results: Record<string, Record<string, GradeResult>>,
): { rows: ReportRow[]; questions: QuestionSummary[] } {
  const scores = totalsFromResults(results);
  const ranked = rankPlayers(players, scores);
  const revealed = prepared.filter((pq) => results[`q${pq.index}`]);
  const rows: ReportRow[] = ranked.map((rp) => {
    const labs = { biology: { points: 0, max: 0, pct: 0 }, physics: { points: 0, max: 0, pct: 0 }, chemistry: { points: 0, max: 0, pct: 0 } };
    const types: ReportRow['types'] = {};
    const revise: string[] = [];
    let max = 0;
    for (const pq of revealed) {
      const r = results[`q${pq.index}`]?.[rp.uid];
      const m = r?.max ?? pq.q.points + (pq.q.speedBonus ?? 0);
      const p = r?.points ?? 0;
      max += m;
      labs[pq.q.lab].points += p; labs[pq.q.lab].max += m;
      const t = (types[pq.q.type] ??= { points: 0, max: 0, pct: 0 });
      t.points += p; t.max += m;
      const partsPct = r ? r.partsCorrect / Math.max(1, r.partsTotal) : 0;
      if (partsPct < 0.5) revise.push(pq.q.id);
    }
    (Object.keys(labs) as Lab[]).forEach((k) => (labs[k].pct = pct(labs[k].points, labs[k].max)));
    Object.values(types).forEach((t) => t && (t.pct = pct(t.points, t.max)));
    const s = scores[rp.uid];
    return {
      rank: rp.rank, name: rp.name, team: teams[players[rp.uid].teamId ?? '']?.name ?? '—',
      total: s?.total ?? 0, max, correct: s?.correct ?? 0, incorrect: revealed.length - (s?.correct ?? 0),
      labs, types, revise,
    };
  });
  const active = Object.entries(players).filter(([, p]) => !p.removed).map(([uid]) => uid);
  const questions: QuestionSummary[] = revealed.map((pq) => {
    const res = results[`q${pq.index}`] ?? {};
    const per = active.map((uid) => res[uid]);
    const avg = per.length ? per.reduce((s, r) => s + (r ? r.partsCorrect / Math.max(1, r.partsTotal) : 0), 0) / per.length : 0;
    return {
      id: pq.q.id, lab: pq.q.lab, topic: pq.q.topic, type: pq.q.type, prompt: pq.q.prompt,
      avgPct: Math.round(avg * 100), fullyCorrect: per.filter((r) => r?.correct).length, answered: per.filter((r) => r?.answered).length,
    };
  });
  return { rows, questions };
}

function csvCell(v: unknown, guard: boolean): string {
  const s = String(v ?? '');
  // Guard against spreadsheet formula injection from student-typed names.
  const safe = guard && typeof v === 'string' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number)[][], guard = true): string {
  return '\uFEFF' + rows.map((r) => r.map((c) => csvCell(c, guard)).join(',')).join('\r\n');
}

export function reportCsv(report: ReturnType<typeof buildReport>, prepared: PreparedQuestion[]): string {
  const types = Array.from(new Set(prepared.map((p) => p.q.type)));
  const header = [
    'Rank', 'Student', 'Team', 'Total score', 'Max possible', 'Correct answers', 'Incorrect answers',
    'Biology %', 'Physics %', 'Chemistry %', ...types.map((t) => `${QTYPE_LABEL[t]} %`), 'Questions requiring revision',
  ];
  const lines: (string | number)[][] = [header];
  for (const r of report.rows) {
    lines.push([
      r.rank, r.name, r.team, r.total, r.max, r.correct, r.incorrect,
      r.labs.biology.pct, r.labs.physics.pct, r.labs.chemistry.pct,
      ...types.map((t) => (r.types[t] ? r.types[t]!.pct : '')), r.revise.join(' '),
    ]);
  }
  lines.push([]);
  lines.push(['Question', 'Lab', 'Topic', 'Type', 'Class average %', 'Fully correct', 'Answered', 'Prompt']);
  for (const q of report.questions) {
    lines.push([q.id, LAB_LABEL[q.lab], q.topic, QTYPE_LABEL[q.type], q.avgPct, q.fullyCorrect, q.answered, q.prompt]);
  }
  return toCsv(lines);
}
