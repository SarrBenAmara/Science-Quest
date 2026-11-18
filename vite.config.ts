import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/science-quest/").
// `npm run build:demo` makes ONE self-contained HTML file that runs without Firebase.
export default defineConfig(({ mode }) => ({
  base: mode === 'demo' ? './' : process.env.BASE_PATH || '/',
  plugins: mode === 'demo' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'demo' ? { outDir: 'dist-demo', assetsInlineLimit: 100_000_000 } : {},
  // One copy of Firebase's core: two copies make "Service database is not available".
  resolve: { dedupe: ['@firebase/app', '@firebase/component', '@firebase/util', '@firebase/logger'] },
  server: { host: true, port: 5173 },
}));
