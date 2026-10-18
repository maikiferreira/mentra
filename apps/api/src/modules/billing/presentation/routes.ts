import { Router, type RequestHandler } from 'express';
import type { BillingService } from '../application/billing-service.js';
import { InvalidWebhookSignature } from '../infra/stripe-gateway.js';
import {
  getRequestAccess,
  getRequestUser,
  requireAuthAllowUnpaid,
} from '../../shared/presentation/http.js';

export function createBillingRouter(billing: BillingService) {
  const router = Router();
  router.get('/plans', (_request, response) => response.json(billing.plans()));
  router.get('/me', requireAuthAllowUnpaid, async (request, response) =>
    response.json(
      await billing.getMine(getRequestUser(request).username, getRequestAccess(request)),
    ),
  );
  router.post('/checkout', requireAuthAllowUnpaid, async (request, response) =>
    response.json(
      await billing.startCheckout(
        getRequestUser(request).username,
        (request.body as { plan?: unknown } | undefined)?.plan,
      ),
    ),
  );
  router.post('/portal', requireAuthAllowUnpaid, async (request, response) =>
    response.json(await billing.openPortal(getRequestUser(request).username)),
  );
  return router;
}

/** Recebe o corpo bruto (express.raw), exigido para validar a assinatura do Stripe. */
export function createWebhookHandler(billing: BillingService): RequestHandler {
  return async (request, response) => {
    let event;
    try {
      event = billing.parseWebhook(request.body as Buffer, request.header('stripe-signature'));
    } catch (error) {
      if (!(error instanceof InvalidWebhookSignature)) throw error;
      response
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Assinatura do webhook inválida.' } });
      return;
    }
    const result = await billing.handleEvent(event);
    response.json({ received: true, duplicate: result.duplicate });
  };
}
