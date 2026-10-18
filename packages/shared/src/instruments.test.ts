import { describe, expect, it } from 'vitest';
import {
  INSTRUMENTS,
  evaluateInstrument,
  generatePatientSuggestions,
  getInstrument,
  instrumentTrend,
  validateInstrumentScores,
  type InstrumentKey,
  type InstrumentScores,
} from './instruments';

const definition = (key: InstrumentKey) => getInstrument(key)!;
const result = (key: InstrumentKey, scores: InstrumentScores, educationYears: number | null = 8) =>
  evaluateInstrument(definition(key), scores, { educationYears });
/** Responde todos os itens de escolha com o mesmo valor, sobrescrevendo alguns. */
const answers = (key: InstrumentKey, value: number, overrides: InstrumentScores = {}) => ({
  ...Object.fromEntries(definition(key).fields.map((field) => [field.key, value])),
  ...overrides,
});

describe('catálogo de testes (e-book de rastreio)', () => {
  it('organiza os nove testes em Cognição, Humor e Funcionalidade', () => {
    expect(INSTRUMENTS.map((entry) => `${entry.category}:${entry.key}`)).toEqual([
      'cognicao:meem',
      'cognicao:moca',
      'cognicao:relogio',
      'cognicao:fluencia',
      'humor:gds',
      'humor:gai',
      'funcionalidade:pfeffer',
      'funcionalidade:katz',
      'funcionalidade:cdr',
    ]);
  });

  it('MEEM usa a nota de corte por escolaridade', () => {
    const scores = { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 }; // 26
    expect(result('meem', scores, 0).level).toBe('ok');
    expect(result('meem', scores, 6)).toMatchObject({ total: 26, level: 'attention' });
    expect(result('meem', scores, 6).label).toContain('26,5');
    expect(result('meem', scores, null).level).toBe('info');
  });

  it('MoCA soma 1 ponto de escolaridade, limita a 30 e alerta abaixo de 26', () => {
    const full = { vis: 5, nom: 3, ate: 6, lin: 3, abs: 2, evo: 5, ori: 6 };
    expect(result('moca', { ...full, esc: 1 }).total).toBe(30);
    expect(result('moca', { ...full, evo: 1, esc: 1 })).toMatchObject({
      total: 27,
      level: 'ok',
    });
    expect(result('moca', { ...full, evo: 0, esc: 0 })).toMatchObject({
      total: 25,
      level: 'attention',
    });
  });

  it('Teste do Relógio: 11 ou menos indica prejuízo', () => {
    expect(result('relogio', answers('relogio', 1)).total).toBe(15);
    expect(result('relogio', answers('relogio', 1, { n1: 0, n2: 0, n3: 0 })).level).toBe('ok');
    expect(result('relogio', answers('relogio', 1, { n1: 0, n2: 0, n3: 0, n4: 0 }))).toMatchObject({
      total: 11,
      level: 'attention',
    });
  });

  it('Fluência verbal compara F+A+S e animais com o corte da escolaridade', () => {
    const scores = { f: 6, a: 6, s: 7, animais: 9 }; // F+A+S = 19
    expect(result('fluencia', scores, 3).level).toBe('ok');
    expect(result('fluencia', scores, 5).label).toContain('F+A+S abaixo de 20');
    expect(result('fluencia', scores, 10).label).toBe(
      'Possível comprometimento: F+A+S abaixo de 23 e animais abaixo de 13 para a escolaridade.',
    );
    expect(result('fluencia', scores, null).level).toBe('info');
  });

  it('GDS-15 pontua as respostas em negrito: 5+ sintomas, 11+ depressão grave', () => {
    // "Sim" em todas: as questões 1, 5, 7, 11 e 13 pontuam no "Não".
    expect(result('gds', answers('gds', 1)).total).toBe(10);
    expect(result('gds', answers('gds', 0)).total).toBe(5);
    expect(result('gds', answers('gds', 0)).level).toBe('attention');
    expect(result('gds', answers('gds', 1, { q1: 0 })).level).toBe('alert');
    expect(
      result('gds', answers('gds', 1, { q2: 0, q3: 0, q4: 0, q6: 0, q8: 0, q9: 0 })),
    ).toMatchObject({
      total: 4,
      level: 'ok',
    });
  });

  it('Ansiedade geriátrica soma os "concordo": 13 ou mais é indício', () => {
    const twelve = answers(
      'gai',
      0,
      Object.fromEntries([...Array(12)].map((_, i) => [`q${i + 1}`, 1])),
    );
    expect(result('gai', twelve)).toMatchObject({ total: 12, level: 'ok' });
    expect(result('gai', { ...twelve, q13: 1 })).toMatchObject({ total: 13, level: 'attention' });
  });

  it('Pfeffer: acima de 6 indica maior dependência', () => {
    expect(result('pfeffer', answers('pfeffer', 0, { dinheiro: 3, remedios: 3 }))).toMatchObject({
      total: 6,
      level: 'ok',
    });
    expect(
      result('pfeffer', answers('pfeffer', 0, { dinheiro: 3, remedios: 3, compras: 1 })).level,
    ).toBe('attention');
  });

  it('Katz conta as atividades com independência (I)', () => {
    expect(result('katz', answers('katz', 0))).toMatchObject({ total: 6, level: 'ok' });
    expect(result('katz', answers('katz', 0, { banho: 1 }))).toMatchObject({
      total: 5,
      level: 'attention',
      label: 'Dependência em 1 atividade básica.',
    });
    expect(result('katz', answers('katz', 0, { banho: 2, vestuario: 1 })).level).toBe('alert');
  });

  it('CDR: o escore global é o do domínio mais pontuado', () => {
    expect(result('cdr', answers('cdr', 0))).toMatchObject({ total: 0, level: 'ok' });
    expect(result('cdr', answers('cdr', 0, { memoria: 0.5 }))).toMatchObject({
      total: 0.5,
      level: 'attention',
    });
    expect(result('cdr', answers('cdr', 0.5, { cuidados: 0, lar: 2 })).label).toBe(
      'CDR 2: Demência moderada (classificação da escala).',
    );
  });

  it('valida campos obrigatórios, limites e opções válidas', () => {
    expect(validateInstrumentScores(definition('gds'), answers('gds', 1))).toHaveProperty('scores');
    expect(validateInstrumentScores(definition('gds'), answers('gds', 1, { q3: 2 }))).toEqual({
      error: 'Responda o item "Você sente que sua vida está vazia?".',
    });
    expect(validateInstrumentScores(definition('moca'), { vis: 6 })).toEqual({
      error:
        'A pontuação de "Visuoespacial e executiva (sequência, cubo e relógio)" deve ser um número inteiro entre 0 e 5.',
    });
    expect(validateInstrumentScores(definition('fluencia'), { f: 100 })).toEqual({
      error:
        'A pontuação de "Letra F (acertos em 1 minuto)" deve ser um número inteiro entre 0 e 99.',
    });
    expect(
      validateInstrumentScores(definition('cdr'), answers('cdr', 0, { cuidados: 0.5 })),
    ).toEqual({ error: 'Responda o item "Cuidados pessoais".' });
  });

  it('tendência considera se subir é melhora ou piora', () => {
    expect(instrumentTrend([20, 23], true)).toMatchObject({ kind: 'up', tone: 'good' });
    expect(instrumentTrend([4, 7], false)).toMatchObject({
      kind: 'up',
      tone: 'bad',
      label: '▲ subiu 3',
    });
    expect(instrumentTrend([1, 0.5], false)).toMatchObject({ tone: 'good', label: '▼ caiu 0,5' });
  });
});

describe('sugestões de rotina por teste', () => {
  const suggest = (key: InstrumentKey, scoresList: InstrumentScores[], educationYears = 8) =>
    generatePatientSuggestions({
      id: '014',
      educationYears,
      evaluations: scoresList.map((scores, index) => ({
        date: `0${index + 1}/10/2026`,
        instrument: key,
        scores,
      })),
    });

  it('MEEM mantém as chaves e regras originais', () => {
    const keys = suggest('meem', [
      { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 },
      { ori: 8, reg: 3, ate: 3, evo: 1, lin: 8 },
    ]).map((entry) => entry.key);
    expect(keys).toEqual(['014:evo', '014:ate', '014:ori']);
  });

  it('MoCA abaixo de 26 sugere as seções com maior perda', () => {
    const suggestions = suggest('moca', [
      { vis: 5, nom: 3, ate: 6, lin: 3, abs: 0, evo: 1, ori: 6, esc: 1 },
    ]);
    expect(suggestions.map((entry) => entry.key)).toEqual(['014:moca:abs', '014:moca:evo']);
    expect(suggestions[0]!.why).toBe(
      'MoCA: 25/30 em 01/10/2026. Abaixo de 26: sugere comprometimento cognitivo leve. Ponto de atenção: Abstração: 0/2.',
    );
  });

  it('GDS grave sugere encaminhamento antes das atividades; resultado normal sugere manter', () => {
    expect(suggest('gds', [answers('gds', 1, { q1: 0 })]).map((entry) => entry.key)).toEqual([
      '014:gds:encaminhamento',
      '014:gds:prazer',
      '014:gds:convivio',
    ]);
    const keep = suggest('gds', [answers('gds', 1, { q2: 0, q3: 0, q4: 0, q6: 0, q8: 0, q9: 0 })]);
    expect(keep).toHaveLength(1);
    expect(keep[0]).toMatchObject({ key: '014:gds:manter', fell: false });
  });

  it('Pfeffer prioriza as atividades em que o idoso precisa de ajuda', () => {
    const keys = suggest('pfeffer', [
      answers('pfeffer', 0, { remedios: 3, dinheiro: 2, compras: 1, comida: 1 }),
    ]).map((entry) => entry.key);
    expect(keys).toEqual(['014:pfeffer:remedios', '014:pfeffer:dinheiro', '014:pfeffer:compras']);
  });

  it('Katz e CDR sugerem os itens mais comprometidos e marcam piora', () => {
    const katz = suggest('katz', [
      answers('katz', 0),
      answers('katz', 0, { banho: 1, alimentacao: 2 }),
    ]);
    expect(katz.map((entry) => entry.key)).toEqual(['014:katz:alimentacao', '014:katz:banho']);
    expect(katz[0]).toMatchObject({ fell: true, lastDate: '02/10/2026' });
    expect(katz[0]!.why).toContain('Piorou desde a avaliação anterior (6/6 em 01/10/2026).');
    const cdr = suggest('cdr', [answers('cdr', 0, { memoria: 1, orientacao: 0.5 })]);
    expect(cdr.map((entry) => entry.key)).toEqual(['014:cdr:memoria', '014:cdr:orientacao']);
  });

  it('Relógio e Fluência só sugerem atividades abaixo da nota de corte', () => {
    expect(
      suggest('relogio', [answers('relogio', 1, { p1: 0, p2: 0, p3: 0, ce1: 0 })]).map(
        (entry) => entry.key,
      ),
    ).toEqual(['014:relogio:centro', '014:relogio:ponteiros']);
    expect(suggest('fluencia', [{ f: 3, a: 3, s: 3, animais: 12 }], 5).map((e) => e.key)).toEqual([
      '014:fluencia:fonemica',
    ]);
  });

  it('cada atividade sugerida existe para todas as áreas de cada teste', () => {
    for (const entry of INSTRUMENTS.filter((item) => item.key !== 'meem')) {
      expect(entry.maintain.title).toBeTruthy();
      for (const activity of Object.values(entry.activities)) expect(activity.text).toBeTruthy();
    }
  });
});
