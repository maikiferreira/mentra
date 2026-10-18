import { randomUUID } from 'node:crypto';
import { getInstrument, type InstrumentKey, type InstrumentScores } from '@mente-ativa/shared';

export const SEED_USERS = [
  { username: 'admin', name: 'Administrador', role: 'admin' as const, password: 'admin' },
  { username: 'prof1', name: 'Profissional 1', role: 'professional' as const, password: 'prof1' },
  { username: 'prof2', name: 'Profissional 2', role: 'professional' as const, password: 'prof2' },
];

// ---------- respostas de exemplo por teste ----------

/** Preenche todos os campos do teste com `value` e aplica as exceções. */
function answers(key: InstrumentKey, value: number, overrides: InstrumentScores = {}) {
  const fields = getInstrument(key)!.fields;
  return { ...Object.fromEntries(fields.map((field) => [field.key, value])), ...overrides };
}
/** GDS-15 com sintomas só nas perguntas informadas (resposta em negrito da ficha). */
function gds(symptomatic: number[]) {
  const fields = getInstrument('gds')!.fields;
  return Object.fromEntries(
    fields.map((field, index) => {
      const scored = field.scoredValue!;
      return [field.key, symptomatic.includes(index + 1) ? scored : 1 - scored];
    }),
  );
}
/** Ansiedade geriátrica com "concordo" só nas afirmações informadas. */
const gai = (agreed: number[]) =>
  answers('gai', 0, Object.fromEntries(agreed.map((item) => [`q${item}`, 1])));

interface SeedEvaluation {
  instrument: InstrumentKey;
  performedOn: string;
  scores: InstrumentScores;
  notes?: string;
}

const MARCO = '2026-03-16';
const JUNHO = '2026-06-15';
const SETEMBRO = '2026-09-14';

export const SEED_PATIENTS = [
  {
    code: '014',
    name: 'Maria Souza',
    initials: 'M.S.',
    age: 78,
    educationYears: 4,
    group: 'Grupo da manhã',
    responsibleUsername: 'prof1',
    objective: 'Manter atenção e memória no dia a dia',
    interests: 'Ex-costureira. Gosta de música antiga e de bordado.',
    vision: 'Leve',
    hearing: 'Sem limitação',
    mobility: 'Sem limitação',
    phone: '(32) 99999-0014',
    address: 'Rua das Flores, 120, Centro, Juiz de Fora - MG',
    emergencyContact: {
      name: 'Contato fictício A',
      phone: '(32) 98888-0014',
      relationship: 'Filho(a)',
    },
    evaluations: [
      {
        instrument: 'meem',
        performedOn: MARCO,
        scores: { ori: 9, reg: 3, ate: 3, evo: 2, lin: 8 },
      },
      {
        instrument: 'meem',
        performedOn: JUNHO,
        scores: { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 },
      },
      { instrument: 'gds', performedOn: JUNHO, scores: gds([2, 6, 9, 10]) },
      {
        instrument: 'meem',
        performedOn: SETEMBRO,
        scores: { ori: 8, reg: 3, ate: 3, evo: 1, lin: 8 },
      },
      {
        instrument: 'gds',
        performedOn: SETEMBRO,
        scores: gds([1, 2, 4, 6, 9, 10, 12]),
        notes: 'Relata desânimo desde a mudança da filha para outra cidade.',
      },
      {
        instrument: 'relogio',
        performedOn: SETEMBRO,
        scores: answers('relogio', 1, { n4: 0, p4: 0, p5: 0, p6: 0, ce1: 0 }),
      },
      {
        instrument: 'pfeffer',
        performedOn: SETEMBRO,
        scores: answers('pfeffer', 0, { dinheiro: 2, remedios: 2, compromissos: 1 }),
      },
      { instrument: 'katz', performedOn: SETEMBRO, scores: answers('katz', 0) },
    ] satisfies SeedEvaluation[],
  },
  {
    code: '021',
    name: 'José Almeida',
    initials: 'J.A.',
    age: 82,
    educationYears: 8,
    group: 'Individual',
    responsibleUsername: 'prof2',
    objective: 'Estimular a linguagem e a atenção',
    interests: 'Aposentado do comércio. Gosta de futebol e de dominó.',
    vision: 'Sem limitação',
    hearing: 'Leve',
    mobility: 'Leve',
    phone: '(32) 99999-0021',
    address: 'Av. Exemplo, 455, apto 302, São Mateus, Juiz de Fora - MG',
    emergencyContact: {
      name: 'Contato fictício B',
      phone: '(32) 98888-0021',
      relationship: 'Cônjuge',
    },
    evaluations: [
      {
        instrument: 'meem',
        performedOn: MARCO,
        scores: { ori: 8, reg: 2, ate: 2, evo: 1, lin: 7 },
      },
      {
        instrument: 'meem',
        performedOn: JUNHO,
        scores: { ori: 8, reg: 3, ate: 2, evo: 1, lin: 7 },
      },
      { instrument: 'katz', performedOn: JUNHO, scores: answers('katz', 0) },
      {
        instrument: 'meem',
        performedOn: SETEMBRO,
        scores: { ori: 8, reg: 3, ate: 3, evo: 1, lin: 7 },
      },
      {
        instrument: 'moca',
        performedOn: SETEMBRO,
        scores: { vis: 3, nom: 3, ate: 4, lin: 2, abs: 1, evo: 2, ori: 6, esc: 1 },
      },
      { instrument: 'fluencia', performedOn: SETEMBRO, scores: { f: 5, a: 4, s: 6, animais: 9 } },
      { instrument: 'gai', performedOn: SETEMBRO, scores: gai([1, 2, 6, 8, 14]) },
      {
        instrument: 'katz',
        performedOn: SETEMBRO,
        scores: answers('katz', 0, { banho: 1 }),
        notes: 'Passou a precisar de ajuda para lavar as costas após a queda em agosto.',
      },
    ] satisfies SeedEvaluation[],
  },
  {
    code: '009',
    name: 'Rosa Lima',
    initials: 'R.L.',
    age: 74,
    educationYears: 11,
    group: 'Grupo da tarde',
    responsibleUsername: 'prof1',
    objective: 'Preservar a atenção e a evocação',
    interests: 'Professora aposentada. Gosta de leitura e de jardinagem.',
    vision: 'Leve',
    hearing: 'Sem limitação',
    mobility: 'Sem limitação',
    phone: '(32) 99999-0009',
    address: 'Rua Modelo, 87, Santa Helena, Juiz de Fora - MG',
    emergencyContact: {
      name: 'Contato fictício C',
      phone: '(32) 98888-0009',
      relationship: 'Neto(a)',
    },
    evaluations: [
      {
        instrument: 'meem',
        performedOn: MARCO,
        scores: { ori: 10, reg: 3, ate: 5, evo: 2, lin: 8 },
      },
      {
        instrument: 'meem',
        performedOn: JUNHO,
        scores: { ori: 10, reg: 3, ate: 4, evo: 3, lin: 8 },
      },
      {
        instrument: 'meem',
        performedOn: SETEMBRO,
        scores: { ori: 10, reg: 3, ate: 4, evo: 2, lin: 8 },
      },
      { instrument: 'cdr', performedOn: SETEMBRO, scores: answers('cdr', 0, { memoria: 0.5 }) },
      { instrument: 'gds', performedOn: SETEMBRO, scores: gds([9, 10]) },
      {
        instrument: 'pfeffer',
        performedOn: SETEMBRO,
        scores: answers('pfeffer', 0, { compromissos: 1 }),
      },
    ] satisfies SeedEvaluation[],
  },
];

/** Documento pronto para gravar: cada ficha recebe identificador e data real. */
export function seedPatientDocument(patient: (typeof SEED_PATIENTS)[number]) {
  return {
    ...patient,
    evaluations: patient.evaluations.map((entry: SeedEvaluation, index) => {
      const performedOn = new Date(`${entry.performedOn}T00:00:00Z`);
      return {
        id: randomUUID(),
        instrument: entry.instrument,
        performedOn,
        scores: entry.scores,
        notes: entry.notes ?? null,
        // Cadastro no dia da avaliação, na ordem da lista.
        createdAt: new Date(performedOn.getTime() + index * 1000),
      };
    }),
    suggestionStates: [],
  };
}
