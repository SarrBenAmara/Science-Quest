// Offline test server — a small stand-in for Firebase Realtime Database + Auth.
// It enforces the real database.rules.json, so the whole game can be run and tested
// on a laptop without internet. Start with:  npm run local-server
// Then run the app with VITE_BACKEND=local (npm run dev:local).
import { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { RulesEngine, resolveServerValues, writesFor, getAt } from './rules.mjs';

const PORT = Number(process.env.SQ_LOCAL_PORT || 8787);
const rules = new RulesEngine(JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8')));
const TEACHERS = (process.env.SQ_TEACHERS || 'teacher@sciencequest.local:science123,teacher2@sciencequest.local:science123')
  .split(',').map((s) => { const [email, password] = s.split(':'); return { email, password }; });

let tree = null;
const tokens = new Map(); // token → user
const subs = new Set(); // { ws, sid, parts, last }

const uidFor = (email) => 't_' + createHash('sha256').update(email).digest('hex').slice(0, 20);
const split = (p) => (p || '').split('/').filter(Boolean);
// Test helper: SQ_UNLISTED=email@x:pw adds a teacher login that is NOT on the allow-list.
if (process.env.SQ_UNLISTED) { const [email, password] = process.env.SQ_UNLISTED.split(':'); TEACHERS.push({ email, password, unlisted: true }); }
tree = { teacherAllowlist: Object.fromEntries(TEACHERS.filter((t) => !t.unlisted).map((t) => [uidFor(t.email), true])) };

/** Firebase returns objects with numeric keys as arrays. */
function fbVal(v) {
  if (v === null || typeof v !== 'object') return v ?? null;
  const keys = Object.keys(v);
  const out = {};
  for (const k of keys) out[k] = fbVal(v[k]);
  if (keys.length && keys.every((k) => /^(0|[1-9]\d*)$/.test(k))) {
    const max = Math.max(...keys.map(Number));
    if (max < keys.length * 2) { const arr = []; for (const k of keys) arr[Number(k)] = out[k]; return arr; }
  }
  return out;
}

function notify() {
  for (const s of subs) {
    if (s.ws.readyState !== 1) { subs.delete(s); continue; }
    if (!rules.canRead(tree, s.parts.join('/'), s.ws.user)) { s.ws.send(JSON.stringify({ t: 'cancel', sid: s.sid, err: 'PERMISSION_DENIED' })); subs.delete(s); continue; }
    const json = JSON.stringify(fbVal(getAt(tree, s.parts)));
    if (json !== s.last) { s.last = json; s.ws.send(`{"t":"val","sid":${JSON.stringify(s.sid)},"val":${json}}`); }
  }
}

function write(ws, path, value, isUpdate) {
  const now = Date.now();
  const resolved = resolveServerValues(value, now);
  const res = rules.tryWrite(tree, writesFor(path, resolved, isUpdate), ws.user, now);
  if (!res.ok) return res.reason;
  tree = res.newTree;
  notify();
  return null;
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
wss.on('connection', (ws) => {
  ws.user = null;
  ws.onDisc = [];
  ws.send(JSON.stringify({ t: 'welcome', serverTime: Date.now() }));
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const reply = (o) => ws.send(JSON.stringify({ t: 'res', rid: m.rid, ...o }));
    switch (m.t) {
      case 'auth': {
        if (m.mode === 'resume' && tokens.has(m.token)) { ws.user = tokens.get(m.token); return reply({ ok: true, user: ws.user, token: m.token }); }
        if (m.mode === 'resume') return reply({ ok: false, err: 'session expired' });
        if (m.mode === 'anon') {
          const token = randomBytes(16).toString('hex');
          const user = { uid: 'p_' + randomBytes(10).toString('hex'), provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } };
          tokens.set(token, user); ws.user = user;
          return reply({ ok: true, user, token });
        }
        if (m.mode === 'password') {
          const t = TEACHERS.find((x) => x.email.toLowerCase() === String(m.email).toLowerCase() && x.password === m.password);
          if (!t) return reply({ ok: false, err: 'auth/invalid-credential' });
          const token = randomBytes(16).toString('hex');
          const user = { uid: uidFor(t.email), provider: 'password', email: t.email, token: { email: t.email, firebase: { sign_in_provider: 'password' } } };
          tokens.set(token, user); ws.user = user;
          return reply({ ok: true, user, token });
        }
        if (m.mode === 'signout') { ws.user = null; tokens.delete(m.token); return reply({ ok: true }); }
        return reply({ ok: false, err: 'bad auth' });
      }
      case 'get': {
        if (!rules.canRead(tree, m.path, ws.user)) return reply({ ok: false, err: 'PERMISSION_DENIED' });
        return reply({ ok: true, val: fbVal(getAt(tree, split(m.path))) });
      }
      case 'set': case 'update': {
        const err = write(ws, m.path, m.val, m.t === 'update');
        return reply(err ? { ok: false, err } : { ok: true });
      }
      case 'onDisc': {
        // Like Firebase: permission is checked when the operation is registered.
        const check = rules.tryWrite(tree, writesFor(m.path, null, false), ws.user, Date.now());
        if (!check.ok) return reply({ ok: false, err: check.reason });
        ws.onDisc.push({ path: m.path, user: ws.user });
        return reply({ ok: true });
      }
      case 'sub': {
        if (!rules.canRead(tree, m.path, ws.user)) return ws.send(JSON.stringify({ t: 'cancel', sid: m.sid, err: 'PERMISSION_DENIED' }));
        const s = { ws, sid: m.sid, parts: split(m.path), last: undefined };
        subs.add(s);
        s.last = JSON.stringify(fbVal(getAt(tree, s.parts)));
        ws.send(`{"t":"val","sid":${JSON.stringify(m.sid)},"val":${s.last}}`);
        return;
      }
      case 'unsub': {
        for (const s of subs) if (s.ws === ws && s.sid === m.sid) subs.delete(s);
        return;
      }
      case 'dump': // test helper: whole database (only when explicitly enabled)
        if (process.env.SQ_ALLOW_DUMP) return reply({ ok: true, val: fbVal(tree) });
        return reply({ ok: false, err: 'disabled' });
    }
  });
  ws.on('close', () => {
    for (const s of subs) if (s.ws === ws) subs.delete(s);
    for (const d of ws.onDisc) {
      const res = rules.tryWrite(tree, writesFor(d.path, null, false), d.user, Date.now());
      if (res.ok) tree = res.newTree;
    }
    if (ws.onDisc.length) notify();
  });
});
console.log(`Science Quest offline server on ws://0.0.0.0:${PORT}`);
console.log(`Teacher logins: ${TEACHERS.map((t) => `${t.email} / ${t.password}`).join(', ')}`);
