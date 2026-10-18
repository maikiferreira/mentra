import { defineConfig } from 'vitest/config';

// `source`: o pacote @mente-ativa/shared é lido direto do TypeScript (sem build).
const conditions = ['source', 'module', 'node', 'development|production'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/test-results/**'],
    restoreMocks: true,
    clearMocks: true,
  },
});
