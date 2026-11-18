import type { AppUser, Backend } from './types';

/**
 * Client for the offline test server (devserver/server.mjs). Same behaviour as Firebase
 * for everything the game uses; the server enforces database.rules.json.
 */
export function createLocalBackend(role: 'host' | 'player'): Backend {
  const url = (import.meta.env.VITE_LOCAL_SERVER as string) || `ws://${location.hostname}:8787`;
  // Teacher session survives tabs (projector); each student tab is its own player.
  const store = role === 'host' ? localStorage : sessionStorage;
  const key = `sq-local-auth-${role}`;
  let ws: WebSocket | null = null;
  let user: AppUser | null = null;
  let token: string | null = null;
  let offset = 0;
  let connected = false;
  let rid = 0;
  const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  const subs = new Map<string, { path: string; cb: (v: any) => void; err?: (e: Error) => void }>();
  const disconnectPaths = new Set<string>();
  const userCbs = new Set<(u: AppUser | null) => void>();
  const connCbs = new Set<(c: boolean) => void>();
  let opened: Promise<void>;
  let authRestored: Promise<void> = Promise.resolve();
  let resolveAuth: () => void = () => {};

  try {
    const saved = JSON.parse(store.getItem(key) || 'null');
    if (saved) { token = saved.token; user = saved.user; }
  } catch { /* ignore */ }

  function send(msg: any): Promise<any> {
    return opened.then(() => new Promise((res, rej) => {
      const id = ++rid;
      pending.set(id, { res, rej });
      ws!.send(JSON.stringify({ ...msg, rid: id }));
    }));
  }

  function connect() {
    ws = new WebSocket(url);
    opened = new Promise((resolve) => {
      ws!.onopen = () => resolve();
    });
    authRestored = new Promise((r) => { resolveAuth = r; });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'welcome') {
        offset = m.serverTime - Date.now();
        (token ? send({ t: 'auth', mode: 'resume', token }).then((r) => { if (!r.ok) setUser(null, null); }) : Promise.resolve())
          .then(() => {
            for (const [sid, s] of subs) ws!.send(JSON.stringify({ t: 'sub', sid, path: s.path }));
            for (const p of disconnectPaths) send({ t: 'onDisc', path: p });
            connected = true;
            resolveAuth();
            connCbs.forEach((cb) => cb(true));
          });
      } else if (m.t === 'res') {
        const p = pending.get(m.rid);
        pending.delete(m.rid);
        p?.res(m);
      } else if (m.t === 'val') {
        subs.get(m.sid)?.cb(m.val);
      } else if (m.t === 'cancel') {
        const s = subs.get(m.sid);
        subs.delete(m.sid);
        s?.err?.(new Error(m.err));
      }
    };
    ws.onclose = () => {
      connected = false;
      connCbs.forEach((cb) => cb(false));
      setTimeout(connect, 1000);
    };
  }
  connect();

  function setUser(u: AppUser | null, t: string | null) {
    user = u; token = t;
    if (u && t) store.setItem(key, JSON.stringify({ user: u, token: t })); else store.removeItem(key);
    userCbs.forEach((cb) => cb(u));
  }

  const ok = (r: any) => { if (!r.ok) throw new Error(r.err || 'request failed'); return r; };
  const mapUser = (u: any): AppUser => ({ uid: u.uid, isTeacher: u.provider !== 'anonymous', email: u.email });

  return {
    kind: 'local',
    user: () => user,
    onUser(cb) { userCbs.add(cb); authRestored.then(() => cb(user)); return () => userCbs.delete(cb); },
    async signInAnon() {
      const r = ok(await send({ t: 'auth', mode: 'anon' }));
      setUser(mapUser(r.user), r.token);
      return user!;
    },
    async signInTeacher(email, password) {
      const r = await send({ t: 'auth', mode: 'password', email, password });
      if (!r.ok) throw new Error('Wrong email or password.');
      setUser(mapUser(r.user), r.token);
      return user!;
    },
    async signOut() { await send({ t: 'auth', mode: 'signout', token }); setUser(null, null); },
    listen(path, cb, onError) {
      const sid = `${path}#${Math.random().toString(36).slice(2)}`;
      subs.set(sid, { path, cb, err: onError });
      if (connected) ws!.send(JSON.stringify({ t: 'sub', sid, path }));
      return () => { subs.delete(sid); if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'unsub', sid })); };
    },
    get: async (path) => { await authRestored; return ok(await send({ t: 'get', path })).val; },
    set: async (path, val) => { await authRestored; ok(await send({ t: 'set', path, val })); },
    update: async (path, val) => { await authRestored; ok(await send({ t: 'update', path, val })); },
    remove: async (path) => { await authRestored; ok(await send({ t: 'set', path, val: null })); },
    async onDisconnectRemove(path) { disconnectPaths.add(path); ok(await send({ t: 'onDisc', path })); },
    onConnected(cb) { connCbs.add(cb); cb(connected); return () => connCbs.delete(cb); },
    serverNow: () => Date.now() + offset,
    TS: { '.sv': 'timestamp' },
  };
}
