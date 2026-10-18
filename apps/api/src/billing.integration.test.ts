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

const DAY_MS = 24 * 60 * 60 * 1000;
const app = createApp();
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
