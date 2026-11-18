import type { Answer, GradeResult, PreparedQuestion, Question } from './types';

export const DEFAULT_POINTS: Record<Question['type'], { points: number; speedBonus: number; time: number }> = {
  mcq: { points: 100, speedBonus: 30, time: 30 },
  truefalse: { points: 100, speedBonus: 30, time: 20 },
  fill: { points: 300, speedBonus: 0, time: 60 },
  numeric: { points: 100, speedBonus: 30, time: 60 },
  matching: { points: 300, speedBonus: 0, time: 60 },
  dragdrop: { points: 400, speedBonus: 0, time: 90 },
  atom: { points: 300, speedBonus: 0, time: 60 },
  density: { points: 100, speedBonus: 30, time: 90 },
};

/** Normalise free text: case, spacing, superscripts, trailing punctuation. */
export function normalizeText(s: string): string {
  return (s ?? '')
    .normalize('NFKC') // ³ → 3, ² → 2, full-width chars → ASCII
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\^/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export type BlankVerdict = 'correct' | 'uncertain' | 'wrong' | 'empty';

/** Accepted answers only — near misses are flagged "uncertain" for teacher review, never auto-accepted. */
export function judgeBlank(input: string, accepted: string[], rejected: string[] = []): BlankVerdict {
  const v = normalizeText(input);
  if (!v) return 'empty';
  if (rejected.some((r) => normalizeText(r) === v)) return 'wrong';
  const acc = accepted.map(normalizeText).filter(Boolean);
  if (acc.includes(v)) return 'correct';
  const near = acc.some((a) => a.length >= 5 && levenshtein(a, v) <= (a.length >= 9 ? 2 : 1));
  return near ? 'uncertain' : 'wrong';
}

/** Parse a typed number: accepts "3", "3.0", "3,0", "-2.5", "3 g/cm3", "1e3". Returns NaN if no number. */
export function parseNumber(raw: string): number {
  const s = (raw ?? '').trim().replace(/\s+/g, '').replace(/−/g, '-');
  const m = s.match(/^[-+]?(\d+([.,]\d*)?|[.,]\d+)(e[-+]?\d+)?/i);
  if (!m) return NaN;
  return Number(m[0].replace(',', '.'));
}

export function withinTolerance(value: number, target: number, tol: number, type: 'absolute' | 'percent'): boolean {
  if (!Number.isFinite(value)) return false;
  const allowed = type === 'percent' ? Math.abs(target) * (tol / 100) : tol;
  return Math.abs(value - target) <= allowed + 1e-9;
}

/** Speed bonus: linear from full bonus at 0 s to 0 at the time limit. */
export function speedBonus(maxBonus: number, elapsedMs: number, timeLimitSec: number): number {
  if (!maxBonus || timeLimitSec <= 0) return 0;
  const frac = 1 - Math.max(0, elapsedMs) / (timeLimitSec * 1000);
  return Math.max(0, Math.round(maxBonus * Math.min(1, frac)));
}

/** Elapsed active time at server timestamp `t`, given timing segments (pauses excluded). */
export function elapsedAt(t: number, segments: { s: number; e?: number | null }[]): number {
  let acc = 0;
  for (const seg of segments) {
    const end = seg.e ?? Infinity;
    if (t >= end) { acc += end - seg.s; continue; }
    if (t >= seg.s) return acc + (t - seg.s);
    return acc; // submitted during a pause gap (should not happen; rules block it)
  }
  return acc;
}

export function densityAnswer(q: { mass: number; waterBefore: number; waterAfter: number }): number {
  return q.mass / (q.waterAfter - q.waterBefore);
}

export function maxPoints(q: Question): number {
  return q.points + (q.speedBonus ?? 0);
}

export interface GradeOptions {
  elapsedMs?: number;
  timeLimit?: number;
  /** Teacher review decisions for fill blanks: blank index → accepted? */
  overrides?: Record<number, boolean>;
  adapted?: boolean;
}

const none = (max: number): GradeResult => ({ points: 0, max, correct: false, partsCorrect: 0, partsTotal: 1, answered: false });

/** Grade one answer. Pure and deterministic — used by the host and by tests. */
export function grade(pq: PreparedQuestion, answer: Answer | undefined | null, opts: GradeOptions = {}): GradeResult {
  const q = pq.q;
  const tl = opts.timeLimit ?? q.timeLimit;
  const bonus = (ok: boolean) => (ok && opts.elapsedMs !== undefined ? speedBonus(q.speedBonus ?? 0, opts.elapsedMs, tl) : 0);

  // Adapted version (simpler MCQ/TF for selected students)
  if (opts.adapted && q.adapted) {
    const max = maxPoints(q);
    if (!answer || answer.kind !== 'choice') return { ...none(max), adapted: true };
    const ok = answer.value === q.adapted.answer;
    return { points: ok ? q.points + bonus(true) : 0, max, correct: ok, partsCorrect: ok ? 1 : 0, partsTotal: 1, answered: true, elapsedMs: opts.elapsedMs, adapted: true };
  }

  const max = maxPoints(q);
  if (!answer) return { ...none(max), partsTotal: partsTotalOf(q) };

  switch (q.type) {
    case 'mcq': {
      if (answer.kind !== 'choice') return none(max);
      const original = pq.optionOrder ? pq.optionOrder[answer.value] : answer.value;
      const ok = original === q.answer;
      return { points: ok ? q.points + bonus(true) : 0, max, correct: ok, partsCorrect: +ok, partsTotal: 1, answered: true, elapsedMs: opts.elapsedMs };
    }
    case 'truefalse': {
      if (answer.kind !== 'choice') return none(max);
      const ok = (answer.value === 0) === q.answer;
      return { points: ok ? q.points + bonus(true) : 0, max, correct: ok, partsCorrect: +ok, partsTotal: 1, answered: true, elapsedMs: opts.elapsedMs };
    }
    case 'numeric':
    case 'density': {
      if (answer.kind !== 'number') return none(max);
      const target = q.type === 'numeric' ? q.answer : densityAnswer(q);
      const ok = q.type === 'numeric'
        ? withinTolerance(parseNumber(answer.value), target, q.tolerance, q.toleranceType)
        : withinTolerance(parseNumber(answer.value), target, q.tolerance, 'absolute');
      return { points: ok ? q.points + bonus(true) : 0, max, correct: ok, partsCorrect: +ok, partsTotal: 1, answered: true, elapsedMs: opts.elapsedMs };
    }
    case 'fill': {
      if (answer.kind !== 'texts') return { ...none(max), partsTotal: q.blanks.length };
      let good = 0;
      const uncertain: number[] = [];
      q.blanks.forEach((b, i) => {
        const verdict = judgeBlank(answer.value[i] ?? '', b.accepted, b.rejected);
        const override = opts.overrides?.[i];
        if (override !== undefined && verdict !== 'empty') { if (override) good++; return; }
        if (verdict === 'correct') good++;
        else if (verdict === 'uncertain') uncertain.push(i);
      });
      return partial(q.points, max, good, q.blanks.length, opts.elapsedMs, uncertain);
    }
    case 'matching': {
      if (answer.kind !== 'pairs' || !pq.matchingIds) return { ...none(max), partsTotal: q.pairs.length };
      const { left, right, rightOrder } = pq.matchingIds;
      let good = 0;
      left.forEach((lid, i) => {
        const chosen = answer.value[lid];
        const pos = right.indexOf(chosen);
        if (pos >= 0 && rightOrder[pos] === i) good++;
      });
      return partial(q.points, max, good, q.pairs.length, opts.elapsedMs);
    }
    case 'dragdrop': {
      if (answer.kind !== 'pairs' || !pq.dragIds) return { ...none(max), partsTotal: q.zones.length };
      let good = 0;
      q.zones.forEach((z) => {
        const itemId = answer.value[z.id];
        const item = pq.dragIds!.items.find((it) => it.id === itemId);
        if (item && normalizeText(item.text) === normalizeText(z.answer)) good++;
      });
      return partial(q.points, max, good, q.zones.length, opts.elapsedMs);
    }
    case 'atom': {
      if (answer.kind !== 'shells') return { ...none(max), partsTotal: q.shells.length };
      const got = answer.value;
      // Every shell that should hold electrons is one part; electrons wrongly placed in an
      // outer shell that should be empty count as an extra wrong part.
      let lastUsed = got.length - 1;
      while (lastUsed >= 0 && !got[lastUsed]) lastUsed--;
      const total = Math.max(q.shells.length, lastUsed + 1);
      let good = 0;
      for (let i = 0; i < total; i++) if ((got[i] ?? 0) === (q.shells[i] ?? 0)) good++;
      const res = partial(q.points, max, good, total, opts.elapsedMs);
      res.points = Math.round((q.points * good) / total);
      return res;
    }
  }
}

function partial(points: number, max: number, good: number, total: number, elapsedMs?: number, uncertain?: number[]): GradeResult {
  return {
    points: Math.round((points * good) / Math.max(1, total)),
    max,
    correct: good === total,
    partsCorrect: good,
    partsTotal: total,
    answered: true,
    elapsedMs,
    ...(uncertain && uncertain.length ? { uncertain } : {}),
  };
}

export function partsTotalOf(q: Question): number {
  switch (q.type) {
    case 'fill': return q.blanks.length;
    case 'matching': return q.pairs.length;
    case 'dragdrop': return q.zones.length;
    case 'atom': return q.shells.length;
    default: return 1;
  }
}

/** Shell configuration for the first 20 elements (2, 8, 8, 2 rule). */
export function electronConfiguration(z: number): number[] {
  const caps = [2, 8, 8, 2];
  const out: number[] = [];
  let left = z;
  for (const c of caps) {
    if (left <= 0) break;
    out.push(Math.min(c, left));
    left -= c;
  }
  return out;
}
