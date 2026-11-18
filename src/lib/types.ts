// ───────────────────────── Question bank (teacher-only, contains answer keys) ─────────────────────────

export type Lab = 'biology' | 'physics' | 'chemistry';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QType = 'mcq' | 'truefalse' | 'fill' | 'numeric' | 'matching' | 'dragdrop' | 'atom' | 'density';

export const QTYPE_LABEL: Record<QType, string> = {
  mcq: 'Multiple Choice',
  truefalse: 'True / False',
  fill: 'Fill in the Blanks',
  numeric: 'Numerical Answer',
  matching: 'Matching',
  dragdrop: 'Drag and Drop',
  atom: 'Build an Atom',
  density: 'Virtual Density Challenge',
};

export const LAB_LABEL: Record<Lab, string> = { biology: 'Biology', physics: 'Physics', chemistry: 'Chemistry' };

/** Built-in diagrams drawn in SVG; a custom image URL can be used instead. */
export type DiagramSpec =
  | { kind: 'carbon-cycle' }
  | { kind: 'sequence'; vertical?: boolean }
  | { kind: 'balance-cylinder'; mass: number; volume: number; object?: string }
  | { kind: 'image'; src: string; aspect?: number };

export interface DropZone {
  id: string;
  /** Position and size in % of the diagram box (0–100). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text of the item that belongs here (answer key). */
  answer: string;
  label?: string;
}

export interface AdaptedVersion {
  type: 'mcq' | 'truefalse';
  prompt: string;
  options?: string[]; // mcq only
  answer: number; // option index; truefalse: 0 = True, 1 = False
}

interface QBase {
  id: string;
  type: QType;
  lab: Lab;
  topic: string;
  difficulty: Difficulty;
  prompt: string;
  explanation: string;
  timeLimit: number; // seconds
  points: number; // maximum points (excluding speed bonus)
  speedBonus?: number; // only for single-answer types (mcq, truefalse, numeric, density)
  image?: string;
  diagram?: DiagramSpec;
  adapted?: AdaptedVersion;
}

export interface MCQQuestion extends QBase { type: 'mcq'; options: string[]; answer: number }
export interface TrueFalseQuestion extends QBase { type: 'truefalse'; answer: boolean }
export interface FillQuestion extends QBase {
  type: 'fill';
  /** Text shown on the projector. Each "___" is one blank; new lines separate sentences. */
  text: string;
  blanks: { accepted: string[]; rejected?: string[] }[];
}
export interface NumericQuestion extends QBase {
  type: 'numeric';
  answer: number;
  tolerance: number;
  toleranceType: 'absolute' | 'percent';
  unit: string;
}
export interface MatchingQuestion extends QBase { type: 'matching'; pairs: { left: string; right: string }[] }
export interface DragDropQuestion extends QBase {
  type: 'dragdrop';
  diagram: DiagramSpec;
  zones: DropZone[];
  distractors?: string[];
}
export interface AtomQuestion extends QBase {
  type: 'atom';
  element: string;
  symbol: string;
  atomicNumber: number;
  shells: number[]; // expected configuration e.g. [2, 8, 1]
  maxShells?: number;
}
export interface DensityQuestion extends QBase {
  type: 'density';
  object: string;
  mass: number; // g
  waterBefore: number; // cm³
  waterAfter: number; // cm³
  tolerance: number;
}

export type Question =
  | MCQQuestion | TrueFalseQuestion | FillQuestion | NumericQuestion
  | MatchingQuestion | DragDropQuestion | AtomQuestion | DensityQuestion;

export interface RoundPlan { title: string; lab: Lab | 'mixed'; subtitle?: string; questionIds: string[] }

export interface QuestionBank {
  id: string;
  name: string;
  description?: string;
  updatedAt?: number;
  questions: Record<string, Question>;
  order?: string[];
  presets?: Record<string, { name: string; rounds: RoundPlan[] }>;
}

// ───────────────────────── Live game (room) ─────────────────────────

export type Phase =
  | 'LOBBY' | 'TEAM_ASSIGNMENT' | 'ROUND_INTRO' | 'QUESTION_OPEN' | 'SUBMISSIONS_CLOSED'
  | 'CORRECTION_REVEALED' | 'LEADERBOARD' | 'ROUND_COMPLETE' | 'GAME_COMPLETE' | 'PAUSED';

export interface GameSettings {
  /** 'teams' = individual scores + team scores; 'individual' = everyone plays alone, no teams. */
  playMode: 'teams' | 'individual';
  teamCount: number;
  teamNames: string[];
  questionOrder: 'listed' | 'shuffle-within-rounds';
  shuffleOptions: boolean;
  leaderboardFrequency: 'question' | 'round' | 'end';
  autoRevealWhenAllSubmitted: boolean;
  autoCloseOnTimeout: boolean;
  allowLateJoin: boolean;
  timeMultiplier: number; // 1 = per-question time limits
  maxPlayers: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  playMode: 'teams',
  teamCount: 4,
  teamNames: ['Team Alpha', 'Team Beta', 'Team Gamma', 'Team Delta', 'Team Epsilon'],
  questionOrder: 'listed',
  shuffleOptions: false,
  leaderboardFrequency: 'question',
  autoRevealWhenAllSubmitted: true,
  autoCloseOnTimeout: false,
  allowLateJoin: true,
  timeMultiplier: 1,
  maxPlayers: 40,
};

export interface PublicRound { title: string; lab: Lab | 'mixed'; subtitle?: string; start: number; count: number }

export interface GameState {
  phase: Phase;
  prevPhase?: Phase | null;
  qIndex: number; // global question index, -1 before first question
  qKey: string; // "q{index}" — key used for submissions/results
  roundIndex: number;
  startedAt?: number | null; // server timestamp when current timing segment started
  accMs?: number; // milliseconds elapsed in earlier segments (pause/resume)
  timeLimit?: number;
  totalQuestions: number;
}

export interface Player {
  name: string;
  nameKey: string;
  joinedAt: number;
  teamId?: string;
  removed?: boolean;
  adapted?: boolean;
}

export interface Team { name: string; color: string; order: number }

export interface ScoreRecord {
  total: number;
  correct: number;
  incorrect: number;
  answered: number;
  timeMs: number; // tie-breaker: total response time on answered questions
}

/** Student-safe question payload: never contains answer keys. */
export interface PublicQuestion {
  index: number;
  numberInRound: number;
  roundIndex: number;
  type: QType;
  lab: Lab;
  topic: string;
  timeLimit: number;
  optionCount?: number;
  blankCount?: number;
  unit?: string;
  matching?: { left: { id: string; text: string }[]; right: { id: string; text: string }[] };
  dragdrop?: { diagram: DiagramSpec; zones: { id: string; x: number; y: number; w: number; h: number; label?: string }[]; items: { id: string; text: string }[] };
  atom?: { element: string; symbol: string; atomicNumber: number; maxShells: number };
  density?: { object: string; mass: number; waterBefore: number; waterAfter: number };
  adapted?: { type: 'mcq' | 'truefalse'; prompt: string; options?: string[] };
}

/** Question as stored for the host during a game: full key + opaque ids matching the public payload. */
export interface PreparedQuestion {
  index: number;
  roundIndex: number;
  numberInRound: number;
  q: Question;
  /** For mcq after option shuffle: display order → original option index. */
  optionOrder?: number[];
  matchingIds?: { left: string[]; right: string[]; rightOrder: number[] };
  dragIds?: { items: { id: string; text: string }[] };
}

export type Answer =
  | { kind: 'choice'; value: number }
  | { kind: 'texts'; value: string[] }
  | { kind: 'number'; value: string }
  | { kind: 'pairs'; value: Record<string, string> }
  | { kind: 'shells'; value: number[] };

export interface Submission { a: string; at: number } // a = JSON of { answer: Answer, adapted?: boolean }

export interface GradeResult {
  points: number;
  max: number;
  correct: boolean;
  partsCorrect: number;
  partsTotal: number;
  answered: boolean;
  elapsedMs?: number;
  /** Fill blanks that were close to an accepted answer — candidates for teacher review. */
  uncertain?: number[];
  adapted?: boolean;
}

export interface RevealPayload {
  qKey: string;
  type: QType;
  correctLetter?: string; // A–D for mcq/truefalse
  correctText: string;
  parts?: string[]; // per-part correct answers (fill blanks, drop zones, matching pairs, shells)
  explanation: string;
  distribution?: number[]; // answer counts per option (choice questions)
  adapted?: { correctLetter: string; correctText: string };
}
