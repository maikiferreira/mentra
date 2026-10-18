import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pinoHttpImport from 'pino-http';
import {
  MEEM_DOMAINS,
  PATIENT_GROUPS,
  LIMITATIONS,
  EMERGENCY_RELATIONSHIPS,
  TRIAL_PROFILES,
} from '@mente-ativa/shared';
import { authRouter, adminRouter } from './modules/identity/presentation/routes.js';
import { patientRouter, routineRouter } from './modules/patients/presentation/routes.js';
import { dashboardRouter } from './modules/dashboard/presentation/routes.js';
import { errorHandler } from './modules/shared/presentation/http.js';
import { logger } from './modules/shared/infra/logger.js';
import {
  BillingService,
  billingConfigFromEnv,
  type BillingConfig,
} from './modules/billing/application/billing-service.js';
import {
  createBillingGatewayFromEnv,
  type BillingGateway,
} from './modules/billing/infra/stripe-gateway.js';
import {
  createBillingRouter,
  createWebhookHandler,
} from './modules/billing/presentation/routes.js';

export interface AppOptions {
  /** `null` desliga o Stripe (rotas de billing respondem 503); omitido, lê do ambiente. */
  billingGateway?: BillingGateway | null;
  billingConfig?: BillingConfig;
}

const pinoHttp = pinoHttpImport as unknown as (options: {
  logger: typeof logger;
}) => express.RequestHandler;
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente novamente mais tarde.' },
  },
});

export function createApp(options: AppOptions = {}) {
  const billing = new BillingService(
    options.billingGateway === undefined ? createBillingGatewayFromEnv() : options.billingGateway,
    options.billingConfig ?? billingConfigFromEnv(),
  );
  const app = express();
  app.disable('x-powered-by');
  // Render (e outros PaaS) ficam atrás de um proxy reverso; necessário para o rate limit por IP.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use((request, response, next) => {
    const origin = request.header('origin');
    const allowedOrigins = (
      process.env.WEB_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173'
    )
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (origin && allowedOrigins.includes(origin)) {
      response.header('Access-Control-Allow-Origin', origin);
      response.header('Vary', 'Origin');
      response.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (request.method === 'OPTIONS') return response.status(204).end();
    return next();
  });
  // O webhook precisa do corpo bruto para validar a assinatura: fica antes do express.json.
  app.post(
    '/api/v1/billing/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    createWebhookHandler(billing),
  );
  app.use(express.json({ limit: '1mb' }));
  app.get(['/health', '/api/v1/health'], (_request, response) =>
    response.status(200).json({ status: 'ok' }),
  );

  const api = express.Router();
  api.use('/auth', authRateLimit);
  api.use('/auth', authRouter);
  api.use('/patients', patientRouter);
  api.use('/routines', routineRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/billing', createBillingRouter(billing));
  api.use(adminRouter);
  api.get('/meta/options', (_request, response) =>
    response.json({
      groups: PATIENT_GROUPS,
      limitations: LIMITATIONS,
      relationships: EMERGENCY_RELATIONSHIPS,
      trialProfiles: TRIAL_PROFILES,
      domains: MEEM_DOMAINS,
    }),
  );
  app.use('/api/v1', api);
  app.use(errorHandler);
  return app;
}
