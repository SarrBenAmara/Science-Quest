// Minimal evaluator for Firebase Realtime Database security rules.
// Used by the offline test server and the automated permission tests so the SAME
// database.rules.json is enforced locally. (Production enforcement is done by Firebase.)

/* eslint-disable no-extend-native */
for (const [k, fn] of Object.entries({
  contains(s) { return this.includes(s); },
  beginsWith(s) { return this.startsWith(s); },
  matches(re) { return re.test(this); },
})) if (!String.prototype[k]) Object.defineProperty(String.prototype, k, { value: fn });

const split = (p) => (p || '').split('/').filter(Boolean);

export function getAt(tree, parts) {
  let cur = tree;
  for (const k of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur === undefined ? null : cur;
}

function prune(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  const out = {};
  for (const [k, c] of Object.entries(v)) {
    const p = prune(c);
    if (p !== null) out[k] = p;
  }
  return Object.keys(out).length ? out : null;
}

export function setAt(tree, parts, value) {
  if (!parts.length) return prune(value);
  const root = tree && typeof tree === 'object' ? { ...tree } : {};
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cur[k] = cur[k] && typeof cur[k] === 'object' ? { ...cur[k] } : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return prune(root);
}

class Snap {
  constructor(tree, parts) { this.tree = tree; this.parts = parts; }
  val() { return getAt(this.tree, this.parts); }
  child(p) { return new Snap(this.tree, [...this.parts, ...split(String(p))]); }
  parent() { return new Snap(this.tree, this.parts.slice(0, -1)); }
  exists() { return this.val() !== null; }
  hasChild(p) { return this.child(p).exists(); }
  hasChildren(list) {
    const v = this.val();
    if (!v || typeof v !== 'object') return false;
    return list ? list.every((k) => this.child(k).exists()) : Object.keys(v).length > 0;
  }
  isString() { return typeof this.val() === 'string'; }
  isNumber() { return typeof this.val() === 'number'; }
  isBoolean() { return typeof this.val() === 'boolean'; }
  getPriority() { return null; }
}

const cache = new Map();
function compile(expr, vars) {
  const key = expr + '|' + vars.join(',');
  if (!cache.has(key)) cache.set(key, new Function('auth', 'root', 'data', 'newData', 'now', ...vars, `return (${expr});`));
  return cache.get(key);
}

function evalRule(expr, ctx, vars) {
  if (expr === true || expr === false) return expr;
  try {
    const names = Object.keys(vars);
    return compile(String(expr), names)(ctx.auth, ctx.root, ctx.data, ctx.newData, ctx.now, ...names.map((n) => vars[n])) === true;
  } catch {
    return false; // rule errors deny, like Firebase
  }
}

/** Walk the rules tree along `parts`; yields { node, depth, vars } for root..parts. */
function* walk(rules, parts) {
  let node = rules;
  const vars = {};
  yield { node, depth: 0, vars: { ...vars } };
  for (let i = 0; i < parts.length; i++) {
    if (!node) return;
    const k = parts[i];
    let next = node[k];
    if (!next || typeof next !== 'object' || k.startsWith('.')) {
      const wild = Object.keys(node).find((n) => n.startsWith('$'));
      next = wild ? node[wild] : undefined;
      if (wild) vars[wild] = k;
    }
    node = next;
    if (!node) return;
    yield { node, depth: i + 1, vars: { ...vars } };
  }
}

export class RulesEngine {
  constructor(rulesJson) { this.rules = rulesJson.rules; }

  canRead(tree, path, auth, now = Date.now()) {
    const parts = split(path);
    for (const { node, depth, vars } of walk(this.rules, parts)) {
      if (node['.read'] === undefined) continue;
      const p = parts.slice(0, depth);
      const ctx = { auth, root: new Snap(tree, []), data: new Snap(tree, p), newData: new Snap(tree, p), now };
      if (evalRule(node['.read'], ctx, vars)) return true;
    }
    return false;
  }

  /** writes: [{ parts, value }] applied together (multi-path update). Returns { ok, newTree, reason }. */
  tryWrite(tree, writes, auth, now = Date.now()) {
    let newTree = tree;
    for (const w of writes) newTree = setAt(newTree, w.parts, w.value);
    for (const w of writes) {
      let granted = false;
      for (const { node, depth, vars } of walk(this.rules, w.parts)) {
        if (node['.write'] === undefined) continue;
        const p = w.parts.slice(0, depth);
        const ctx = { auth, root: new Snap(tree, []), data: new Snap(tree, p), newData: new Snap(newTree, p), now };
        if (evalRule(node['.write'], ctx, vars)) { granted = true; break; }
      }
      if (!granted) return { ok: false, reason: `PERMISSION_DENIED: write ${w.parts.join('/')}` };
      // .validate: ancestors + the written node + every new descendant.
      const ancestors = [...walk(this.rules, w.parts)];
      for (const { node, depth, vars } of ancestors) {
        if (!this.#validate(node, w.parts.slice(0, depth), vars, tree, newTree, auth, now)) return { ok: false, reason: `PERMISSION_DENIED: validate ${w.parts.slice(0, depth).join('/')}` };
      }
      const last = ancestors.length === w.parts.length + 1 ? ancestors[ancestors.length - 1] : null;
      if (last && !this.#validateDeep(last.node, w.parts, last.vars, tree, newTree, auth, now)) return { ok: false, reason: `PERMISSION_DENIED: validate under ${w.parts.join('/')}` };
    }
    return { ok: true, newTree };
  }

  #validate(node, p, vars, tree, newTree, auth, now) {
    if (node['.validate'] === undefined) return true;
    if (getAt(newTree, p) === null) return true; // deletes skip validation
    const ctx = { auth, root: new Snap(tree, []), data: new Snap(tree, p), newData: new Snap(newTree, p), now };
    return evalRule(node['.validate'], ctx, vars);
  }

  #validateDeep(node, p, vars, tree, newTree, auth, now) {
    const v = getAt(newTree, p);
    if (!v || typeof v !== 'object') return true;
    for (const k of Object.keys(v)) {
      let child = node[k];
      const cv = { ...vars };
      if (!child || k.startsWith('.')) {
        const wild = Object.keys(node).find((n) => n.startsWith('$'));
        if (!wild) continue;
        child = node[wild];
        cv[wild] = k;
      }
      const cp = [...p, k];
      if (!this.#validate(child, cp, cv, tree, newTree, auth, now)) return false;
      if (!this.#validateDeep(child, cp, cv, tree, newTree, auth, now)) return false;
    }
    return true;
  }
}

export function resolveServerValues(v, now) {
  if (v && typeof v === 'object') {
    if (v['.sv'] === 'timestamp') return now;
    const out = Array.isArray(v) ? [] : {};
    for (const [k, c] of Object.entries(v)) out[k] = resolveServerValues(c, now);
    return out;
  }
  return v;
}

export function writesFor(path, value, isUpdate) {
  const base = split(path);
  if (!isUpdate) return [{ parts: base, value }];
  return Object.entries(value || {}).map(([k, v]) => ({ parts: [...base, ...split(k)], value: v }));
}
