// Demo mode: the whole game runs inside the browser, no Firebase needed.
// Tabs of the same browser share one database (localStorage + BroadcastChannel), so you can
// open the Teacher Panel, the projector and several "student" tabs side by side to try everything.
// The same database.rules.json is enforced, using the local rules evaluator.
// @ts-expect-error — plain JS module shared with the offline server
import { RulesEngine, resolveServerValues, writesFor, getAt } from '../../devserver/rules.mjs';
import rulesJson from '../../database.rules.json';
import type { AppUser, Backend } from './types';
import { safeStorage } from '../lib/env';

const KEY = 'sq-demo-db';
const rules = new RulesEngine(rulesJson);
let channel: BroadcastChannel | null = null;
try { channel = new BroadcastChannel('sq-demo'); } catch { /* not available (sandboxed preview) */ }
const LS = safeStorage('local');
const SS = safeStorage('session');
const split = (p: string) => (p || '').split('/').filter(Boolean);
const memory: { tree: any } = { tree: null };

function load(): any {
  try { const s = LS.getItem(KEY); return s ? JSON.parse(s) : memory.tree; } catch { return memory.tree; }
}
function save(tree: any) {
  memory.tree = tree;
  try { LS.setItem(KEY, JSON.stringify(tree)); } catch { /* storage unavailable: this tab only */ }
  channel?.postMessage('changed');
  window.dispatchEvent(new Event('sq-demo-changed'));
}

/** Firebase returns objects with numeric keys as arrays. */
function fbVal(v: any): any {
  if (v === null || v === undefined || typeof v !== 'object') return v ?? null;
  const keys = Object.keys(v);
  const out: any = {};
  for (const k of keys) out[k] = fbVal(v[k]);
  if (keys.length && keys.every((k) => /^(0|[1-9]\d*)$/.test(k))) {
    const max = Math.max(...keys.map(Number));
    if (max < keys.length * 2) { const arr: any[] = []; for (const k of keys) arr[Number(k)] = out[k]; return arr; }
  }
  return out;
}

export function createDemoBackend(role: 'host' | 'player'): Backend {
  // Teacher session is shared by its tabs (projector); every student tab is its own player.
  const store = role === 'host' ? LS : SS;
  const authKey = `sq-demo-auth-${role}`;
  let user: (AppUser & { provider: string }) | null = null;
  try { user = JSON.parse(store.getItem(authKey) || 'null'); } catch { /* ignore */ }
  const userCbs = new Set<(u: AppUser | null) => void>();
  const subs = new Map<number, { path: string; cb: (v: any) => void; err?: (e: Error) => void; last?: string }>();
  const disconnect = new Set<string>();
  let sid = 0;

  const ruleAuth = () => (user ? { uid: user.uid, provider: user.provider, token: { email: user.email } } : null);
  const setUser = (u: typeof user) => {
    user = u;
    try { u ? store.setItem(authKey, JSON.stringify(u)) : store.removeItem(authKey); } catch { /* ignore */ }
    userCbs.forEach((cb) => cb(u));
  };

  const notify = () => {
    const tree = load();
    for (const [id, s] of subs) {
      if (!rules.canRead(tree, s.path, ruleAuth())) { subs.delete(id); s.err?.(new Error('PERMISSION_DENIED')); continue; }
      const json = JSON.stringify(fbVal(getAt(tree, split(s.path))));
      if (json !== s.last) { s.last = json; s.cb(JSON.parse(json)); }
    }
  };
  channel?.addEventListener('message', notify);
  window.addEventListener('storage', (e) => e.key === KEY && notify());
  window.addEventListener('sq-demo-changed', notify);
  // Fallback for browsers that limit cross-tab events on file:// pages (e.g. Safari).
  setInterval(notify, 800);

  const write = async (path: string, value: any, isUpdate: boolean) => {
    const now = Date.now();
    const tree = load();
    const res = rules.tryWrite(tree, writesFor(path, resolveServerValues(value, now), isUpdate), ruleAuth(), now);
    if (!res.ok) throw new Error(res.reason);
    save(res.newTree);
  };

  window.addEventListener('pagehide', () => {
    for (const p of disconnect) { try { const r = rules.tryWrite(load(), writesFor(p, null, false), ruleAuth(), Date.now()); if (r.ok) save(r.newTree); } catch { /* ignore */ } }
  });

  return {
    kind: 'local',
    user: () => user,
    onUser(cb) { userCbs.add(cb); queueMicrotask(() => cb(user)); return () => userCbs.delete(cb); },
    async signInAnon() {
      const uid = 'p_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      setUser({ uid, isTeacher: false, provider: 'anonymous' });
      return user!;
    },
    async signInTeacher(email, password) {
      if (!email.includes('@') || password.length < 4) throw new Error('Use any email address and a password of 4+ characters.');
      let h = 0;
      for (const ch of email.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const uid = 't_' + h.toString(36);
      // Demo: put the teacher on the allow-list directly (in real Firebase you do this in the console).
      const tree = load();
      if (getAt(tree, ['teacherAllowlist', uid]) !== true) save({ ...(tree ?? {}), teacherAllowlist: { ...(tree?.teacherAllowlist ?? {}), [uid]: true } });
      setUser({ uid, isTeacher: true, email, provider: 'password' });
      return user!;
    },
    async signOut() { setUser(null); },
    listen(path, cb, onError) {
      const id = ++sid;
      subs.set(id, { path, cb, err: onError });
      queueMicrotask(() => {
        const s = subs.get(id);
        if (!s) return;
        const tree = load();
        if (!rules.canRead(tree, path, ruleAuth())) { subs.delete(id); onError?.(new Error('PERMISSION_DENIED')); return; }
        s.last = JSON.stringify(fbVal(getAt(tree, split(path))));
        cb(JSON.parse(s.last));
      });
      return () => { subs.delete(id); };
    },
    async get(path) {
      const tree = load();
      if (!rules.canRead(tree, path, ruleAuth())) throw new Error('PERMISSION_DENIED');
      return fbVal(getAt(tree, split(path)));
    },
    set: (path, val) => write(path, val, false),
    update: (path, val) => write(path, val, true),
    remove: (path) => write(path, null, false),
    async onDisconnectRemove(path) { disconnect.add(path); },
    onConnected(cb) { queueMicrotask(() => cb(true)); return () => undefined; },
    serverNow: () => Date.now(),
    TS: { '.sv': 'timestamp' },
  };
}

/** Clears the demo database (all rooms, banks and players in this browser). */
export function resetDemo() {
  memory.tree = null;
  try { LS.removeItem(KEY); for (const k of ['sq-demo-auth-host', 'sq-last-room']) LS.removeItem(k); SS.removeItem('sq-demo-auth-player'); } catch { /* ignore */ }
  try { location.reload(); } catch { /* ignore */ }
}

/** Write as another (anonymous) user — used only by the simulated demo students. Rules still apply. */
export function demoWriteAs(uid: string, path: string, value: any, isUpdate = false) {
  const now = Date.now();
  const res = rules.tryWrite(load(), writesFor(path, resolveServerValues(value, now), isUpdate), { uid, provider: 'anonymous' }, now);
  if (res.ok) save(res.newTree);
  return res.ok as boolean;
}
