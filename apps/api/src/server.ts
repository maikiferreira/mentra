import 'dotenv/config';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './modules/shared/infra/database.js';

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);

if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET ?? '').length < 32) {
  console.error('JWT_SECRET must be set (at least 32 characters) in production.');
  process.exit(1);
}

const app = createApp();

try {
  await connectDatabase();
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Mente Ativa API listening on port ${port}`);
  });
  const shutdown = () =>
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error('Failed to connect to MongoDB:', error);
  process.exitCode = 1;
}
