import Stripe from 'stripe';
import {
  constructBillingEvent,
  toBillingSubscription,
  type BillingGateway,
} from './stripe-gateway.js';

export const FAKE_WEBHOOK_SECRET = 'whsec_fake_mente_ativa';

/**
 * Gateway em memória para testes. Usa a mesma verificação de assinatura e os mesmos
 * mapeamentos do gateway real, então os testes enviam eventos no formato do Stripe.
 */
export class FakeBillingGateway implements BillingGateway {
  readonly subscriptions = new Map<string, Stripe.Subscription>();
  readonly customers: Array<{ id: string; email: string | null; name: string; username: string }> =
    [];
  readonly checkoutSessions: Array<{ customerId: string; priceId: string; username: string }> = [];
  readonly portalSessions: Array<{ customerId: string; returnUrl: string }> = [];

  reset() {
    this.subscriptions.clear();
    this.customers.length = 0;
    this.checkoutSessions.length = 0;
    this.portalSessions.length = 0;
  }

  async createCustomer(input: { email: string | null; name: string; username: string }) {
    const customer = { id: `cus_${this.customers.length + 1}`, ...input };
    this.customers.push(customer);
    return { id: customer.id };
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    username: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    this.checkoutSessions.push(input);
    return { url: `https://checkout.stripe.test/c/${this.checkoutSessions.length}` };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    this.portalSessions.push(input);
    return { url: `https://billing.stripe.test/p/${this.portalSessions.length}` };
  }

  constructEvent(payload: Buffer, signature: string | undefined) {
    return constructBillingEvent(payload, signature, FAKE_WEBHOOK_SECRET);
  }

  async retrieveSubscription(id: string) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) throw new Error(`Assinatura ${id} não existe no gateway fake.`);
    return toBillingSubscription(subscription);
  }

  /** Assina um payload como o Stripe faria, para enviar ao endpoint do webhook. */
  static sign(payload: string) {
    return Stripe.webhooks.generateTestHeaderString({ payload, secret: FAKE_WEBHOOK_SECRET });
  }
}
