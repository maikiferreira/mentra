import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { initModels } from './modules/shared/infra/database.js';
import {
  LeadModel,
  PaymentModel,
  ProcessedStripeEventModel,
  SubscriptionModel,
  UserModel,
} from './modules/shared/infra/models.js';
import { migrateBilling } from './migrate-billing.js';
import { FakeBillingGateway } from './modules/billing/infra/fake-billing-gateway.js';
import type Stripe from 'stripe';

const DAY_MS = 24 * 60 * 60 * 1000;
const gateway = new FakeBillingGateway();
const app = createApp({
  billingGateway: gateway,
  billingConfig: {
    appUrl: 'https://app.test',
    prices: { monthly: 'price_monthly', annual: 'price_annual' },
  },
});
let mongo: MongoMemoryServer;

type Origin = 'seed' | 'signup' | 'trial';
async function addUser(
  username: string,
  options: {
    role?: 'admin' | 'professional';
    origin?: Origin;
    trialEndsAt?: Date;
    email?: string;
  } = {},
) {
  await UserModel.create({
    username,
    name: `Pessoa ${username}`,
    role: options.role ?? 'professional',
    origin: options.origin ?? 'signup',
    passwordHash: await bcrypt.hash(username, 4),
    ...(options.trialEndsAt ? { trialEndsAt: options.trialEndsAt } : {}),
    ...(options.email ? { email: options.email } : {}),
  });
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: username });
  expect(response.status).toBe(200);
  return response.body.token as string;
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const fromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await initModels();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  gateway.reset();
  await Promise.all([
    UserModel.deleteMany({}),
    LeadModel.deleteMany({}),
    SubscriptionModel.deleteMany({}),
    PaymentModel.deleteMany({}),
    ProcessedStripeEventModel.deleteMany({}),
  ]);
});

describe('RN-PAY-03..06: regra de acesso na API', () => {
  it('trial dentro do prazo acessa; fora do prazo recebe 402 SUBSCRIPTION_REQUIRED', async () => {
    const active = await addUser('ativo', { origin: 'trial', trialEndsAt: fromNow(3) });
    const expired = await addUser('expirado', { origin: 'trial', trialEndsAt: fromNow(-1) });
    expect((await request(app).get('/api/v1/patients').set(auth(active))).status).toBe(200);
    const blocked = await request(app).get('/api/v1/patients').set(auth(expired));
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect((await request(app).get('/api/v1/dashboard/summary').set(auth(expired))).status).toBe(
      402,
    );
  });

  it('seed e admin são isentos; signup sem assinatura recebe 402', async () => {
    const seed = await addUser('semente', { origin: 'seed' });
    const admin = await addUser('chefe', { role: 'admin', origin: 'signup' });
    const signup = await addUser('novo', { origin: 'signup' });
    expect((await request(app).get('/api/v1/patients').set(auth(seed))).status).toBe(200);
    expect((await request(app).get('/api/v1/users').set(auth(admin))).status).toBe(200);
    expect((await request(app).get('/api/v1/patients').set(auth(signup))).status).toBe(402);
  });

  it('assinatura ativa libera o signup; /auth/me responde mesmo sem acesso e expõe access', async () => {
    const signup = await addUser('novo', { origin: 'signup' });
    const me = await request(app).get('/api/v1/auth/me').set(auth(signup));
    expect(me.status).toBe(200);
    expect(me.body.access).toEqual({
      hasAccess: false,
      reason: 'no_subscription',
      trialEndsAt: null,
      status: null,
    });
    await SubscriptionModel.create({ username: 'novo', status: 'active', plan: 'monthly' });
    expect((await request(app).get('/api/v1/patients').set(auth(signup))).status).toBe(200);
    const after = await request(app).get('/api/v1/auth/me').set(auth(signup));
    expect(after.body.access).toMatchObject({
      hasAccess: true,
      reason: 'active',
      status: 'active',
    });
  });

  it('"Quero testar" grava e-mail e 7 dias de trial no usuário', async () => {
    const created = await request(app).post('/api/v1/auth/trial-access').send({
      name: 'Bia Lima',
      phone: '(32) 91234-5678',
      email: 'Bia@Exemplo.com',
      consent: true,
    });
    expect(created.status).toBe(201);
    const user = await UserModel.findOne({ username: 'bia' }).lean();
    expect(user?.email).toBe('bia@exemplo.com');
    const days = (user!.trialEndsAt!.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set(auth(created.body.token as string));
    expect(me.body.access).toMatchObject({ hasAccess: true, reason: 'trial' });
  });

  it('migrate-billing dá prazo a trials antigos, copia o e-mail do lead e é idempotente', async () => {
    await addUser('antigo', { origin: 'trial' });
    await addUser('comprazo', { origin: 'trial', trialEndsAt: fromNow(-2) });
    await LeadModel.create({
      name: 'Antigo',
      phone: '32912345678',
      email: 'Antigo@Exemplo.com',
      profile: 'Outro',
      username: 'antigo',
      consentAt: new Date(),
    });
    expect(await migrateBilling()).toEqual({
      trialsExtended: 1,
      emailsFilled: 1,
      stillWithoutEmail: 1,
    });
    const migrated = await UserModel.findOne({ username: 'antigo' }).lean();
    expect(migrated?.email).toBe('antigo@exemplo.com');
    expect(migrated!.trialEndsAt!.getTime()).toBeGreaterThan(fromNow(6.9).getTime());
    const untouched = await UserModel.findOne({ username: 'comprazo' }).lean();
    expect(untouched!.trialEndsAt!.getTime()).toBeLessThan(Date.now());
    expect(await migrateBilling()).toEqual({
      trialsExtended: 0,
      emailsFilled: 0,
      stillWithoutEmail: 1,
    });
  });
});

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
function stripeSubscription(input: {
  id?: string;
  customer?: string;
  username?: string;
  status?: Stripe.Subscription.Status;
  price?: string;
  periodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
}): Stripe.Subscription {
  return {
    id: input.id ?? 'sub_1',
    object: 'subscription',
    customer: input.customer ?? 'cus_1',
    status: input.status ?? 'active',
    metadata: input.username ? { username: input.username } : {},
    start_date: seconds(new Date()),
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    cancel_at: null,
    canceled_at: input.canceledAt ? seconds(input.canceledAt) : null,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          price: { id: input.price ?? 'price_monthly' },
          current_period_end: seconds(input.periodEnd ?? fromNow(30)),
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}
function stripeInvoice(input: {
  id?: string;
  customer?: string;
  subscription?: string;
  amount?: number;
  price?: string;
  paidAt?: Date | null;
}) {
  return {
    id: input.id ?? 'in_1',
    object: 'invoice',
    customer: input.customer ?? 'cus_1',
    amount_paid: input.paidAt === null ? 0 : (input.amount ?? 4990),
    amount_due: input.amount ?? 4990,
    currency: 'brl',
    parent: { subscription_details: { subscription: input.subscription ?? 'sub_1' } },
    status_transitions: {
      paid_at: input.paidAt === null ? null : seconds(input.paidAt ?? new Date()),
    },
    lines: {
      object: 'list',
      data: [{ pricing: { price_details: { price: input.price ?? 'price_monthly' } } }],
    },
  };
}
let eventCounter = 0;
async function sendEvent(type: string, object: unknown, id = `evt_${++eventCounter}`) {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  return request(app)
    .post('/api/v1/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', FakeBillingGateway.sign(payload))
    .send(payload);
}
/** Simula o fluxo do Checkout: cliente criado pela API, assinatura ativa no Stripe e webhook. */
async function subscribe(username: string, token: string, plan: 'monthly' | 'annual' = 'monthly') {
  expect(
    (await request(app).post('/api/v1/billing/checkout').set(auth(token)).send({ plan })).status,
  ).toBe(200);
  const customer = (await SubscriptionModel.findOne({ username }).lean())!.stripeCustomerId!;
  const subscription = stripeSubscription({
    id: `sub_${username}`,
    customer,
    username,
    price: plan === 'monthly' ? 'price_monthly' : 'price_annual',
  });
  gateway.subscriptions.set(subscription.id, subscription);
  const completed = await sendEvent('checkout.session.completed', {
    id: 'cs_1',
    object: 'checkout.session',
    client_reference_id: username,
    customer,
    subscription: subscription.id,
    metadata: {},
  });
  expect(completed.status).toBe(200);
  return { customer, subscriptionId: subscription.id };
}

describe('RN-PAY-07/RN-PAY-10: integração Stripe (gateway fake)', () => {
  it('GET /billing/plans é público e traz os preços', async () => {
    const response = await request(app).get('/api/v1/billing/plans');
    expect(response.status).toBe(200);
    expect(response.body.plans.map((plan: { priceCents: number }) => plan.priceCents)).toEqual([
      4990, 53892,
    ]);
    expect(response.body.trialDays).toBe(7);
  });

  it('checkout cria o cliente e devolve a url; plano inválido é 422', async () => {
    const token = await addUser('novo', { email: 'novo@exemplo.com' });
    const invalid = await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(token))
      .send({ plan: 'vitalicio' });
    expect(invalid.status).toBe(422);
    const response = await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(token))
      .send({ plan: 'annual' });
    expect(response.status).toBe(200);
    expect(response.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(gateway.customers).toEqual([
      { id: 'cus_1', email: 'novo@exemplo.com', name: 'Pessoa novo', username: 'novo' },
    ]);
    expect(gateway.checkoutSessions[0]).toMatchObject({
      customerId: 'cus_1',
      priceId: 'price_annual',
      username: 'novo',
      successUrl: 'https://app.test/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://app.test/assinatura/planos',
    });
    // Uma segunda tentativa reaproveita o mesmo cliente.
    await request(app).post('/api/v1/billing/checkout').set(auth(token)).send({ plan: 'monthly' });
    expect(gateway.customers).toHaveLength(1);
  });

  it('checkout.session.completed ativa a assinatura e libera o acesso (402 → 200)', async () => {
    const token = await addUser('novo');
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(402);
    await subscribe('novo', token);
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(200);
    const mine = await request(app).get('/api/v1/billing/me').set(auth(token));
    expect(mine.body).toMatchObject({
      hasAccess: true,
      status: 'active',
      plan: 'monthly',
      cancelAtPeriodEnd: false,
      canManage: true,
    });
    expect(new Date(mine.body.currentPeriodEnd).getTime()).toBeGreaterThan(fromNow(29).getTime());
  });

  it('responde 409 ao tentar novo checkout com assinatura ativa', async () => {
    const token = await addUser('novo');
    await subscribe('novo', token);
    const again = await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(token))
      .send({ plan: 'annual' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CONFLICT');
  });

  it('webhook com assinatura inválida ou ausente responde 400 e não processa', async () => {
    const payload = JSON.stringify({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } });
    const forged = await request(app)
      .post('/api/v1/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=1,v1=forjada')
      .send(payload);
    expect(forged.status).toBe(400);
    const unsigned = await request(app)
      .post('/api/v1/billing/webhook')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(unsigned.status).toBe(400);
    expect(await ProcessedStripeEventModel.countDocuments()).toBe(0);
  });

  it('invoice.paid cria um Payment; evento repetido não duplica', async () => {
    const token = await addUser('novo');
    const { customer, subscriptionId } = await subscribe('novo', token);
    const paidAt = new Date('2026-10-01T10:00:00Z');
    const invoice = stripeInvoice({ customer, subscription: subscriptionId, paidAt });
    const first = await sendEvent('invoice.paid', invoice, 'evt_invoice');
    expect(first.body).toEqual({ received: true, duplicate: false });
    const repeated = await sendEvent('invoice.paid', invoice, 'evt_invoice');
    expect(repeated.body).toEqual({ received: true, duplicate: true });
    // Outro evento sobre a mesma fatura atualiza o mesmo registro.
    await sendEvent('invoice.paid', invoice);
    const payments = await PaymentModel.find({}).lean();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      username: 'novo',
      stripeInvoiceId: 'in_1',
      amountCents: 4990,
      currency: 'brl',
      plan: 'monthly',
      status: 'paid',
      paidAt,
    });
    const mine = await request(app).get('/api/v1/billing/me').set(auth(token));
    expect(mine.body.payments).toEqual([
      expect.objectContaining({ id: 'in_1', amountCents: 4990, status: 'paid' }),
    ]);
  });

  it('payment_failed deixa past_due, mantém o acesso na carência e bloqueia depois', async () => {
    const token = await addUser('novo');
    const { customer, subscriptionId } = await subscribe('novo', token);
    const failed = await sendEvent(
      'invoice.payment_failed',
      stripeInvoice({ id: 'in_2', customer, subscription: subscriptionId, paidAt: null }),
    );
    expect(failed.status).toBe(200);
    const subscription = await SubscriptionModel.findOne({ username: 'novo' }).lean();
    expect(subscription).toMatchObject({ status: 'past_due' });
    expect(await PaymentModel.findOne({ stripeInvoiceId: 'in_2' }).lean()).toMatchObject({
      status: 'failed',
      amountCents: 4990,
    });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(200);
    await SubscriptionModel.updateOne({ username: 'novo' }, { pastDueSince: fromNow(-4) });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(402);
  });

  it('cancelamento no fim do período mantém o acesso até currentPeriodEnd', async () => {
    const token = await addUser('novo');
    const { customer, subscriptionId } = await subscribe('novo', token);
    const periodEnd = fromNow(10);
    gateway.subscriptions.set(
      subscriptionId,
      stripeSubscription({
        id: subscriptionId,
        customer,
        username: 'novo',
        periodEnd,
        cancelAtPeriodEnd: true,
      }),
    );
    await sendEvent('customer.subscription.updated', { id: subscriptionId });
    expect(await SubscriptionModel.findOne({ username: 'novo' }).lean()).toMatchObject({
      status: 'active',
      cancelAtPeriodEnd: true,
    });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(200);
    gateway.subscriptions.set(
      subscriptionId,
      stripeSubscription({
        id: subscriptionId,
        customer,
        username: 'novo',
        status: 'canceled',
        periodEnd,
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      }),
    );
    await sendEvent('customer.subscription.deleted', { id: subscriptionId });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(200);
    await SubscriptionModel.updateOne({ username: 'novo' }, { currentPeriodEnd: fromNow(-0.1) });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(402);
  });

  it('portal abre para quem tem cliente no Stripe e responde 409 para quem não tem', async () => {
    const token = await addUser('novo');
    expect((await request(app).post('/api/v1/billing/portal').set(auth(token))).status).toBe(409);
    await subscribe('novo', token);
    const portal = await request(app).post('/api/v1/billing/portal').set(auth(token));
    expect(portal.status).toBe(200);
    expect(gateway.portalSessions[0]).toEqual({
      customerId: 'cus_1',
      returnUrl: 'https://app.test/perfil/assinatura',
    });
  });

  it('assinar durante o trial encerra o trial', async () => {
    const token = await addUser('teste', { origin: 'trial', trialEndsAt: fromNow(5) });
    await subscribe('teste', token);
    const user = await UserModel.findOne({ username: 'teste' }).lean();
    expect(user!.trialEndsAt!.getTime()).toBeLessThanOrEqual(Date.now());
    const me = await request(app).get('/api/v1/auth/me').set(auth(token));
    expect(me.body.access).toMatchObject({ hasAccess: true, reason: 'active' });
  });

  it('sem STRIPE_SECRET_KEY as rotas de billing respondem 503', async () => {
    const disabled = createApp({ billingGateway: null });
    const token = await addUser('novo');
    const checkout = await request(disabled)
      .post('/api/v1/billing/checkout')
      .set(auth(token))
      .send({ plan: 'monthly' });
    expect(checkout.status).toBe(503);
    expect(checkout.body.error.code).toBe('BILLING_UNAVAILABLE');
    expect((await request(disabled).post('/api/v1/billing/webhook').send('{}')).status).toBe(503);
    expect((await request(disabled).get('/api/v1/billing/plans')).status).toBe(200);
  });
});
