import { describe, expect, it } from 'vitest';
import { recentWeeks, routineAdherence, weekStart } from './routine';

describe('acompanhamento semanal da rotina', () => {
  it('identifica a semana pela segunda-feira', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // domingo
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // segunda
    expect(weekStart('2026-10-01')).toBe('2026-09-28');
  });

  it('lista as últimas quatro semanas, da mais antiga para a atual', () => {
    expect(recentWeeks('2026-10-18')).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
  });

  it('calcula a adesão só desde a semana em que a atividade foi aceita', () => {
    expect(routineAdherence(['2026-09-28', '2026-10-12'], '2026-10-18', null)).toMatchObject({
      adherence: 0.5,
    });
    const recent = routineAdherence(['2026-10-12'], '2026-10-18', '2026-10-07');
    expect(recent.weeks).toEqual([
      { week: '2026-10-05', done: false },
      { week: '2026-10-12', done: true },
    ]);
    expect(recent.adherence).toBe(0.5);
  });
});
