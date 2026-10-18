import { describe, expect, it } from 'vitest';
import { getInstrument, type InstrumentKey, type InstrumentScores } from './instruments';
import { addMonths, patientOverview, type OverviewEvaluation } from './overview';

const answers = (key: InstrumentKey, value: number, overrides: InstrumentScores = {}) => ({
  ...Object.fromEntries(getInstrument(key)!.fields.map((field) => [field.key, value])),
  ...overrides,
});
const ficha = (instrument: InstrumentKey, dateISO: string, scores: InstrumentScores) => ({
  instrument,
  dateISO,
  date: dateISO.split('-').reverse().join('/'),
  scores,
});
const meemLow = { ori: 7, reg: 3, ate: 3, evo: 1, lin: 7 }; // 21: abaixo do corte para 8 anos
const meemOk = { ori: 10, reg: 3, ate: 5, evo: 3, lin: 9 };
const overview = (evaluations: OverviewEvaluation[], today = '2026-10-18') =>
  patientOverview(evaluations, { educationYears: 8 }, today);
const alertKeys = (evaluations: OverviewEvaluation[]) =>
  overview(evaluations).alerts.map((alert) => alert.key);

describe('visão integrada do paciente', () => {
  it('agrupa o último resultado de cada teste por área, inclusive os não aplicados', () => {
    const result = overview([
      ficha('meem', '2026-03-10', meemOk),
      ficha('meem', '2026-09-10', meemLow),
      ficha('gds', '2026-09-10', answers('gds', 1)),
    ]);
    expect(result.categories.map((category) => category.name)).toEqual([
      'Cognição',
      'Humor',
      'Funcionalidade',
    ]);
    const [meem, moca] = result.categories[0]!.instruments;
    expect(meem).toMatchObject({
      shortName: 'MEEM',
      latest: { total: 21, level: 'attention', date: '10/09/2026' },
      trend: { tone: 'bad' },
    });
    expect(moca).toMatchObject({ shortName: 'MoCA', latest: null, nextDue: null, overdue: false });
  });

  it('agenda a reavaliação em 6 meses (esperado) ou 3 meses (atenção) e marca atrasos', () => {
    const result = overview([
      ficha('meem', '2026-03-10', meemOk),
      ficha('gds', '2026-06-30', answers('gds', 1)),
    ]);
    const meem = result.categories[0]!.instruments[0]!;
    const gds = result.categories[1]!.instruments[0]!;
    expect(meem).toMatchObject({ nextDue: '2026-09-10', overdue: true });
    expect(gds).toMatchObject({ nextDue: '2026-09-30', overdue: true });
    expect(
      overview([ficha('meem', '2026-09-10', meemOk)]).categories[0]!.instruments[0],
    ).toMatchObject({
      nextDue: '2027-03-10',
      overdue: false,
    });
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('cruza humor e cognição alterados, como no estudo de caso do e-book', () => {
    const result = overview([
      ficha('meem', '2026-09-10', meemLow),
      ficha('gds', '2026-09-10', answers('gds', 1)),
      ficha('katz', '2026-09-10', answers('katz', 0)),
    ]);
    expect(result.alerts[0]).toMatchObject({
      key: 'humor-cognicao',
      level: 'attention',
      text: 'GDS-15 indica sintomas que podem estar piorando o desempenho em MEEM. Vale cuidar do humor e reavaliar a cognição depois.',
      instruments: ['gds', 'meem'],
    });
  });

  it('sugere avaliar humor e funcionalidade quando a cognição está alterada e eles faltam', () => {
    expect(alertKeys([ficha('meem', '2026-09-10', meemLow)])).toEqual([
      'avaliar-humor',
      'avaliar-funcionalidade',
    ]);
    expect(alertKeys([ficha('meem', '2026-09-10', meemOk)])).toEqual([]);
  });

  it('alerta impacto funcional e pede a CDR quando ainda não foi aplicada', () => {
    const alerts = overview([
      ficha('meem', '2026-09-10', meemLow),
      ficha('gds', '2026-09-10', answers('gds', 0)),
      ficha('katz', '2026-09-10', answers('katz', 0, { banho: 1 })),
    ]).alerts;
    expect(alerts.map((alert) => alert.key)).toEqual(['humor-cognicao', 'cognicao-funcionalidade']);
    expect(alerts[1]!.text).toContain('Considere aplicar a CDR');
  });

  it('Pfeffer alterado com Katz preservado aponta funções executivas', () => {
    expect(
      alertKeys([
        ficha('pfeffer', '2026-09-10', answers('pfeffer', 1)),
        ficha('katz', '2026-09-10', answers('katz', 0)),
      ]),
    ).toEqual(['instrumentais-executivas']);
  });
});
