export interface AppUser { uid: string; isTeacher: boolean; email?: string }

/**
 * Everything the game needs from the backend. Implemented by Firebase (production)
 * and by the offline test server (VITE_BACKEND=local).
 */
export interface Backend {
  kind: 'firebase' | 'local';
  // Auth
  user(): AppUser | null;
  onUser(cb: (u: AppUser | null) => void): () => void;
  signInAnon(): Promise<AppUser>;
  signInTeacher(email: string, password: string): Promise<AppUser>;
  signOut(): Promise<void>;
  // Database
  listen(path: string, cb: (val: any) => void, onError?: (e: Error) => void): () => void;
  get(path: string): Promise<any>;
  set(path: string, val: any): Promise<void>;
  update(path: string, val: Record<string, any>): Promise<void>;
  remove(path: string): Promise<void>;
  onDisconnectRemove(path: string): Promise<void>;
  onConnected(cb: (connected: boolean) => void): () => void;
  /** Current time on the server's clock (estimated). */
  serverNow(): number;
  /** Placeholder replaced by the server's timestamp. */
  TS: object;
}
