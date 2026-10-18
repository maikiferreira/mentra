import { defaultClientConditions, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // `source`: o pacote @mente-ativa/shared é lido direto do TypeScript (sem build).
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
});
