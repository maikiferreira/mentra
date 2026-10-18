import { describe, expect, it } from 'vitest';
import {
  calculateDomainFlags,
  calculateTrend,
  firstNameUsername,
  generateMagicOzFicha,
  generateSuggestions,
  nextPatientCode,
  totalScore,
  uniqueDate,
  uniqueUsername,
  type Evaluation,
  type MeemScores,
  type PatientForPlanning,
} from './care-planning';

const seed014: Evaluation[] = [
  { date: '03/2026', scores: { ori: 9, reg: 3, ate: 3, evo: 2, lin: 8 } },
  { date: '06/2026', scores: { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 } },
  { date: '09/2026', scores: { ori: 8, reg: 3, ate: 3, evo: 1, lin: 8 } },
];
const seed021: Evaluation[] = [
  { date: '03/2026', scores: { ori: 8, reg: 2, ate: 2, evo: 1, lin: 7 } },
  { date: '06/2026', scores: { ori: 8, reg: 3, ate: 2, evo: 1, lin: 7 } },
  { date: '09/2026', scores: { ori: 8, reg: 3, ate: 3, evo: 1, lin: 7 } },
];
const seed009: Evaluation[] = [
  { date: '03/2026', scores: { ori: 10, reg: 3, ate: 5, evo: 2, lin: 8 } },
  { date: '06/2026', scores: { ori: 10, reg: 3, ate: 4, evo: 3, lin: 8 } },
  { date: '09/2026', scores: { ori: 10, reg: 3, ate: 4, evo: 2, lin: 8 } },
];

function patient(id: string, evaluations: Evaluation[], generationCursor = 0): PatientForPlanning {
  return { id, evaluations, generationCursor };
}

function scores(ori: number, reg: number, ate: number, evo: number, lin: number): MeemScores {
  return { ori, reg, ate, evo, lin };
}

describe('domínio puro do planejamento e utilitários', () => {
  it('RN-EVO-01: calcula tendência sem avaliações, primeira, queda, alta e estabilidade', () => {
    expect(calculateTrend([])).toEqual({ kind: 'none', label: 'sem avaliações', delta: null });
    expect(calculateTrend([seed014[0]!])).toEqual({
      kind: 'first',
      label: 'primeira avaliação',
      delta: null,
    });
    expect(calculateTrend(seed014).label).toBe('▼ caiu 3');
    expect(calculateTrend(seed021).label).toBe('▲ subiu 1');

    const stable = [
      { date: 'a', scores: scores(5, 1, 2, 1, 4) },
      { date: 'b', scores: scores(5, 1, 2, 1, 4) },
    ];
    expect(calculateTrend(stable)).toEqual({ kind: 'stable', label: '● estável', delta: 0 });
  });

  it('RN-EVO-02: encontra flags, primeira data de pico e ordenação normalizada até três', () => {
    const flags014 = calculateDomainFlags(seed014);
    expect(flags014.map((flag) => flag.domain.key)).toEqual(['evo', 'ate', 'ori']);
    expect(flags014.map((flag) => flag.score)).toEqual([1 / 3, 0.2, 0.1]);
    expect(flags014.every((flag) => flag.fell)).toBe(true);

    const flags009 = calculateDomainFlags(seed009);
    expect(flags009.map((flag) => flag.domain.key)).toEqual(['evo', 'ate']);
    expect(flags009[0]).toMatchObject({ peak: 3, peakDate: '06/2026', last: 2, fell: true });
    expect(flags009[1]).toMatchObject({ peak: 5, peakDate: '03/2026', last: 4, fell: false });
  });

  it('RN-EVO-03: gera linha de base, manter e desafiar e sugestões seed 014 com ordem/textos', () => {
    expect(generateSuggestions({ id: 'novo', evaluations: [] })).toEqual([]);
    expect(generateSuggestions({ id: 'novo', evaluations: [seed014[0]!] })).toMatchObject([
      {
        key: 'novo:base',
        activity: { title: 'Linha de base: atividades de dificuldade média' },
        why: 'Primeira avaliação registrada em 03/2026. A comparação com avaliações anteriores começa na próxima ficha.',
        sources: ['03/2026'],
      },
    ]);
    expect(generateSuggestions({ id: '021', evaluations: seed021 })).toMatchObject([
      {
        key: '021:keep',
        activity: { title: 'Manter e desafiar' },
        why: 'Nenhum domínio ficou abaixo do melhor resultado registrado. O total passou de 20 em 03/2026 para 22 em 09/2026.',
      },
    ]);

    const suggestions014 = generateSuggestions({ id: '014', evaluations: seed014 });
    expect(suggestions014.map((suggestion) => suggestion.activity.title)).toEqual([
      'Evocação tardia com histórias de vida',
      'Atenção sustentada: cancelamento de figuras',
      'Ritual de orientação no início da sessão',
    ]);
    expect(suggestions014.map((suggestion) => suggestion.why)).toEqual([
      'Evocação: melhor resultado 2/3 em 03/2026, agora 1/3 em 09/2026 (caiu desde a avaliação anterior).',
      'Atenção e cálculo: melhor resultado 4/5 em 06/2026, agora 3/5 em 09/2026 (caiu desde a avaliação anterior).',
      'Orientação: melhor resultado 9/10 em 03/2026, agora 8/10 em 09/2026 (caiu desde a avaliação anterior).',
    ]);
  });

  it('RN-FIC-03: gera a primeira ficha do paciente sem avaliações sem avançar cursor', () => {
    const newPatient = patient('022', [], 0);
    const ficha = generateMagicOzFicha(newPatient, '17/10/2026');

    expect(ficha).toEqual({
      date: '17/10/2026',
      scores: scores(9, 3, 4, 2, 8),
      writtenTotal: 26,
      flag: 'ate',
      observations: 'Primeira avaliação. Colaborou bem durante a sessão.',
    });
    expect(newPatient.generationCursor).toBe(0);
  });

  it('RN-FIC-03: aplica roteiro 014 no primeiro envio e avança cursor', () => {
    const existingPatient = patient('014', seed014, 0);
    const ficha = generateMagicOzFicha(existingPatient, '17/10/2026');

    expect(ficha.scores).toEqual(scores(8, 3, 2, 1, 8));
    expect(ficha.flag).toBe('ate');
    expect(ficha.writtenTotal).toBe(22);
    expect(ficha.observations).toBe(
      'Relata cansaço e esquecimento de recados. Participou do jogo de pares.',
    );
    expect(existingPatient.generationCursor).toBe(1);
  });

  it('RN-EVO-01 e RN-EVO-03: paciente 014 após confirmar ficha tem queda de 1 e sugestões esperadas', () => {
    const evaluations = [...seed014, { date: '17/10/2026', scores: scores(8, 3, 2, 1, 8) }];
    expect(calculateTrend(evaluations)).toMatchObject({ kind: 'down', label: '▼ caiu 1' });
    expect(
      generateSuggestions({ id: '014', evaluations }).map((suggestion) => suggestion.domain),
    ).toEqual(['ate', 'evo', 'ori']);
    expect(generateSuggestions({ id: '014', evaluations })[0]).toMatchObject({
      fell: true,
      lastDate: '17/10/2026',
    });
  });

  it('RN-FIC-03: segundo envio de paciente novo aplica o primeiro passo do roteiro padrão', () => {
    const firstEvaluation: Evaluation = {
      date: '17/10/2026',
      scores: scores(9, 3, 4, 2, 8),
    };
    const newPatient = patient('022', [firstEvaluation], 0);
    const ficha = generateMagicOzFicha(newPatient, '18/10/2026');

    expect(ficha.scores).toEqual(scores(9, 3, 3, 2, 8));
    expect(ficha.flag).toBe('ate');
    expect(ficha.writtenTotal).toBe(25);
  });

  it('RN-FIC-01: garante data única com sufixos crescentes', () => {
    expect(uniqueDate([], '17/10/2026')).toBe('17/10/2026');
    expect(uniqueDate([{ date: '17/10/2026' }, { date: '17/10/2026 #2' }], '17/10/2026')).toBe(
      '17/10/2026 #3',
    );
  });

  it('RN-PAT-03: gera código sequencial de três dígitos após o maior código', () => {
    expect(nextPatientCode(['014', '021', '009'])).toBe('022');
    expect(nextPatientCode([])).toBe('001');
  });

  it('RN-LEAD-03: normaliza primeiro nome sem acentos e cria username único crescente', () => {
    expect(firstNameUsername('  Ágata Souza  ')).toBe('agata');
    expect(firstNameUsername('!!! Lima')).toBe('usuario');
    expect(uniqueUsername('agata', ['agata'])).toBe('agata2');
    expect(uniqueUsername('agata', ['agata', 'agata2'])).toBe('agata3');
  });

  it('RN-EVO-02: mantém ordem dos domínios para flags empatados e no máximo três resultados', () => {
    const evaluations: Evaluation[] = [
      { date: 'a', scores: scores(10, 3, 5, 3, 9) },
      { date: 'b', scores: scores(9, 2, 4, 2, 8) },
      { date: 'c', scores: scores(9, 2, 4, 2, 8) },
    ];
    const flags = calculateDomainFlags(evaluations);
    expect(flags).toHaveLength(3);
    expect(flags.map((flag) => flag.domain.key)).toEqual(['reg', 'evo', 'ate']);
  });

  it('RN-FIC-03: total calculado é a soma dos domínios', () => {
    expect(totalScore(scores(9, 3, 4, 2, 8))).toBe(26);
  });
});
