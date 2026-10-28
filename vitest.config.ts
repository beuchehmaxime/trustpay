import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // TrustPay's own tests only. `bizik/` is a vendored project with its own
    // toolchain - its suite needs a generated Prisma client and a database
    // URL, and running it from here fails for reasons that have nothing to do
    // with this service. It is tested where it lives, by its own runner.
    include: ['src/**/*.test.ts'],
    exclude: ['bizik/**', 'node_modules/**', 'dist/**'],
  },
});
