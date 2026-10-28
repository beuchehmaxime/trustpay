import { defineConfig } from 'vitest/config';

/**
 * Backend unit-test config. Deliberately DB-free: these tests only exercise
 * pure, dependency-light helpers, so they run without Postgres or Redis and
 * stay fast/hermetic in CI. `setupFiles` seeds safe placeholder secrets before
 * any source module (which reads `config` at import time) is loaded.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
