import Stripe from 'stripe';
import type { SubscriptionStatus } from '@mente-ativa/shared';

/** Versão da API fixada: os mapeamentos abaixo seguem o formato dela. */
export const STRIPE_API_VERSION = '2026-09-30.endive';

/** Assinatura do Stripe já traduzida para o vocabulário da aplicação. */
export interface BillingSubscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  priceId: string | null;
  username: string | null;
  startedAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}
export interface BillingInvoice {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  priceId: string | null;
  paidAt: Date | null;
}
export type BillingEvent =
  | {
      id: string;
      type: 'checkout.session.completed';
      username: string | null;
      customerId: string | null;
      subscriptionId: string | null;
    }
  | { id: string; type: 'invoice.paid' | 'invoice.payment_failed'; invoice: BillingInvoice }
  | {
      id: string;
      type: 'customer.subscription.updated' | 'customer.subscription.deleted';
      subscriptionId: string;
    }
  | { id: string; type: 'ignored'; stripeType: string };

export interface BillingGateway {
  createCustomer(input: { email: string | null; name: string; username: string }): Promise<{
    id: string;
  }>;
  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    username: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Valida a assinatura do webhook; lança `InvalidWebhookSignature` se não conferir. */
  constructEvent(payload: Buffer, signature: string | undefined): BillingEvent;
  retrieveSubscription(id: string): Promise<BillingSubscription>;
}

export class InvalidWebhookSignature extends Error {
  constructor() {
    super('Assinatura do webhook inválida.');
    this.name = 'InvalidWebhookSignature';
  }
}

const idOf = (value: string | { id: string } | null | undefined) =>
  value == null ? null : typeof value === 'string' ? value : value.id;
const dateOf = (seconds: number | null | undefined) =>
  seconds == null ? null : new Date(seconds * 1000);

export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'incomplete':
      return 'incomplete';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      // canceled, incomplete_expired e paused: a assinatura não dá mais acesso.
      return 'canceled';
  }
}

export function toBillingSubscription(subscription: Stripe.Subscription): BillingSubscription {
  const item = subscription.items.data[0];
  // Desde 2025 o período fica no item da assinatura, não mais na assinatura.
  const currentPeriodEnd = dateOf(item?.current_period_end);
  return {
    id: subscription.id,
    customerId: idOf(subscription.customer) ?? '',
    status: mapStripeStatus(subscription.status),
    priceId: item?.price.id ?? null,
    username: subscription.metadata.username ?? null,
    startedAt: dateOf(subscription.start_date),
    currentPeriodEnd,
    // O Portal pode agendar o fim com cancel_at em vez de cancel_at_period_end.
    cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at != null,
    canceledAt: dateOf(subscription.canceled_at),
  };
}

export function toBillingInvoice(invoice: Stripe.Invoice): BillingInvoice {
  const line = invoice.lines.data[0];
  const price = line?.pricing?.price_details?.price;
  return {
    id: invoice.id,
    customerId: idOf(invoice.customer),
    subscriptionId:
      idOf(invoice.parent?.subscription_details?.subscription) ?? idOf(line?.subscription),
    amountPaidCents: invoice.amount_paid,
    amountDueCents: invoice.amount_due,
    currency: invoice.currency,
    priceId: idOf(price),
    paidAt: dateOf(invoice.status_transitions.paid_at),
  };
}

export function toBillingEvent(event: Stripe.Event): BillingEvent {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      return {
        id: event.id,
        type: event.type,
        username: session.client_reference_id ?? session.metadata?.username ?? null,
        customerId: idOf(session.customer),
        subscriptionId: idOf(session.subscription),
      };
    }
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return { id: event.id, type: event.type, invoice: toBillingInvoice(event.data.object) };
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return { id: event.id, type: event.type, subscriptionId: event.data.object.id };
    default:
      return { id: event.id, type: 'ignored', stripeType: event.type };
  }
}

/** Verifica a assinatura com o segredo do endpoint e traduz o evento. */
export function constructBillingEvent(
  payload: Buffer,
  signature: string | undefined,
  webhookSecret: string,
): BillingEvent {
  let event: Stripe.Event;
  try {
    if (!signature || !Buffer.isBuffer(payload)) throw new Error('Sem assinatura');
    event = Stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    throw new InvalidWebhookSignature();
  }
  return toBillingEvent(event);
}

export class StripeBillingGateway implements BillingGateway {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  }

  async createCustomer(input: { email: string | null; name: string; username: string }) {
    const customer = await this.stripe.customers.create({
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      metadata: { username: input.username },
    });
    return { id: customer.id };
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    username: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.username,
      line_items: [{ price: input.priceId, quantity: 1 }],
      subscription_data: { metadata: { username: input.username } },
      // RN-PAY-02: só cartão de crédito recorrente. Substitui o antigo payment_method_types.
      allowed_payment_method_types: ['card'],
      locale: 'pt-BR',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe não retornou a URL do checkout.');
    return { url: session.url };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }

  constructEvent(payload: Buffer, signature: string | undefined) {
    return constructBillingEvent(payload, signature, this.webhookSecret);
  }

  async retrieveSubscription(id: string) {
    return toBillingSubscription(await this.stripe.subscriptions.retrieve(id));
  }
}

/** Gateway do ambiente: `null` quando o Stripe não está configurado (rotas respondem 503). */
export function createBillingGatewayFromEnv(env = process.env): BillingGateway | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new StripeBillingGateway(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET ?? '');
}
