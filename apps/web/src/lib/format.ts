import { type ResultLevel, type TrendResult } from '@mente-ativa/shared';

export const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export const formatScore = (value: number) => String(value).replace('.', ',');

export const scoreText = (total: number, max: number | null) =>
  max === null ? formatScore(total) : `${formatScore(total)}/${formatScore(max)}`;

export const LEVEL_CHIP: Record<ResultLevel, string> = {
  ok: 'up',
  attention: 'warn',
  alert: 'down',
  info: '',
};

export const LEVEL_NAME: Record<ResultLevel, string> = {
  ok: 'Esperado',
  attention: 'Atenção',
  alert: 'Alerta',
  info: 'Sem referência',
};

export const TONE_CHIP: Record<TrendResult['tone'], string> = {
  good: 'up',
  bad: 'down',
  neutral: '',
};

/** Quantidades sem máximo próprio no teste (ex.: palavras em 1 minuto). */
export const MAX_COUNT = 99;
