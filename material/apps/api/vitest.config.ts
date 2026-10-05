import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    // A replica set takes a moment to come up in mongodb-memory-server.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ['src/__tests__/setup.ts'],
    alias: {
      // Mongo is real (in memory, as a replica set) because the transactions
      // and indexes are what these tests are about. Redis is not: it only
      // holds rate-limit counters, idempotency keys and the import preview
      // token, so an in-process stand-in keeps the suite self-contained.
      ioredis: fileURLToPath(new URL('./src/__tests__/ioredis-stub.ts', import.meta.url)),
    },
  },
});
