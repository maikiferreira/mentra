export type PlanId = 'monthly' | 'annual';
export type SubscriptionStatus = 'trialing' | 'incomplete' | 'active' | 'past_due' | 'canceled';

export interface PlanDefinition {
  id: PlanId;
  label: string;
  subtitle: string;
  priceCents: number;
  interval: 'month' | 'year';
  monthlyEquivalentCents?: number;
  discountPercent?: number;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  monthly: {
    id: 'monthly',
    label: 'Mensal',
    subtitle: 'Assinatura mensal',
    priceCents: 4990,
    interval: 'month',
  },
  annual: {
    id: 'annual',
    label: 'Anual',
    subtitle: 'Assinatura anual',
    priceCents: 53892,
    interval: 'year',
    monthlyEquivalentCents: 4491,
    discountPercent: 10,
  },
};
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const PLAN_BENEFITS = [
  'Acesso completo à plataforma',
  'Pacientes ilimitados',
  'Fichas e evoluções',
  'Rotinas de atividades',
  'Suporte por e-mail',
] as const;

export const TRIAL_DAYS = 7;
export const PAST_DUE_GRACE_DAYS = 3;

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === 'string' && Object.hasOwn(PLANS, value);

/** Formata centavos como "R$ 1.234,56" (com espaço comum, não o NBSP do Intl). */
export function formatBRL(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const [integer = '0', decimals = '00'] = (Math.abs(cents) / 100).toFixed(2).split('.');
  return `${sign}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals}`;
}
