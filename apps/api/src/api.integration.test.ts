import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { PatientModel, UserModel, LeadModel } from './modules/shared/infra/models.js';

const app = createApp();
let mongo: MongoMemoryServer;
let adminToken = '';
let prof1Token = '';

async function addUser(username: string, role: 'admin' | 'professional' = 'professional') {
  await UserModel.create({
    username,
    name: username === 'admin' ? 'Administrador' : `Profissional ${username.slice(-1)}`,
    role,
    origin: 'seed',
    passwordHash: await bcrypt.hash(username, 4),
  });
}
async function login(username: string) {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: username });
  expect(response.status).toBe(200);
  return response.body.token as string;
}
async function addSeedPatients() {
  await PatientModel.create([
    {
      code: '014',
      initials: 'M.S.',
      age: 78,
      educationYears: 4,
      group: 'Grupo da manhã',
      responsibleUsername: 'prof1',
      objective: 'Manter atenção e memória no dia a dia',
      interests: 'Gosta de música antiga.',
      vision: 'Leve',
      hearing: 'Sem limitação',
      mobility: 'Sem limitação',
      phone: '(32) 99999-0014',
      address: '',
      emergencyContact: { name: 'Contato A', phone: '(32) 98888-0014', relationship: 'Filho(a)' },
      generationCursor: 0,
      evaluations: [
        { date: '03/2026', scores: { ori: 9, reg: 3, ate: 3, evo: 2, lin: 8 } },
        { date: '06/2026', scores: { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 } },
        { date: '09/2026', scores: { ori: 8, reg: 3, ate: 3, evo: 1, lin: 8 } },
      ],
    },
    {
      code: '021',
      initials: 'J.A.',
      age: 82,
      group: 'Individual',
      responsibleUsername: 'prof2',
      objective: '',
      interests: '',
      vision: 'Sem limitação',
      hearing: 'Leve',
      mobility: 'Leve',
      phone: '',
      address: '',
      emergencyContact: { name: 'Contato B', phone: '32988880021', relationship: 'Cônjuge' },
      generationCursor: 0,
      evaluations: [
        { date: '03/2026', scores: { ori: 8, reg: 2, ate: 2, evo: 1, lin: 7 } },
        { date: '06/2026', scores: { ori: 8, reg: 3, ate: 2, evo: 1, lin: 7 } },
        { date: '09/2026', scores: { ori: 8, reg: 3, ate: 3, evo: 1, lin: 7 } },
      ],
    },
  ]);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([UserModel.init(), PatientModel.init(), LeadModel.init()]);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    PatientModel.deleteMany({}),
    LeadModel.deleteMany({}),
  ]);
  await addUser('admin', 'admin');
  await addUser('prof1');
  await addUser('prof2');
  adminToken = await login('admin');
  prof1Token = await login('prof1');
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('API REST v1 (integração MongoDB) ', () => {
  it('RN-AUTH-02: login normaliza username, compara senha exata e retorna erro pt-BR', async () => {
    const success = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: '  ADMIN ', password: 'admin' });
    expect(success.status).toBe(200);
    expect(success.body.user).toEqual({ username: 'admin', name: 'Administrador', role: 'admin' });
    const failure = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'Admin' });
    expect(failure.status).toBe(401);
    expect(failure.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Usuário ou senha incorretos.',
    });
  });

  it('RN-AUTH-03/RN-AUTH-05: signup ordena mensagens, cria professional e persiste bcrypt', async () => {
    const invalid = await request(app)
      .post('/api/v1/auth/signup')
      .send({ username: 'x', password: 'x' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toMatchObject({ message: 'Informe seu nome.', field: 'name' });
    const created = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: ' Nova ', username: ' NOVA ', password: 'abcd', passwordConfirmation: 'abcd' });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({
      username: 'nova',
      name: 'Nova',
      role: 'professional',
    });
    const persisted = await UserModel.findOne({ username: 'nova' }).select('+passwordHash').lean();
    expect(persisted?.passwordHash).not.toBe('abcd');
    expect(await bcrypt.compare('abcd', persisted!.passwordHash)).toBe(true);
    const duplicate = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Novo', username: 'nova', password: 'abcd', passwordConfirmation: 'abcd' });
    expect(duplicate.body.error.message).toBe('Este usuário já existe. Escolha outro.');
  });

  it('RN-LEAD-01..05: trial access valida em ordem, gera credencial e nunca guarda senha no lead', async () => {
    const invalid = await request(app)
      .post('/api/v1/auth/trial-access')
      .send({ name: 'Ágata', phone: '1234', email: 'bad', consent: false });
    expect(invalid.body.error).toMatchObject({
      message: 'Informe um telefone com DDD.',
      field: 'phone',
    });
    const created = await request(app).post('/api/v1/auth/trial-access').send({
      name: 'Ágata Souza',
      phone: '(32) 9 1234-5678',
      email: 'agata@exemplo.com',
      profile: 'Fisioterapeuta',
      workplace: 'Clínica Vida',
      consent: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.credentials).toEqual({ username: 'agata', password: '5678' });
    const lead = await LeadModel.findOne({ username: 'agata' }).lean();
    expect(lead).toMatchObject({
      name: 'Ágata Souza',
      phone: '(32) 9 1234-5678',
      profile: 'Fisioterapeuta',
    });
    expect(lead).not.toHaveProperty('password');
    const second = await request(app).post('/api/v1/auth/trial-access').send({
      name: 'Agata Lima',
      phone: '32912345678',
      email: 'agata2@exemplo.com',
      consent: true,
    });
    expect(second.body.credentials.username).toBe('agata2');
  });

  it('RN-AUTH-04/RN-PAT-01: protege rotas e esconde pacientes de outro responsável como 404', async () => {
    await addSeedPatients();
    expect((await request(app).get('/api/v1/patients')).status).toBe(401);
    const adminList = await request(app).get('/api/v1/patients').set(auth(adminToken));
    const profList = await request(app).get('/api/v1/patients').set(auth(prof1Token));
    expect(adminList.body.items.map((item: { id: string }) => item.id)).toEqual(['014', '021']);
    expect(profList.body.items.map((item: { id: string }) => item.id)).toEqual(['014']);
    expect((await request(app).get('/api/v1/patients/021').set(auth(prof1Token))).status).toBe(404);
    expect((await request(app).get('/api/v1/users').set(auth(prof1Token))).status).toBe(403);
  });

  it('RN-PAT-02..08: cria código sequencial, aplica defaults e preserva dono', async () => {
    await addSeedPatients();
    const response = await request(app)
      .post('/api/v1/patients')
      .set(auth(prof1Token))
      .send({
        initials: ' K.K. ',
        age: 70,
        educationYears: 5,
        emergencyContact: { name: 'Fulano', phone: '32988887777' },
      });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: '022',
      initials: 'K.K.',
      responsibleUsername: 'prof1',
      evaluationCount: 0,
      hasPending: false,
      group: 'Individual',
    });
    const updated = await request(app)
      .put('/api/v1/patients/022')
      .set(auth(prof1Token))
      .send({
        initials: 'K.K.',
        age: 70,
        educationYears: 5,
        emergencyContact: { name: 'Fulano', phone: '32988887777' },
        responsibleUsername: 'admin',
      });
    expect(updated.body.responsibleUsername).toBe('prof1');
  });

  it('RN-PAT-04: valida campos em ordem com mensagem literal e código do erro', async () => {
    const response = await request(app)
      .post('/api/v1/patients')
      .set(auth(prof1Token))
      .send({ initials: '', age: 20 });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Informe as iniciais do paciente.',
      field: 'initials',
    });
  });

  it('RN-FIC-02/03/08: upload retorna ficha e sheetLines, conflito pendente e confirmação valida soma/flag', async () => {
    await addSeedPatients();
    const upload = await request(app)
      .post('/api/v1/patients/014/fichas/upload')
      .set(auth(prof1Token))
      .send({});
    expect(upload.status).toBe(201);
    expect(upload.body.pending).toMatchObject({
      scores: { ori: 8, reg: 3, ate: 2, evo: 1, lin: 8 },
      writtenTotal: 22,
      flag: 'ate',
    });
    expect(upload.body.pending.sheetLines).toHaveLength(10);
    const conflict = await request(app)
      .post('/api/v1/patients/014/fichas/upload')
      .set(auth(prof1Token))
      .send({});
    expect(conflict.status).toBe(409);
    const mismatch = await request(app)
      .post('/api/v1/patients/014/fichas/pending/confirm')
      .set(auth(prof1Token))
      .send({
        scores: { ori: 8, reg: 3, ate: 1, evo: 1, lin: 8 },
        flagConfirmed: true,
      });
    expect(mismatch.body.error.message).toBe(
      'A soma dos domínios (21) é diferente do total escrito na ficha (22/30). Revise os valores.',
    );
    const unconfirmed = await request(app)
      .post('/api/v1/patients/014/fichas/pending/confirm')
      .set(auth(prof1Token))
      .send({
        scores: upload.body.pending.scores,
        flagConfirmed: false,
      });
    expect(unconfirmed.body.error.message).toBe(
      'Confirme o campo sinalizado e a soma para liberar o botão.',
    );
    const confirmed = await request(app)
      .post('/api/v1/patients/014/fichas/pending/confirm')
      .set(auth(prof1Token))
      .send({
        scores: upload.body.pending.scores,
        observations: 'Notas revisadas',
        flagConfirmed: true,
      });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      evaluation: { total: 22 },
      justConfirmed: upload.body.pending.date,
    });
    const list = await request(app).get('/api/v1/patients/014/fichas').set(auth(prof1Token));
    expect(list.body.evaluations[0]).toMatchObject({ total: 22, status: 'Conferida' });
    expect(list.body.evaluations[0]).not.toHaveProperty('notes');
  });

  it('RN-EVO-05..07/RN-EVO-06: suggestion state, custom text, routine, dashboard and admin read models', async () => {
    await addSeedPatients();
    const evolution = await request(app)
      .get('/api/v1/patients/014/evolution')
      .set(auth(prof1Token));
    expect(evolution.body.suggestions.map((item: { key: string }) => item.key)).toEqual([
      '014:evo',
      '014:ate',
      '014:ori',
    ]);
    const suggestion = await request(app)
      .patch('/api/v1/patients/014/suggestions/014%3Aevo')
      .set(auth(prof1Token))
      .send({ status: 'ok' });
    expect(suggestion.body.status).toBe('ok');
    await request(app)
      .patch('/api/v1/patients/014/suggestions/014%3Aevo')
      .set(auth(prof1Token))
      .send({ customText: 'Texto customizado' });
    const routines = await request(app).get('/api/v1/routines').set(auth(prof1Token));
    expect(routines.body.items[0].activities[0].text).toBe('Texto customizado');
    const dashboard = await request(app).get('/api/v1/dashboard/summary').set(auth(adminToken));
    expect(dashboard.body.kpis).toMatchObject({
      patients: 2,
      professionals: 2,
      recentDrops: 1,
      routineActivities: 1,
    });
    const users = await request(app).get('/api/v1/users').set(auth(adminToken));
    expect(
      users.body.items.find((item: { username: string }) => item.username === 'prof1').patientCount,
    ).toBe(1);
    expect((await request(app).get('/api/v1/leads').set(auth(adminToken))).body.items).toEqual([]);
  });

  it('RN-PAT-07/RN-FIC-10: delete cascades aggregate data and pending is readable only when present', async () => {
    await addSeedPatients();
    const missing = await request(app)
      .get('/api/v1/patients/014/fichas/pending')
      .set(auth(prof1Token));
    expect(missing.status).toBe(404);
    await PatientModel.updateOne(
      { code: '014' },
      {
        $set: {
          pending: {
            date: '17/10/2026',
            scores: { ori: 8, reg: 3, ate: 2, evo: 1, lin: 8 },
            writtenTotal: 22,
            flag: 'ate',
            observations: 'Obs',
          },
        },
      },
    );
    expect(
      (await request(app).get('/api/v1/patients/014/fichas/pending').set(auth(prof1Token))).body
        .pending.flag,
    ).toBe('ate');
    expect((await request(app).delete('/api/v1/patients/014').set(auth(prof1Token))).status).toBe(
      204,
    );
    expect(await PatientModel.countDocuments({ code: '014' })).toBe(0);
  });

  it('expõe os dois health checks e meta/options', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/api/v1/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/api/v1/meta/options')).body.domains).toHaveLength(5);
  });

  it('fase 7: configura cabeçalhos Helmet e CORS somente para origem allowlist', async () => {
    const allowed = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denied = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.status).toBe(204);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();

    const secure = await request(app).get('/health');
    expect(secure.headers['x-content-type-options']).toBe('nosniff');
    expect(secure.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('RN-AUTH-01: demo reset é exclusivo de admin e restaura exatamente os dados semente', async () => {
    await addSeedPatients();
    await LeadModel.create({
      name: 'Lead teste',
      phone: '32912345678',
      email: 'lead@exemplo.com',
      profile: 'Outro',
      workplace: '',
      username: 'lead',
      consentAt: new Date(),
    });
    await PatientModel.create({
      code: '022',
      initials: 'N.N.',
      age: 72,
      responsibleUsername: 'prof1',
      emergencyContact: { name: 'Contato', phone: '3299999999', relationship: 'Filho(a)' },
      vision: 'Sem limitação',
      hearing: 'Sem limitação',
      mobility: 'Sem limitação',
      group: 'Individual',
    });

    expect((await request(app).post('/api/v1/demo/reset').set(auth(prof1Token))).status).toBe(403);
    const reset = await request(app).post('/api/v1/demo/reset').set(auth(adminToken));
    expect(reset.status).toBe(204);
    expect(await UserModel.countDocuments({})).toBe(3);
    expect(await PatientModel.countDocuments({})).toBe(3);
    expect(await LeadModel.countDocuments({})).toBe(0);
    const loginAgain = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin' });
    expect(loginAgain.status).toBe(200);
    const summary = await request(app)
      .get('/api/v1/dashboard/summary')
      .set(auth(loginAgain.body.token as string));
    expect(summary.body.kpis).toMatchObject({
      patients: 3,
      professionals: 2,
      pendingFichas: 0,
      recentDrops: 2,
      routineActivities: 0,
    });
    expect(summary.body.todo).toHaveLength(2);
  });
});
