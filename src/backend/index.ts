import type { Backend } from './types';
import { createFirebaseBackend } from './firebaseBackend';
import { createLocalBackend } from './localBackend';
import { createDemoBackend } from './demoBackend';

export type { Backend, AppUser } from './types';

const instances: Partial<Record<'host' | 'player', Backend>> = {};

const env = import.meta.env.VITE_BACKEND;
export const BACKEND_KIND: 'firebase' | 'local' | 'demo' = env === 'local' ? 'local' : env === 'demo' ? 'demo' : 'firebase';
export const IS_DEMO = BACKEND_KIND === 'demo';

export function getBackend(role: 'host' | 'player'): Backend {
  return (instances[role] ??= BACKEND_KIND === 'local' ? createLocalBackend(role) : BACKEND_KIND === 'demo' ? createDemoBackend(role) : createFirebaseBackend(role));
}
