import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PlanId, SubscriptionStatus } from '@mente-ativa/shared';
import {
  InvalidWebhookSignature,
  type BillingContract,
  type BillingEvent,
  type BillingGateway,
  type BillingInvoice,
  type BillingMatch,
} from './billing-gateway.js';

/**
 * Parâmetros do link de checkout da Eduzz. `trk` vira `tracker.code1` nos webhooks de fatura
 * e `email` pré-preenche o comprador (confirmar na Fase 0 de docs/specs/pagamentos-eduzz.md).
 */
export const TRACKER_PARAM = 'trk';
export const EMAIL_PARAM = 'email';

export interface EduzzConfig {
  webhookSecret: string;
  checkoutUrls: Record<PlanId, string | undefined>;
  productIds: Record<PlanId, string | undefined>;
  customerAreaUrl: string | undefined;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  value !== null && typeof value === 'object' ? (value as Json) : {};
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : null;
const date = (value: unknown): Date | null => {
  const text = str(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const money = (value: unknown) => {
  const amount = obj(value);
  const numeric = typeof amount.value === 'number' ? amount.value : Number(amount.value);
  return {
    cents: Number.isFinite(numeric) ? Math.round(numeric * 100) : 0,
    currency: (str(amount.currency) ?? 'BRL').toLowerCase(),
  };
};

/** Status do contrato Eduzz → status da assinatura na aplicação. */
export function mapEduzzContractStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'upToDate':
    case 'free':
      return 'active';
    case 'trial':
      return 'trialing';
    case 'awaitingPayment':
      // Primeira fatura ainda não paga (Pix/boleto); depois da ativação vira past_due no service.
      return 'incomplete';
    case 'late':
    case 'defaulter':
    case 'suspended':
      return 'past_due';
    default:
      // canceled, finished e status desconhecidos: a assinatura não renova mais.
      return 'canceled';
  }
}

function toInvoice(data: Json): BillingInvoice {
  const items = Array.isArray(data.items) ? data.items.map(obj) : [];
  const paid = money(data.paid);
  const tracker = obj(data.tracker);
  return {
    id: str(data.id) ?? '',
    amountCents: paid.cents || money(data.price).cents,
    currency: paid.currency,
    paidAt: date(data.paidAt),
    paymentMethod: str(data.paymentMethod) ?? str(obj(data.payment).method),
    installments: typeof data.installments === 'number' ? data.installments : null,
    productIds: items.map((item) => str(item.productId)).filter((id): id is string => !!id),
    match: {
      tracker: str(tracker.code1),
      contractId: str(obj(data.contract).id),
      buyerEmail: str(obj(data.buyer).email)?.toLowerCase() ?? null,
    },
  };
}

function toContract(data: Json): BillingContract {
  const contract = obj(data.contract);
  const recurrence = obj(contract.recurrence);
  const products = Array.isArray(data.products) ? data.products.map(obj) : [];
  const providerStatus = str(contract.status) ?? '';
  const match: BillingMatch = {
    tracker: null,
    contractId: str(contract.id),
    buyerEmail: str(obj(data.customer).email)?.toLowerCase() ?? null,
  };
  return {
    id: match.contractId ?? '',
    status: mapEduzzContractStatus(providerStatus),
    providerStatus,
    productIds: products.map((product) => str(product.id)).filter((id): id is string => !!id),
    startedAt: date(recurrence.startsAt) ?? date(contract.createdAt),
    nextChargeAt: date(recurrence.nextDue),
    match,
  };
}

/** Traduz o JSON `{ id, event, data, sentDate }` da Eduzz. */
export function toBillingEvent(body: unknown): BillingEvent {
  const envelope = obj(body);
  const id = str(envelope.id) ?? '';
  const type = str(envelope.event) ?? '';
  const data = obj(envelope.data);
  switch (type) {
    case 'myeduzz.invoice_paid':
      return { id, type: 'invoice.paid', invoice: toInvoice(data) };
    case 'myeduzz.invoice_refunded':
    case 'myeduzz.invoice_chargeback':
      return { id, type: 'invoice.refunded', invoice: toInvoice(data) };
    case 'myeduzz.contract_created':
    case 'myeduzz.contract_updated':
      return { id, type: 'contract.updated', contract: toContract(data) };
    default:
      // Ping de ativação da URL e eventos que não mudam o acesso.
      return { id, type: 'ignored', providerType: type };
  }
}

/** `x-signature` = HMAC-SHA256(segredo, corpo bruto). A Eduzz não documenta hex x base64: aceita os dois. */
export function verifyEduzzSignature(
  payload: Buffer,
  signature: string | undefined,
  secret: string,
) {
  if (!secret || !signature || !Buffer.isBuffer(payload)) return false;
  const hmac = createHmac('sha256', secret).update(payload).digest();
  const received = signature.trim();
  return [hmac.toString('hex'), hmac.toString('base64')].some((expected) => {
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export class EduzzBillingGateway implements BillingGateway {
  readonly provider = 'eduzz' as const;

  constructor(private readonly config: EduzzConfig) {}

  checkoutUrl(plan: PlanId, buyer: { username: string; email: string | null }) {
    const base = this.config.checkoutUrls[plan];
    if (!base) return null;
    const url = new URL(base);
    url.searchParams.set(TRACKER_PARAM, buyer.username);
    if (buyer.email) url.searchParams.set(EMAIL_PARAM, buyer.email);
    return url.toString();
  }

  customerAreaUrl() {
    return this.config.customerAreaUrl ?? null;
  }

  planForProduct(productIds: string[]): PlanId | null {
    const { monthly, annual } = this.config.productIds;
    if (monthly && productIds.includes(monthly)) return 'monthly';
    if (annual && productIds.includes(annual)) return 'annual';
    return null;
  }

  parseWebhook(payload: Buffer, signature: string | undefined): BillingEvent {
    if (!verifyEduzzSignature(payload, signature, this.config.webhookSecret))
      throw new InvalidWebhookSignature();
    let body: unknown;
    try {
      body = JSON.parse(payload.toString('utf8'));
    } catch {
      throw new InvalidWebhookSignature();
    }
    return toBillingEvent(body);
  }
}

export function eduzzConfigFromEnv(env = process.env): EduzzConfig {
  return {
    webhookSecret: env.EDUZZ_WEBHOOK_SECRET ?? '',
    checkoutUrls: { monthly: env.EDUZZ_CHECKOUT_MONTHLY, annual: env.EDUZZ_CHECKOUT_ANNUAL },
    productIds: { monthly: env.EDUZZ_PRODUCT_MONTHLY, annual: env.EDUZZ_PRODUCT_ANNUAL },
    customerAreaUrl: env.EDUZZ_CUSTOMER_AREA_URL || 'https://orbita.eduzz.com',
  };
}

/** Gateway do ambiente: `null` quando a Eduzz não está configurada (rotas respondem 503). */
export function createBillingGatewayFromEnv(env = process.env): BillingGateway | null {
  const config = eduzzConfigFromEnv(env);
  if (!config.webhookSecret && !config.checkoutUrls.monthly && !config.checkoutUrls.annual)
    return null;
  return new EduzzBillingGateway(config);
}
