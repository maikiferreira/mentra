export const MEEM_DOMAINS = [
  { key: 'ori', name: 'Orientação', max: 10 },
  { key: 'reg', name: 'Memória imediata', max: 3 },
  { key: 'ate', name: 'Atenção e cálculo', max: 5 },
  { key: 'evo', name: 'Evocação', max: 3 },
  { key: 'lin', name: 'Linguagem', max: 9 },
] as const;

export type MeemDomainKey = (typeof MEEM_DOMAINS)[number]['key'];

export const PATIENT_GROUPS = ['Individual', 'Grupo da manhã', 'Grupo da tarde'] as const;
export const LIMITATIONS = ['Sem limitação', 'Leve', 'Importante'] as const;
export const EMERGENCY_RELATIONSHIPS = [
  'Filho(a)',
  'Cônjuge',
  'Irmão(ã)',
  'Neto(a)',
  'Sobrinho(a)',
  'Cuidador(a)',
  'Outro',
] as const;
export const TRIAL_PROFILES = [
  'Gerontólogo(a)',
  'Educador(a) físico(a)',
  'Fisioterapeuta',
  'Terapeuta ocupacional',
  'Psicólogo(a)',
  'Cuidador(a) ou familiar',
  'Outro',
] as const;

export const PRODUCT_PRINCIPLE =
  'A tecnologia sugere. O profissional decide. As sugestões não são diagnóstico nem prescrição.';
export const MEEM_LABEL = 'Instrumento de exemplo: MEEM (0 a 30)';

export * from './care-planning.js';
export * from './instruments.js';
export * from './overview.js';
export * from './routine.js';
export * from './patients.js';
export * from './billing.js';
export type * from './contracts.js';
