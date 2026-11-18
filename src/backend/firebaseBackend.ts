import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut as fbSignOut,
  browserLocalPersistence, setPersistence, type User,
} from 'firebase/auth';
import {
  getDatabase, ref, onValue, get, set, update, remove, onDisconnect, serverTimestamp,
} from 'firebase/database';
import type { AppUser, Backend } from './types';

/** Firebase web config comes from environment variables — never hard-coded. */
export function firebaseConfig() {
  const env = import.meta.env;
  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Firebase is not configured (missing ${missing.join(', ')}). See README → "Connect Firebase".`);
  return cfg;
}

const toUser = (u: User | null): AppUser | null =>
  u ? { uid: u.uid, isTeacher: !u.isAnonymous, email: u.email ?? undefined } : null;

/**
 * role "host" and role "player" use separate Firebase app instances, so a teacher who
 * tests the student view on the same laptop is not signed out of the Teacher Panel.
 */
export function createFirebaseBackend(role: 'host' | 'player'): Backend {
  const name = role === 'host' ? '[DEFAULT]' : 'player';
  const app: FirebaseApp = getApps().find((a) => a.name === name) ?? initializeApp(firebaseConfig(), name === '[DEFAULT]' ? undefined : name);
  const auth = getAuth(app);
  const db = getDatabase(app);
  const ready = setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = Number(s.val()) || 0; });

  return {
    kind: 'firebase',
    user: () => toUser(auth.currentUser),
    onUser: (cb) => onAuthStateChanged(auth, (u) => cb(toUser(u))),
    async signInAnon() { await ready; const c = await signInAnonymously(auth); return toUser(c.user)!; },
    async signInTeacher(email, password) {
      await ready;
      const c = await signInWithEmailAndPassword(auth, email, password);
      return toUser(c.user)!;
    },
    signOut: () => fbSignOut(auth),
    listen(path, cb, onError) {
      return onValue(ref(db, path), (s) => cb(s.val()), (e) => onError?.(e));
    },
    get: async (path) => (await get(ref(db, path))).val(),
    set: (path, val) => set(ref(db, path), val),
    update: (path, val) => update(ref(db, path), val),
    remove: (path) => remove(ref(db, path)),
    onDisconnectRemove: (path) => onDisconnect(ref(db, path)).remove(),
    onConnected(cb) { return onValue(ref(db, '.info/connected'), (s) => cb(s.val() === true)); },
    serverNow: () => Date.now() + offset,
    TS: serverTimestamp(),
  };
}
