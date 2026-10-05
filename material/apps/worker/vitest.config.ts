import { defineConfig } from 'vitest/config';

// Its own config, so the test runner does not climb to the application's
// vite.config.ts (material/ sits inside the application's repository).
export default defineConfig({
  test: { include: ['src/**/__tests__/**/*.test.ts'], environment: 'node' },
});
