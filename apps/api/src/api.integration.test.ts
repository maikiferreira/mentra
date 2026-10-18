import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { PatientModel, UserModel, LeadModel } from './modules/shared/infra/models.js';
import { migrateEvaluations } from './modules/shared/infra/migrations.js';
import { todayISO } from './modules/evaluations/domain/patient-evaluations.js';
import { recentWeeks } from '@mente-ativa/shared';

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
let created = 0;
/** Ficha de MEEM no formato gravado (identificador e dia UTC). */
function evaluation(date: string, scores: Record<string, number>) {
  created += 1;
  return {
    id: `ficha-${created}`,
    instrument: 'meem',
    performedOn: new Date(`${date}T00:00:00Z`),
    scores,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, created)),
  };
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
      evaluations: [
        evaluation('2026-03-16', { ori: 9, reg: 3, ate: 3, evo: 2, lin: 8 }),
        evaluation('2026-06-15', { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 }),
        evaluation('2026-09-14', { ori: 8, reg: 3, ate: 3, evo: 1, lin: 8 }),
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
      evaluations: [
        evaluation('2026-03-16', { ori: 8, reg: 2, ate: 2, evo: 1, lin: 7 }),
        evaluation('2026-06-15', { ori: 8, reg: 3, ate: 2, evo: 1, lin: 7 }),
        evaluation('2026-09-14', { ori: 8, reg: 3, ate: 3, evo: 1, lin: 7 }),
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

  it('RN-FIC-01..05: registra, consulta, edita e exclui fichas, ordenando pela data da avaliação', async () => {
    await addSeedPatients();
    const valid = { date: '2026-10-17', scores: { ori: 8, reg: 3, ate: 2, evo: 1, lin: 8 } };
    const fichas = '/api/v1/patients/014/fichas';
    const post = (body: unknown, token = prof1Token, code = '014') =>
      request(app)
        .post(`/api/v1/patients/${code}/fichas`)
        .set(auth(token))
        .send(body as object);

    expect((await post(valid, prof1Token, '021')).status).toBe(404);
    expect((await post({ ...valid, date: '' })).body.error).toMatchObject({
      message: 'Informe a data da avaliação.',
      field: 'date',
    });
    expect((await post({ ...valid, date: '2026-02-30' })).body.error.message).toBe(
      'Informe uma data de avaliação válida.',
    );
    expect((await post({ ...valid, date: '2999-01-01' })).body.error.message).toBe(
      'A data da avaliação não pode ser no futuro.',
    );
    const outOfRange = await post({ ...valid, scores: { ...valid.scores, reg: 4 } });
    expect(outOfRange.status).toBe(422);
    expect(outOfRange.body.error.message).toBe(
      'A pontuação de "Memória imediata (registro)" deve ser um número inteiro entre 0 e 3.',
    );

    const created = await post({ ...valid, observations: '  Relata cansaço.  ' });
    expect(created.status).toBe(201);
    expect(created.body.evaluation).toMatchObject({
      date: '17/10/2026',
      instrument: 'meem',
      total: 22,
      max: 30,
      level: 'attention',
    });
    const id = created.body.evaluation.id as string;
    // Ficha antiga lançada depois entra na posição certa da evolução.
    const older = await post({
      ...valid,
      date: '2026-01-10',
      scores: { ori: 10, reg: 3, ate: 5, evo: 3, lin: 9 },
    });
    expect(older.status).toBe(201);

    const list = await request(app).get(fichas).set(auth(prof1Token));
    expect(list.body.evaluations.map((entry: { date: string }) => entry.date)).toEqual([
      '17/10/2026',
      '14/09/2026',
      '15/06/2026',
      '16/03/2026',
      '10/01/2026',
    ]);
    expect(list.body.evaluations[0]).toMatchObject({
      id,
      instrumentName: 'MEEM',
      status: 'Registrada',
    });
    expect(list.body.evaluations[0]).not.toHaveProperty('observations');

    const detail = await request(app).get(`${fichas}/${id}`).set(auth(prof1Token));
    expect(detail.body).toMatchObject({
      id,
      dateISO: '2026-10-17',
      scores: valid.scores,
      observations: 'Relata cansaço.',
    });
    expect((await request(app).get(`${fichas}/nao-existe`).set(auth(prof1Token))).status).toBe(404);
    // Ficha de outro responsável não é visível nem editável.
    expect(
      (await request(app).get(`/api/v1/patients/021/fichas/${id}`).set(auth(prof1Token))).status,
    ).toBe(404);

    const invalidEdit = await request(app)
      .put(`${fichas}/${id}`)
      .set(auth(prof1Token))
      .send({ ...valid, scores: { ...valid.scores, ori: 11 } });
    expect(invalidEdit.status).toBe(422);
    const edited = await request(app)
      .put(`${fichas}/${id}`)
      .set(auth(prof1Token))
      .send({ date: '2026-10-16', scores: { ...valid.scores, ate: 3 }, observations: '' });
    expect(edited.body.evaluation).toMatchObject({ id, date: '16/10/2026', total: 23 });
    const afterEdit = await request(app).get(`${fichas}/${id}`).set(auth(prof1Token));
    expect(afterEdit.body).toMatchObject({ dateISO: '2026-10-16', observations: '' });

    const evolution = await request(app)
      .get('/api/v1/patients/014/evolution')
      .set(auth(prof1Token));
    expect(evolution.body.instruments[0].series.at(0)).toEqual({ date: '10/01/2026', total: 30 });
    expect(evolution.body.instruments[0].series.at(-1)).toEqual({ date: '16/10/2026', total: 23 });

    expect((await request(app).delete(`${fichas}/${id}`).set(auth(prof1Token))).status).toBe(204);
    expect((await request(app).delete(`${fichas}/${id}`).set(auth(prof1Token))).status).toBe(404);
    const afterDelete = await request(app).get(fichas).set(auth(prof1Token));
    expect(afterDelete.body.evaluations).toHaveLength(4);
    expect(afterDelete.body.evaluations[0].date).toBe('14/09/2026');
  });

  it('RN-TST-01..04: fichas de outros testes têm regras, evolução, sugestões e rotina próprias', async () => {
    await addSeedPatients();
    // GDS-15: "Sim" em todas = 10 pontos (sintomas depressivos); q1 = "Não" = 11 (grave).
    const gdsAnswers = (overrides: Record<string, number> = {}) => ({
      ...Object.fromEntries([...Array(15)].map((_, index) => [`q${index + 1}`, 1])),
      ...overrides,
    });
    const post = (body: object) =>
      request(app).post('/api/v1/patients/014/fichas').set(auth(prof1Token)).send(body);
    expect(
      (await post({ instrument: 'xyz', date: '2026-10-10', scores: {} })).body.error,
    ).toMatchObject({
      message: 'Selecione um teste válido.',
      field: 'instrument',
    });
    expect(
      (await post({ instrument: 'gds', date: '2026-10-10', scores: gdsAnswers({ q4: 3 }) })).body
        .error.message,
    ).toBe('Responda o item "Você se sente aborrecido com frequência?".');
    const first = await post({ instrument: 'gds', date: '2026-08-01', scores: gdsAnswers() });
    expect(first.status).toBe(201);
    expect(first.body.evaluation).toMatchObject({
      instrument: 'gds',
      total: 10,
      max: 15,
      level: 'attention',
      interpretation: '5 ou mais: indicativo de sintomas depressivos.',
    });
    await post({ instrument: 'gds', date: '2026-10-10', scores: gdsAnswers({ q1: 0 }) });

    const evolution = await request(app)
      .get('/api/v1/patients/014/evolution')
      .set(auth(prof1Token));
    expect(evolution.body.latestInstrument).toBe('gds');
    const gds = evolution.body.instruments.find((item: { key: string }) => item.key === 'gds');
    expect(gds).toMatchObject({
      shortName: 'GDS-15',
      max: 15,
      higherIsBetter: false,
      series: [
        { date: '01/08/2026', total: 10 },
        { date: '10/10/2026', total: 11 },
      ],
      latest: { total: 11, level: 'alert' },
      trend: { kind: 'up', tone: 'bad' },
      delta: { rows: [{ key: 'total', previous: 10, last: 11, max: 15, tone: 'bad' }] },
    });
    const gdsSuggestions = evolution.body.suggestions.filter(
      (item: { instrument: string }) => item.instrument === 'gds',
    );
    expect(gdsSuggestions.map((item: { key: string }) => item.key)).toEqual([
      '014:gds:encaminhamento',
      '014:gds:prazer',
      '014:gds:convivio',
    ]);
    expect(gdsSuggestions[1]).toMatchObject({ fell: true, lastDate: '10/10/2026' });

    await request(app)
      .patch('/api/v1/patients/014/suggestions/014%3Agds%3Aprazer')
      .set(auth(prof1Token))
      .send({ status: 'ok' });
    const routines = await request(app).get('/api/v1/routines').set(auth(prof1Token));
    expect(routines.body.items[0].activities).toEqual([
      expect.objectContaining({ key: '014:gds:prazer', instrument: 'gds' }),
    ]);
    const patients = await request(app).get('/api/v1/patients').set(auth(prof1Token));
    expect(patients.body.items[0]).toMatchObject({
      lastEvaluationDate: '10/10/2026',
      lastResult: { instrument: 'gds', instrumentName: 'GDS-15', total: 11, max: 15 },
      trend: { tone: 'bad' },
    });
    const dashboard = await request(app).get('/api/v1/dashboard/summary').set(auth(prof1Token));
    expect(dashboard.body.todo).toContainEqual(
      expect.objectContaining({
        kind: 'drop',
        text: 'Queda desde a avaliação anterior em: Evocação, Atenção e cálculo, Orientação, GDS-15',
      }),
    );
  });

  it('RN-VIS-01..03: visão geral cruza áreas, lista testes não aplicados e agenda reavaliação', async () => {
    await addSeedPatients();
    const gdsSymptoms = Object.fromEntries([...Array(15)].map((_, index) => [`q${index + 1}`, 1]));
    // Datas no passado distante: a reavaliação fica sempre atrasada, qualquer que seja o dia do teste.
    await request(app)
      .post('/api/v1/patients/014/fichas')
      .set(auth(prof1Token))
      .send({ instrument: 'gds', date: '2025-01-10', scores: gdsSymptoms });
    const overview = await request(app).get('/api/v1/patients/014/overview').set(auth(prof1Token));
    expect(overview.status).toBe(200);
    const [cognition, mood, functional] = overview.body.categories;
    expect(cognition.instruments[0]).toMatchObject({
      key: 'meem',
      latest: { total: 23, date: '14/09/2026' },
      nextDue: '2026-12-14',
    });
    expect(cognition.instruments[1]).toMatchObject({ key: 'moca', latest: null });
    expect(mood.instruments[0]).toMatchObject({
      key: 'gds',
      latest: { total: 10, level: 'attention' },
      nextDue: '2025-04-10',
      overdue: true,
    });
    expect(functional.instruments.every((item: { latest: unknown }) => item.latest === null)).toBe(
      true,
    );
    expect(overview.body.alerts.map((alert: { key: string }) => alert.key)).toEqual([
      'humor-cognicao',
      'avaliar-funcionalidade',
    ]);
    expect(
      (await request(app).get('/api/v1/patients/021/overview').set(auth(prof1Token))).status,
    ).toBe(404);
    const dashboard = await request(app).get('/api/v1/dashboard/summary').set(auth(prof1Token));
    expect(dashboard.body.todo).toContainEqual(
      expect.objectContaining({
        patientId: '014',
        kind: 'reassess',
        text: expect.stringContaining('GDS-15 (prevista para 10/04/2025)'),
        targetTab: 'visao-geral',
      }),
    );
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

  it('RN-ROT-01..02: marca a atividade da rotina por semana e calcula a adesão desde o aceite', async () => {
    await addSeedPatients();
    const [, , , thisWeek] = recentWeeks(todayISO());
    const mark = (key: string, week: string, done: unknown) =>
      request(app)
        .put(`/api/v1/patients/014/routine/${encodeURIComponent(key)}/weeks/${week}`)
        .set(auth(prof1Token))
        .send({ done });
    // Só atividades aceitas na rotina podem ser marcadas.
    expect((await mark('014:evo', thisWeek!, true)).status).toBe(404);
    await request(app)
      .patch('/api/v1/patients/014/suggestions/014%3Aevo')
      .set(auth(prof1Token))
      .send({ status: 'ok' });
    expect((await mark('014:evo', '2020-01-06', true)).body.error.message).toBe(
      'Só é possível marcar as últimas quatro semanas.',
    );
    expect((await mark('014:evo', thisWeek!, 'sim')).status).toBe(422);
    const marked = await mark('014:evo', thisWeek!, true);
    // Aceita nesta semana: só a semana atual entra na conta.
    expect(marked.body).toEqual({
      key: '014:evo',
      weeks: [{ week: thisWeek, done: true }],
      adherence: 1,
    });
    const routines = await request(app).get('/api/v1/routines').set(auth(prof1Token));
    expect(routines.body.items[0].activities[0]).toMatchObject({ key: '014:evo', adherence: 1 });
    const evolution = await request(app)
      .get('/api/v1/patients/014/evolution')
      .set(auth(prof1Token));
    expect(evolution.body.routine[0]).toMatchObject({ weeks: [{ week: thisWeek, done: true }] });
    expect((await mark('014:evo', thisWeek!, false)).body.adherence).toBe(0);
  });

  it('RN-PAT-07: delete cascades aggregate data', async () => {
    await addSeedPatients();
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
      recentDrops: 3,
      routineActivities: 0,
    });
    // Reavaliações atrasadas dependem da data de hoje; aqui só as quedas importam.
    expect(
      summary.body.todo
        .filter((item: { kind: string }) => item.kind === 'drop')
        .map((item: { text: string }) => item.text),
    ).toEqual([
      'Queda desde a avaliação anterior em: Evocação, Atenção e cálculo, Orientação, GDS-15',
      'Queda desde a avaliação anterior em: Katz',
      'Queda desde a avaliação anterior em: Evocação',
    ]);
    // Os pacientes de exemplo têm fichas de todos os nove testes.
    const seeded = await PatientModel.find({}).lean();
    const instruments = new Set(
      seeded.flatMap((patient) => patient.evaluations.map((entry) => entry.instrument)),
    );
    expect([...instruments].sort()).toEqual([
      'cdr',
      'fluencia',
      'gai',
      'gds',
      'katz',
      'meem',
      'moca',
      'pfeffer',
      'relogio',
    ]);
    expect(seeded.every((patient) => patient.evaluations.every((entry) => entry.id))).toBe(true);
  });

  it('migra fichas antigas (data em texto, sem id) para identificador e data real', async () => {
    await PatientModel.collection.insertOne({
      code: '030',
      initials: 'A.A.',
      age: 80,
      responsibleUsername: 'prof1',
      emergencyContact: { name: 'Contato', phone: '3299999999', relationship: 'Filho(a)' },
      vision: 'Sem limitação',
      hearing: 'Sem limitação',
      mobility: 'Sem limitação',
      group: 'Individual',
      suggestionStates: [],
      evaluations: [
        { date: '09/2026', scores: { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 } },
        { date: '17/10/2026 #2', scores: { ori: 8, reg: 3, ate: 4, evo: 2, lin: 8 }, notes: 'Obs' },
      ],
    });
    expect(await migrateEvaluations()).toBe(1);
    expect(await migrateEvaluations()).toBe(0);
    const list = await request(app).get('/api/v1/patients/030/fichas').set(auth(prof1Token));
    expect(list.body.evaluations).toEqual([
      expect.objectContaining({ date: '17/10/2026', instrument: 'meem', total: 25 }),
      expect.objectContaining({ date: '01/09/2026', instrument: 'meem', total: 26 }),
    ]);
    const detail = await request(app)
      .get(`/api/v1/patients/030/fichas/${list.body.evaluations[0].id}`)
      .set(auth(prof1Token));
    expect(detail.body.observations).toBe('Obs');
  });

  it('demo reset responde 404 em produção, mesmo para admin, sem apagar dados', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect((await request(app).post('/api/v1/demo/reset')).status).toBe(404);
      const reset = await request(app).post('/api/v1/demo/reset').set(auth(adminToken));
      expect(reset.status).toBe(404);
      expect(await UserModel.countDocuments({ username: 'admin' })).toBe(1);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
