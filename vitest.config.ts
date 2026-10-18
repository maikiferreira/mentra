import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/test-results/**'],
    restoreMocks: true,
    clearMocks: true,
  },
});
