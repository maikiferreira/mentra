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
  ProcessedWebhookEventModel,
  SubscriptionModel,
  UnmatchedBillingEventModel,
  UserModel,
} from './modules/shared/infra/models.js';
import { migrateBilling } from './migrate-billing.js';
import { BillingMetricsService } from './modules/billing/application/billing-metrics-service.js';
import { FAKE_PRODUCTS, FakeBillingGateway } from './modules/billing/infra/fake-billing-gateway.js';
import { setMailTransport, type MailMessage } from './modules/shared/infra/mailer.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const gateway = new FakeBillingGateway();
const app = createApp({
  billingGateway: gateway,
  billingConfig: { appUrl: 'https://app.test' },
});
let mongo: MongoMemoryServer;
const sentMail: Array<MailMessage & { from: string }> = [];

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
  setMailTransport(null);
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  sentMail.length = 0;
  setMailTransport({
    send: async (message) => {
      sentMail.push(message);
    },
  });
  await Promise.all([
    UserModel.deleteMany({}),
    LeadModel.deleteMany({}),
    SubscriptionModel.deleteMany({}),
    PaymentModel.deleteMany({}),
    ProcessedWebhookEventModel.deleteMany({}),
    UnmatchedBillingEventModel.deleteMany({}),
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
    // Resto da fase de testes com o Stripe: removido pela migração.
    await SubscriptionModel.collection.insertOne({ username: 'legado', stripeCustomerId: 'cus_1' });
    await PaymentModel.collection.insertOne({ username: 'legado', stripeInvoiceId: 'in_1' });
    expect(await migrateBilling()).toEqual({
      stripeSubscriptionsRemoved: 1,
      stripePaymentsRemoved: 1,
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
      stripeSubscriptionsRemoved: 0,
      stripePaymentsRemoved: 0,
      trialsExtended: 0,
      emailsFilled: 0,
      stillWithoutEmail: 1,
    });
  });
});

function eduzzInvoice(input: {
  id?: string;
  username?: string | null;
  contractId?: string;
  email?: string;
  product?: string;
  value?: number;
  paidAt?: Date;
}) {
  return {
    id: input.id ?? 'inv_1',
    status: 'paid',
    buyer: { name: 'Comprador', email: input.email ?? 'comprador@exemplo.com' },
    tracker: { code1: input.username ?? null, code2: null, code3: null },
    price: { currency: 'BRL', value: input.value ?? 49.9 },
    paid: { currency: 'BRL', value: input.value ?? 49.9 },
    installments: 1,
    items: [
      {
        productId: input.product ?? FAKE_PRODUCTS.monthly,
        price: { currency: 'BRL', value: 49.9 },
      },
    ],
    paidAt: (input.paidAt ?? new Date()).toISOString(),
    paymentMethod: 'creditCard',
    contract: { id: input.contractId ?? 'ct_1', isUnlimitedInstallments: true },
  };
}
function eduzzContract(input: {
  id?: string;
  status: string;
  email?: string;
  product?: string;
  nextDue?: Date;
}) {
  return {
    products: [{ id: input.product ?? FAKE_PRODUCTS.monthly, name: 'Mente Ativa' }],
    contract: {
      id: input.id ?? 'ct_1',
      status: input.status,
      createdAt: new Date().toISOString(),
      recurrence: {
        startsAt: new Date().toISOString(),
        nextDue: (input.nextDue ?? fromNow(30)).toISOString(),
      },
    },
    customer: { name: 'Comprador', email: input.email ?? 'comprador@exemplo.com' },
    reason: 'status_updated',
  };
}
let eventCounter = 0;
async function sendEvent(event: string, data: unknown, id = `evt_${++eventCounter}`) {
  const payload = JSON.stringify({ id, event, data, sentDate: new Date().toISOString() });
  return request(app)
    .post('/api/v1/billing/eduzz/webhook')
    .set('Content-Type', 'application/json')
    .set('x-signature', FakeBillingGateway.sign(payload))
    .send(payload);
}
/** Simula o fluxo real: link de checkout rastreado e webhook de fatura paga da Eduzz. */
async function subscribe(username: string, token: string, plan: 'monthly' | 'annual' = 'monthly') {
  const checkout = await request(app)
    .post('/api/v1/billing/checkout')
    .set(auth(token))
    .send({ plan });
  expect(checkout.status).toBe(200);
  const contractId = `ct_${username}`;
  const paid = await sendEvent(
    'myeduzz.invoice_paid',
    eduzzInvoice({
      id: `inv_${username}`,
      username,
      contractId,
      product: FAKE_PRODUCTS[plan],
      value: plan === 'monthly' ? 49.9 : 538.92,
    }),
  );
  expect(paid.status).toBe(200);
  return { contractId };
}

describe('RN-PAY-07/RN-PAY-10/RN-PAY-11: integração Eduzz (gateway fake)', () => {
  it('GET /billing/plans é público e traz os preços', async () => {
    const response = await request(app).get('/api/v1/billing/plans');
    expect(response.status).toBe(200);
    expect(response.body.plans.map((plan: { priceCents: number }) => plan.priceCents)).toEqual([
      4990, 53892,
    ]);
    expect(response.body.trialDays).toBe(7);
  });

  it('checkout devolve o link Eduzz do plano com rastreio e e-mail; plano inválido é 422', async () => {
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
    const url = new URL(response.body.url);
    expect(url.origin + url.pathname).toBe('https://chk.eduzz.test/ANUAL');
    expect(url.searchParams.get('trk')).toBe('novo');
    expect(url.searchParams.get('email')).toBe('novo@exemplo.com');
  });

  it('fatura paga ativa a assinatura e libera o acesso (402 → 200)', async () => {
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
      customerAreaUrl: 'https://orbita.eduzz.test',
    });
    expect(new Date(mine.body.currentPeriodEnd).getTime()).toBeGreaterThan(fromNow(27).getTime());
  });

  it('plano anual vale por 1 ano', async () => {
    const token = await addUser('novo');
    await subscribe('novo', token, 'annual');
    const subscription = await SubscriptionModel.findOne({ username: 'novo' }).lean();
    expect(subscription).toMatchObject({ plan: 'annual', status: 'active' });
    expect(subscription!.currentPeriodEnd!.getTime()).toBeGreaterThan(fromNow(364).getTime());
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

  it('webhook com assinatura inválida ou ausente responde 401 e não processa', async () => {
    const payload = JSON.stringify({ id: 'evt_x', event: 'myeduzz.invoice_paid', data: {} });
    const forged = await request(app)
      .post('/api/v1/billing/eduzz/webhook')
      .set('Content-Type', 'application/json')
      .set('x-signature', 'forjada')
      .send(payload);
    expect(forged.status).toBe(401);
    const unsigned = await request(app)
      .post('/api/v1/billing/eduzz/webhook')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(unsigned.status).toBe(401);
    expect(await ProcessedWebhookEventModel.countDocuments()).toBe(0);
  });

  it('ping e eventos sem efeito respondem 200', async () => {
    const ping = await sendEvent('ping', {});
    expect(ping.body).toEqual({ received: true, duplicate: false });
    expect(await SubscriptionModel.countDocuments()).toBe(0);
  });

  it('fatura paga cria um Payment; evento repetido não duplica', async () => {
    const token = await addUser('novo');
    const paidAt = new Date('2026-10-01T10:00:00Z');
    const invoice = eduzzInvoice({ id: 'inv_9', username: 'novo', paidAt });
    const first = await sendEvent('myeduzz.invoice_paid', invoice, 'evt_invoice');
    expect(first.body).toEqual({ received: true, duplicate: false });
    const repeated = await sendEvent('myeduzz.invoice_paid', invoice, 'evt_invoice');
    expect(repeated.body).toEqual({ received: true, duplicate: true });
    // Outro evento sobre a mesma fatura atualiza o mesmo registro.
    await sendEvent('myeduzz.invoice_paid', invoice);
    const payments = await PaymentModel.find({}).lean();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      username: 'novo',
      providerInvoiceId: 'inv_9',
      amountCents: 4990,
      currency: 'brl',
      plan: 'monthly',
      status: 'paid',
      paymentMethod: 'creditCard',
      paidAt,
    });
    const mine = await request(app).get('/api/v1/billing/me').set(auth(token));
    expect(mine.body.payments).toEqual([
      expect.objectContaining({ id: 'inv_9', amountCents: 4990, status: 'paid' }),
    ]);
  });

  it('sem rastreio, vincula pelo e-mail da compra; depois, pelo contrato', async () => {
    await addUser('maria', { email: 'maria@exemplo.com' });
    await sendEvent(
      'myeduzz.invoice_paid',
      eduzzInvoice({ username: null, email: 'Maria@Exemplo.com', contractId: 'ct_maria' }),
    );
    expect(await SubscriptionModel.findOne({ username: 'maria' }).lean()).toMatchObject({
      status: 'active',
      eduzzContractId: 'ct_maria',
      buyerEmail: 'maria@exemplo.com',
    });
    // O contrato não traz rastreio: o vínculo vem do eduzzContractId gravado acima.
    await sendEvent(
      'myeduzz.contract_updated',
      eduzzContract({ id: 'ct_maria', status: 'late', email: 'outro@exemplo.com' }),
    );
    expect(await SubscriptionModel.findOne({ username: 'maria' }).lean()).toMatchObject({
      status: 'past_due',
      providerStatus: 'late',
    });
  });

  it('evento sem usuário identificável vira pendência e responde 200', async () => {
    const response = await sendEvent(
      'myeduzz.invoice_paid',
      eduzzInvoice({ username: 'ninguem', email: 'sem.cadastro@exemplo.com', contractId: 'ct_x' }),
      'evt_orfao',
    );
    expect(response.status).toBe(200);
    expect(await SubscriptionModel.countDocuments()).toBe(0);
    expect(await UnmatchedBillingEventModel.findOne({ eventId: 'evt_orfao' }).lean()).toMatchObject(
      { type: 'invoice.paid', tracker: 'ninguem', buyerEmail: 'sem.cadastro@exemplo.com' },
    );
  });

  it('contrato em atraso deixa past_due, mantém o acesso na carência e bloqueia depois', async () => {
    const token = await addUser('novo');
    const { contractId } = await subscribe('novo', token);
    await sendEvent('myeduzz.contract_updated', eduzzContract({ id: contractId, status: 'late' }));
    expect(await SubscriptionModel.findOne({ username: 'novo' }).lean()).toMatchObject({
      status: 'past_due',
    });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(200);
    await SubscriptionModel.updateOne({ username: 'novo' }, { pastDueSince: fromNow(-4) });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(402);
    // A renovação paga reativa.
    await sendEvent(
      'myeduzz.invoice_paid',
      eduzzInvoice({ id: 'inv_renova', username: 'novo', contractId }),
    );
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(200);
  });

  it('"aguardando pagamento" antes da 1ª fatura não libera nem conta como atraso', async () => {
    const token = await addUser('novo', { email: 'novo@exemplo.com' });
    await sendEvent(
      'myeduzz.contract_created',
      eduzzContract({ id: 'ct_pix', status: 'awaitingPayment', email: 'novo@exemplo.com' }),
    );
    expect(await SubscriptionModel.findOne({ username: 'novo' }).lean()).toMatchObject({
      status: 'incomplete',
      eduzzContractId: 'ct_pix',
    });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(402);
  });

  it('cancelamento mantém o acesso até o fim do período pago', async () => {
    const token = await addUser('novo');
    const { contractId } = await subscribe('novo', token);
    const paidUntil = (await SubscriptionModel.findOne({ username: 'novo' }).lean())!
      .currentPeriodEnd!;
    await sendEvent(
      'myeduzz.contract_updated',
      eduzzContract({ id: contractId, status: 'canceled', nextDue: fromNow(90) }),
    );
    const canceled = await SubscriptionModel.findOne({ username: 'novo' }).lean();
    expect(canceled).toMatchObject({ status: 'canceled', cancelAtPeriodEnd: true });
    expect(canceled!.currentPeriodEnd).toEqual(paidUntil);
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(200);
    await SubscriptionModel.updateOne({ username: 'novo' }, { currentPeriodEnd: fromNow(-0.1) });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(402);
  });

  it('reembolso corta o acesso na hora', async () => {
    const token = await addUser('novo');
    const { contractId } = await subscribe('novo', token);
    await sendEvent(
      'myeduzz.invoice_refunded',
      eduzzInvoice({ id: 'inv_novo', username: 'novo', contractId }),
    );
    expect(await PaymentModel.findOne({ providerInvoiceId: 'inv_novo' }).lean()).toMatchObject({
      status: 'refunded',
    });
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(402);
  });

  it('portal abre a área do comprador para quem assinou e responde 409 para quem não', async () => {
    const token = await addUser('novo');
    expect((await request(app).post('/api/v1/billing/portal').set(auth(token))).status).toBe(409);
    await subscribe('novo', token);
    const portal = await request(app).post('/api/v1/billing/portal').set(auth(token));
    expect(portal.status).toBe(200);
    expect(portal.body).toEqual({ url: 'https://orbita.eduzz.test' });
  });

  it('assinar durante o trial encerra o trial', async () => {
    const token = await addUser('teste', { origin: 'trial', trialEndsAt: fromNow(5) });
    await subscribe('teste', token);
    const user = await UserModel.findOne({ username: 'teste' }).lean();
    expect(user!.trialEndsAt!.getTime()).toBeLessThanOrEqual(Date.now());
    const me = await request(app).get('/api/v1/auth/me').set(auth(token));
    expect(me.body.access).toMatchObject({ hasAccess: true, reason: 'active' });
  });

  it('sem configuração da Eduzz as rotas de billing respondem 503', async () => {
    const disabled = createApp({ billingGateway: null });
    const token = await addUser('novo');
    const checkout = await request(disabled)
      .post('/api/v1/billing/checkout')
      .set(auth(token))
      .send({ plan: 'monthly' });
    expect(checkout.status).toBe(503);
    expect(checkout.body.error.code).toBe('BILLING_UNAVAILABLE');
    expect((await request(disabled).post('/api/v1/billing/eduzz/webhook').send('{}')).status).toBe(
      503,
    );
    expect((await request(disabled).get('/api/v1/billing/plans')).status).toBe(200);
  });
});

describe('RN-PAY-08: e-mails transacionais (mailer fake)', () => {
  const subjects = () => sentMail.map((mail) => mail.subject);

  it('a ativação envia exatamente 1 e-mail de acesso liberado; eventos repetidos não reenviam', async () => {
    const token = await addUser('novo', { email: 'novo@exemplo.com' });
    const { contractId } = await subscribe('novo', token);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]).toMatchObject({
      to: 'novo@exemplo.com',
      subject: 'Seu acesso ao Mente Ativa está liberado',
      from: 'Mente Ativa <acesso@menteativaa.com.br>',
    });
    expect(sentMail[0]!.html).toContain('https://app.test/login');
    expect(sentMail[0]!.text).toContain('Para entrar, use o seu usuário: novo.');
    expect(sentMail[0]!.text).toContain('Plano Mensal: R$ 49,90 por mês.');

    // Mesmo evento reenviado pela Eduzz, e novos eventos da assinatura já ativa.
    const upToDate = eduzzContract({ id: contractId, status: 'upToDate' });
    await sendEvent('myeduzz.contract_updated', upToDate, 'evt_repetido');
    await sendEvent('myeduzz.contract_updated', upToDate, 'evt_repetido');
    await sendEvent(
      'myeduzz.invoice_paid',
      eduzzInvoice({ id: 'inv_2', username: 'novo', contractId }),
    );
    expect(subjects()).toEqual(['Seu acesso ao Mente Ativa está liberado']);
  });

  it('atraso avisa uma vez; cancelamento avisa uma vez', async () => {
    const token = await addUser('novo', { email: 'novo@exemplo.com' });
    const { contractId } = await subscribe('novo', token);
    await sendEvent('myeduzz.contract_updated', eduzzContract({ id: contractId, status: 'late' }));
    await sendEvent(
      'myeduzz.contract_updated',
      eduzzContract({ id: contractId, status: 'defaulter' }),
    );
    const canceled = eduzzContract({ id: contractId, status: 'canceled' });
    await sendEvent('myeduzz.contract_updated', canceled);
    await sendEvent('myeduzz.contract_updated', canceled);
    expect(subjects()).toEqual([
      'Seu acesso ao Mente Ativa está liberado',
      'Não conseguimos processar o seu pagamento',
      'Sua assinatura foi cancelada',
    ]);
    expect(sentMail[2]!.html).toContain('https://app.test/perfil/assinatura');
  });

  it('"Quero testar" envia o e-mail de boas-vindas ao trial', async () => {
    await request(app).post('/api/v1/auth/trial-access').send({
      name: 'Bia Lima',
      phone: '(32) 91234-5678',
      email: 'bia@exemplo.com',
      consent: true,
    });
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]).toMatchObject({
      to: 'bia@exemplo.com',
      subject: 'Bem-vindo(a) ao teste grátis do Mente Ativa',
    });
    expect(sentMail[0]!.text).toContain('Seu usuário é bia');
  });

  it('erro no SMTP não derruba o webhook nem impede a ativação', async () => {
    setMailTransport({
      send: async () => {
        throw new Error('SMTP fora do ar');
      },
    });
    const token = await addUser('novo', { email: 'novo@exemplo.com' });
    await subscribe('novo', token);
    expect((await request(app).get('/api/v1/patients').set(auth(token))).status).toBe(200);
  });
});

describe('RN-PAY-09: painel de assinaturas do admin', () => {
  const NOW = new Date('2026-10-18T15:00:00Z');
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

  async function seedBillingData() {
    const user = (username: string, origin: Origin, extra: Record<string, unknown> = {}) => ({
      username,
      name: `Pessoa ${username}`,
      email: `${username}@exemplo.com`,
      role: 'professional',
      origin,
      passwordHash: 'x',
      createdAt: at('2026-01-01'),
      updatedAt: at('2026-01-01'),
      ...extra,
    });
    // insertMany direto na coleção preserva createdAt (o Mongoose sobrescreveria).
    await UserModel.collection.insertMany([
      user('a', 'signup'),
      user('b', 'trial', { createdAt: at('2026-10-01'), trialEndsAt: at('2026-10-05') }),
      user('c', 'signup'),
      user('d', 'signup'),
      user('e', 'signup'),
      user('f', 'signup'),
      user('t1', 'trial', { createdAt: at('2026-10-10'), trialEndsAt: at('2026-10-17') }),
      user('t2', 'trial', { createdAt: at('2026-10-15'), trialEndsAt: at('2026-10-22') }),
    ]);
    const sub = (
      username: string,
      plan: 'monthly' | 'annual',
      status: string,
      activatedAt: string,
      currentPeriodEnd: string,
      extra: Record<string, unknown> = {},
    ) => ({
      username,
      plan,
      status,
      eduzzContractId: `ct_${username}`,
      startedAt: at(activatedAt),
      activatedAt: at(activatedAt),
      currentPeriodEnd: at(currentPeriodEnd),
      ...extra,
    });
    await SubscriptionModel.create([
      sub('a', 'monthly', 'active', '2026-08-10', '2026-11-10'),
      sub('b', 'monthly', 'active', '2026-10-05', '2026-11-05'),
      sub('c', 'annual', 'active', '2026-09-01', '2027-09-01'),
      sub('d', 'monthly', 'past_due', '2026-07-01', '2026-10-01', {
        pastDueSince: at('2026-10-01'),
      }),
      sub('e', 'monthly', 'canceled', '2026-09-15', '2026-10-15', { canceledAt: at('2026-10-10') }),
      sub('f', 'annual', 'active', '2026-06-01', '2026-11-01', {
        cancelAtPeriodEnd: true,
        canceledAt: at('2026-10-12'),
      }),
    ]);
    const paid = (username: string, id: string, amountCents: number, paidAt: string) => ({
      username,
      providerInvoiceId: id,
      amountCents,
      currency: 'brl',
      status: 'paid',
      paidAt: at(paidAt),
    });
    await PaymentModel.create([
      paid('a', 'in_a1', 4990, '2026-08-10'),
      paid('a', 'in_a2', 4990, '2026-09-10'),
      paid('a', 'in_a3', 4990, '2026-10-10'),
      paid('c', 'in_c1', 53892, '2026-09-01'),
      paid('b', 'in_b1', 4990, '2026-10-05'),
      {
        username: 'd',
        providerInvoiceId: 'in_d1',
        amountCents: 4990,
        currency: 'brl',
        status: 'failed',
      },
    ]);
  }

  it('calcula KPIs, MRR, receita mensal, conversão, churn e próximos 30 dias', async () => {
    await seedBillingData();
    const summary = await new BillingMetricsService().summary(NOW);
    expect(summary.kpis).toEqual({
      activeMonthly: 2,
      activeAnnual: 2,
      active: 4,
      inTrial: 1,
      pastDue: 1,
      canceledThisMonth: 2,
      // 2 × 49,90 + 2 × 538,92 / 12
      mrrCents: 18962,
      arrCents: 227544,
      revenueThisMonthCents: 9980,
      revenueTotalCents: 73852,
      averageTicketCents: 14770,
      trialConversionRate: 1 / 3,
      trialsLast30Days: 3,
      convertedTrialsLast30Days: 1,
      // e e f cancelaram este mês, de 5 ativas no início do mês (a, c, d, e, f).
      churnRate: 0.4,
    });
    expect(summary.series).toHaveLength(12);
    expect(summary.series[0]!.month).toBe('2025-11');
    expect(summary.series.slice(-3)).toEqual([
      { month: '2026-08', revenueCents: 4990, newSubscriptions: 1, cancellations: 0 },
      { month: '2026-09', revenueCents: 58882, newSubscriptions: 2, cancellations: 0 },
      { month: '2026-10', revenueCents: 9980, newSubscriptions: 1, cancellations: 2 },
    ]);
    expect(summary.upcoming).toEqual({ renewals: 2, expectedRevenueCents: 9980 });
  });

  it('lista assinaturas e trials com filtros; só admin acessa', async () => {
    await seedBillingData();
    const admin = await addUser('chefe', { role: 'admin', origin: 'seed' });
    const prof = await addUser('prof', { origin: 'seed' });
    expect((await request(app).get('/api/v1/admin/billing/summary').set(auth(prof))).status).toBe(
      403,
    );
    expect(
      (await request(app).get('/api/v1/admin/billing/subscriptions').set(auth(prof))).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/admin/billing/summary').set(auth(admin))).status).toBe(
      200,
    );

    const all = await request(app).get('/api/v1/admin/billing/subscriptions').set(auth(admin));
    expect(all.body.items).toHaveLength(8);
    const a = all.body.items.find((item: { username: string }) => item.username === 'a');
    expect(a).toMatchObject({
      name: 'Pessoa a',
      email: 'a@exemplo.com',
      plan: 'monthly',
      status: 'active',
      startedAt: at('2026-08-10').toISOString(),
      currentPeriodEnd: at('2026-11-10').toISOString(),
      paymentsCount: 3,
      totalPaidCents: 14970,
      lastPaymentAt: at('2026-10-10').toISOString(),
      eduzzContractId: 'ct_a',
    });
    const trials = await request(app)
      .get('/api/v1/admin/billing/subscriptions?status=trial')
      .set(auth(admin));
    expect(trials.body.items.map((item: { username: string }) => item.username).sort()).toEqual([
      't1',
      't2',
    ]);
    const annual = await request(app)
      .get('/api/v1/admin/billing/subscriptions?status=active&plan=annual')
      .set(auth(admin));
    expect(annual.body.items.map((item: { username: string }) => item.username).sort()).toEqual([
      'c',
      'f',
    ]);
  });
});
