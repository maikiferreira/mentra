import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('setup da API', () => {
  it('expõe o endpoint básico de saúde', async () => {
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta.');

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
