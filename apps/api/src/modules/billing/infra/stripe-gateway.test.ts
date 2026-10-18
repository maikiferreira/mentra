import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { mapStripeStatus, toBillingInvoice, toBillingSubscription } from './stripe-gateway.js';

describe('mapeamento dos objetos do Stripe', () => {
  it('traduz os status do Stripe para os da aplicação', () => {
    expect(mapStripeStatus('active')).toBe('active');
    expect(mapStripeStatus('unpaid')).toBe('past_due');
    expect(mapStripeStatus('incomplete_expired')).toBe('canceled');
    expect(mapStripeStatus('paused')).toBe('canceled');
  });

  it('lê o período do item da assinatura e trata cancel_at como cancelamento agendado', () => {
    const subscription = toBillingSubscription({
      id: 'sub_1',
      customer: { id: 'cus_1' },
      status: 'active',
      metadata: { username: 'ana' },
      start_date: 1_760_000_000,
      cancel_at_period_end: false,
      cancel_at: 1_762_592_000,
      canceled_at: null,
      items: { data: [{ current_period_end: 1_762_592_000, price: { id: 'price_monthly' } }] },
    } as unknown as Stripe.Subscription);
    expect(subscription).toEqual({
      id: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      priceId: 'price_monthly',
      username: 'ana',
      startedAt: new Date(1_760_000_000_000),
      currentPeriodEnd: new Date(1_762_592_000_000),
      cancelAtPeriodEnd: true,
      canceledAt: null,
    });
  });

  it('lê assinatura e preço da fatura no formato novo (parent/pricing)', () => {
    const invoice = toBillingInvoice({
      id: 'in_1',
      customer: 'cus_1',
      amount_paid: 53892,
      amount_due: 53892,
      currency: 'brl',
      parent: { subscription_details: { subscription: 'sub_1' } },
      status_transitions: { paid_at: 1_760_000_000 },
      lines: { data: [{ pricing: { price_details: { price: { id: 'price_annual' } } } }] },
    } as unknown as Stripe.Invoice);
    expect(invoice).toEqual({
      id: 'in_1',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      amountPaidCents: 53892,
      amountDueCents: 53892,
      currency: 'brl',
      priceId: 'price_annual',
      paidAt: new Date(1_760_000_000_000),
    });
  });
});
