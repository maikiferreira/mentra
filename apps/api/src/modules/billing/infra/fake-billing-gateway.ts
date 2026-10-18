import { createHmac } from 'node:crypto';
import { EduzzBillingGateway } from './eduzz-gateway.js';

export const FAKE_WEBHOOK_SECRET = 'eduzz_fake_mente_ativa';
export const FAKE_PRODUCTS = { monthly: 'P-MENSAL', annual: 'P-ANUAL' } as const;

/**
 * Gateway para testes: é o gateway Eduzz real com configuração fixa, então os testes
 * enviam eventos no formato da Eduzz e passam pela mesma verificação de assinatura.
 */
export class FakeBillingGateway extends EduzzBillingGateway {
  constructor() {
    super({
      webhookSecret: FAKE_WEBHOOK_SECRET,
      checkoutUrls: {
        monthly: 'https://chk.eduzz.test/MENSAL',
        annual: 'https://chk.eduzz.test/ANUAL',
      },
      productIds: { ...FAKE_PRODUCTS },
      customerAreaUrl: 'https://orbita.eduzz.test',
    });
  }

  /** Assina um payload como a Eduzz faria (`x-signature`, HMAC-SHA256 em hex). */
  static sign(payload: string) {
    return createHmac('sha256', FAKE_WEBHOOK_SECRET).update(payload).digest('hex');
  }
}
