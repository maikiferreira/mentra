import { PAST_DUE_GRACE_DAYS, type SubscriptionStatus } from '@mente-ativa/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AccessUser {
  role: 'admin' | 'professional';
  origin: 'seed' | 'signup' | 'trial';
  trialEndsAt?: Date | null | undefined;
}
export interface AccessSubscription {
  status: SubscriptionStatus;
  currentPeriodEnd?: Date | null | undefined;
  pastDueSince?: Date | null | undefined;
}
export type AccessReason =
  | 'exempt'
  | 'trial'
  | 'active'
  | 'grace_period'
  | 'canceled_until_period_end'
  | 'trial_expired'
  | 'no_subscription'
  | 'past_due'
  | 'canceled'
  | 'incomplete';
export interface AccessDecision {
  hasAccess: boolean;
  reason: AccessReason;
}

export const isExempt = (user: AccessUser) => user.role === 'admin' || user.origin === 'seed';

/** RN-PAY-04/RN-PAY-06: decide se o usuário pode usar a plataforma agora. */
export function hasActiveAccess(
  user: AccessUser,
  subscription: AccessSubscription | null | undefined,
  now: Date,
): AccessDecision {
  if (isExempt(user)) return { hasAccess: true, reason: 'exempt' };
  if (user.trialEndsAt && user.trialEndsAt.getTime() > now.getTime())
    return { hasAccess: true, reason: 'trial' };
  if (subscription) {
    const { status, currentPeriodEnd, pastDueSince } = subscription;
    // "trialing" só existiria com trial configurado no Stripe; vale como assinatura em dia.
    if (status === 'active' || status === 'trialing') return { hasAccess: true, reason: 'active' };
    if (status === 'past_due') {
      const since = pastDueSince ?? now;
      return now.getTime() - since.getTime() <= PAST_DUE_GRACE_DAYS * DAY_MS
        ? { hasAccess: true, reason: 'grace_period' }
        : { hasAccess: false, reason: 'past_due' };
    }
    if (status === 'canceled')
      return currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
        ? { hasAccess: true, reason: 'canceled_until_period_end' }
        : { hasAccess: false, reason: 'canceled' };
    if (status === 'incomplete' && user.origin !== 'trial')
      return { hasAccess: false, reason: 'incomplete' };
  }
  return user.trialEndsAt || user.origin === 'trial'
    ? { hasAccess: false, reason: 'trial_expired' }
    : { hasAccess: false, reason: 'no_subscription' };
}

/** Dias inteiros (arredondados para cima) que faltam no teste grátis; 0 quando acabou. */
export function trialDaysLeft(user: Pick<AccessUser, 'trialEndsAt'>, now: Date): number {
  if (!user.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}
