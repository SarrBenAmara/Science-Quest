import { useEffect, useState } from 'react';
import { getBackend, type AppUser } from './backend';
import type { HostRoom } from './game/host';
import type { GameSettings, GameState, GradeResult, Player, PublicQuestion, PublicRound, RevealPayload, ScoreRecord, Submission, Team } from './lib/types';

export function useUser(role: 'host' | 'player') {
  const db = getBackend(role);
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  useEffect(() => db.onUser(setUser), [db]);
  return user;
}

/** Teacher / projector: the whole room (host-only read). undefined = still loading, null = no such room. */
export function useHostRoom(code: string | null | undefined) {
  const db = getBackend('host');
  // Remember WHICH room a value belongs to, so a stale "null" is never mistaken for "room missing".
  const [state, setState] = useState<{ code: string | null | undefined; room: HostRoom | null | undefined }>({ code: undefined, room: undefined });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    return db.listen(`rooms/${code}`, (v) => setState({ code, room: v }), (e) => setError(e.message));
  }, [db, code]);
  const room = !code ? null : state.code === code ? state.room : undefined;
  return { room, error };
}

export function useListen<T>(role: 'host' | 'player', path: string | null, initial: T, whenNull: T = initial): T {
  const db = getBackend(role);
  const [val, setVal] = useState<T>(initial);
  useEffect(() => {
    if (!path) { setVal(initial); return; }
    setVal(initial);
    return db.listen(path, (v) => setVal(v ?? whenNull), () => setVal(whenNull));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, path]);
  return val;
}

/** Student view of a room: only the public nodes + the student's own answer and result. */
export function usePlayerRoom(code: string | null, uid: string | null) {
  const base = code ? `rooms/${code}` : null;
  const p = (s: string) => (base ? `${base}/${s}` : null);
  const meta = useListen<{ hostUid: string } | null>('player', p('meta'), null);
  const state = useListen<GameState | null>('player', p('state'), null);
  const settings = useListen<GameSettings | null>('player', p('settings'), null);
  const plan = useListen<{ rounds: PublicRound[] } | null>('player', p('plan'), null);
  const question = useListen<PublicQuestion | null>('player', p('question'), null);
  const reveal = useListen<RevealPayload | null>('player', p('reveal'), null);
  const teams = useListen<Record<string, Team>>('player', p('teams'), {});
  const playersRaw = useListen<Record<string, Player> | 'loading'>('player', p('players'), 'loading', {});
  const playersLoaded = playersRaw !== 'loading';
  const players = playersLoaded ? (playersRaw as Record<string, Player>) : {};
  const scores = useListen<Record<string, ScoreRecord>>('player', p('scores'), {});
  const qKey = state?.qKey ?? 'none';
  const mySubmission = useListen<Submission | null>('player', uid && base && qKey !== 'none' ? `${base}/submissions/${qKey}/${uid}` : null, null);
  const myResult = useListen<GradeResult | null>('player', uid && base && qKey !== 'none' ? `${base}/results/${qKey}/${uid}` : null, null);
  return { meta, state, settings, plan, question, reveal, teams, players, playersLoaded, scores, mySubmission, myResult };
}

export function useIsPortrait() {
  const q = '(max-aspect-ratio: 1/1), (max-width: 760px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export function joinUrl(code?: string) {
  if (location.origin === 'null' && !location.protocol.startsWith('file')) return 'this page → PLAY';
  const base = `${location.origin === 'null' ? 'file://' : location.origin}${location.pathname}`;
  return `${base}#/play${code ? `?code=${code}` : ''}`;
}
