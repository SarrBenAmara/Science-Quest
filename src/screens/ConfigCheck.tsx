import type { ReactNode } from 'react';
import { BACKEND_KIND } from '../backend';
import { firebaseConfig } from '../backend/firebaseBackend';
import { Logo } from '../components/Brand';

/** Friendly message instead of a blank page when Firebase settings are missing. */
export function ConfigCheck({ children }: { children: ReactNode }) {
  if (BACKEND_KIND === 'firebase') {
    try { firebaseConfig(); } catch (e) {
      return (
        <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
          <Logo width={320} />
          <p className="game-title text-2xl">Almost ready!</p>
          <p className="font-bold text-white/80">{(e as Error).message}</p>
        </div>
      );
    }
  }
  return <>{children}</>;
}
