import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/rules.emulator.test.ts'], testTimeout: 20000 } });
