import type { Backend } from '../backend';
import { cleanName, nameKey } from '../lib/game';
import type { Answer } from '../lib/types';
import { roomPath } from './host';

const LAST_ROOM = 'sq-last-room';

export function rememberRoom(code: string | null) {
  try { code ? localStorage.setItem(LAST_ROOM, code) : localStorage.removeItem(LAST_ROOM); } catch { /* private mode */ }
}
export function lastRoom(): string | null {
  try { return localStorage.getItem(LAST_ROOM); } catch { return null; }
}

export type JoinError = 'bad-code' | 'not-found' | 'closed' | 'name-taken' | 'bad-name' | 'full' | 'removed' | 'network';

export const JOIN_ERROR_TEXT: Record<JoinError, string> = {
  'bad-code': 'Room codes have 6 digits.',
  'not-found': 'No game with that code. Check the code on the screen.',
  closed: 'This game has already started and is not accepting new players.',
  'name-taken': 'Someone already has that name. Add your surname initial.',
  'bad-name': 'Please type your name (1–20 characters).',
  full: 'This room is full.',
  removed: 'You were removed from this game by the teacher.',
  network: 'Could not connect. Check your internet and try again.',
};

/** Join (or re-join after a refresh / lost connection — same anonymous identity). */
export async function joinRoom(db: Backend, codeRaw: string, nameRaw: string): Promise<{ ok: true; code: string } | { ok: false; error: JoinError }> {
  const code = codeRaw.replace(/\D/g, '');
  if (code.length !== 6) return { ok: false, error: 'bad-code' };
  const user = db.user() ?? (await db.signInAnon().catch(() => null));
  if (!user) return { ok: false, error: 'network' };
  let meta, state, settings, me, playerCount;
  try {
    [meta, state, settings] = await Promise.all([db.get(`${roomPath(code)}/meta`), db.get(`${roomPath(code)}/state`), db.get(`${roomPath(code)}/settings`)]);
    if (!meta) return { ok: false, error: 'not-found' };
    const players = (await db.get(`${roomPath(code)}/players`)) ?? {};
    me = players[user.uid];
    playerCount = Object.keys(players).length;
  } catch { return { ok: false, error: 'network' }; }
  if (me) {
    if (me.removed) return { ok: false, error: 'removed' };
    rememberRoom(code);
    return { ok: true, code };
  }
  const name = cleanName(nameRaw);
  if (!name) return { ok: false, error: 'bad-name' };
  if (state?.phase !== 'LOBBY' && !(settings?.allowLateJoin && state?.phase !== 'GAME_COMPLETE')) return { ok: false, error: 'closed' };
  if (playerCount >= (settings?.maxPlayers ?? 40)) return { ok: false, error: 'full' };
  const key = nameKey(name);
  const taken = await db.get(`${roomPath(code)}/names/${key}`).catch(() => null);
  if (taken && taken !== user.uid) return { ok: false, error: 'name-taken' };
  try {
    await db.update(roomPath(code), {
      [`players/${user.uid}`]: { name, nameKey: key, joinedAt: db.TS },
      [`names/${key}`]: user.uid,
    });
  } catch {
    // Rules rejected it: most likely someone took the name a moment earlier.
    const again = await db.get(`${roomPath(code)}/names/${key}`).catch(() => null);
    return { ok: false, error: again && again !== user.uid ? 'name-taken' : 'closed' };
  }
  rememberRoom(code);
  return { ok: true, code };
}

/** Keep a presence flag while connected; Firebase removes it automatically on disconnect. */
export function trackPresence(db: Backend, code: string, uid: string): () => void {
  const path = `${roomPath(code)}/presence/${uid}`;
  return db.onConnected((c) => {
    if (!c) return;
    db.onDisconnectRemove(path).then(() => db.set(path, true)).catch(() => undefined);
  });
}

export async function submitAnswer(db: Backend, code: string, qKey: string, uid: string, answer: Answer, adapted = false) {
  await db.set(`${roomPath(code)}/submissions/${qKey}/${uid}`, { a: JSON.stringify({ answer, ...(adapted ? { adapted: true } : {}) }), at: db.TS });
}
