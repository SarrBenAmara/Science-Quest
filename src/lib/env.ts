// Helpers so the app also works inside sandboxed previews (no URL origin, no storage, no dialogs).

/** HashRouter needs a real page address; sandboxed previews (about:srcdoc) don't have one. */
export function hasRealAddress(): boolean {
  try {
    const base = window.location.origin !== 'null' ? window.location.origin : window.location.href;
    new URL('/', base);
    return true;
  } catch {
    return false;
  }
}

const mem = new Map<string, string>();
function memStore(): Storage {
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i) => Array.from(mem.keys())[i] ?? null,
    get length() { return mem.size; },
  };
}

/** localStorage / sessionStorage, or an in-memory stand-in when the browser blocks them. */
export function safeStorage(kind: 'local' | 'session'): Storage {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    const k = '__sq_test__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return memStore();
  }
}

/** confirm() that still works where dialogs are blocked (a blocked dialog returns instantly → proceed). */
export function confirmAction(message: string): boolean {
  const t = performance.now();
  let ok = false;
  try { ok = window.confirm(message); } catch { return true; }
  return ok || performance.now() - t < 30;
}

/** prompt() with a fallback value where dialogs are blocked. */
export function askText(message: string, fallback: string): string | null {
  const t = performance.now();
  let v: string | null = null;
  try { v = window.prompt(message, fallback); } catch { return fallback; }
  if (v === null && performance.now() - t < 30) return fallback;
  return v;
}
