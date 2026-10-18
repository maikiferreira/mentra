import { describe, expect, it } from 'vitest';
import { hasActiveAccess, trialDaysLeft, type AccessUser } from './access-policy.js';

const now = new Date('2026-10-18T12:00:00Z');
const days = (amount: number) => new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
const signup: AccessUser = { role: 'professional', origin: 'signup' };
const trial = (endsInDays: number): AccessUser => ({
  role: 'professional',
  origin: 'trial',
  trialEndsAt: days(endsInDays),
});

describe('RN-PAY-04/RN-PAY-06: hasActiveAccess', () => {
  it('admin e seed são isentos, mesmo sem assinatura', () => {
    expect(hasActiveAccess({ role: 'admin', origin: 'signup' }, null, now)).toEqual({
      hasAccess: true,
      reason: 'exempt',
    });
    expect(hasActiveAccess({ role: 'professional', origin: 'seed' }, null, now).reason).toBe(
      'exempt',
    );
  });

  it('trial vale até trialEndsAt e depois expira', () => {
    expect(hasActiveAccess(trial(2), null, now)).toEqual({ hasAccess: true, reason: 'trial' });
    expect(hasActiveAccess(trial(-1), null, now)).toEqual({
      hasAccess: false,
      reason: 'trial_expired',
    });
    expect(hasActiveAccess({ role: 'professional', origin: 'trial' }, null, now).reason).toBe(
      'trial_expired',
    );
  });

  it('signup sem assinatura não tem acesso', () => {
    expect(hasActiveAccess(signup, null, now)).toEqual({
      hasAccess: false,
      reason: 'no_subscription',
    });
    expect(hasActiveAccess(signup, { status: 'incomplete' }, now).reason).toBe('incomplete');
  });

  it('assinatura ativa libera, inclusive para trial expirado', () => {
    expect(hasActiveAccess(signup, { status: 'active' }, now).hasAccess).toBe(true);
    expect(hasActiveAccess(trial(-3), { status: 'active' }, now).reason).toBe('active');
  });

  it('past_due mantém o acesso por 3 dias de carência', () => {
    expect(hasActiveAccess(signup, { status: 'past_due', pastDueSince: days(-3) }, now)).toEqual({
      hasAccess: true,
      reason: 'grace_period',
    });
    expect(hasActiveAccess(signup, { status: 'past_due', pastDueSince: days(-3.01) }, now)).toEqual(
      { hasAccess: false, reason: 'past_due' },
    );
  });

  it('cancelada mantém o acesso até o fim do período pago', () => {
    expect(
      hasActiveAccess(signup, { status: 'canceled', currentPeriodEnd: days(5) }, now).reason,
    ).toBe('canceled_until_period_end');
    expect(
      hasActiveAccess(signup, { status: 'canceled', currentPeriodEnd: days(-1) }, now),
    ).toEqual({ hasAccess: false, reason: 'canceled' });
    expect(
      hasActiveAccess(signup, { status: 'canceled', currentPeriodEnd: null }, now).hasAccess,
    ).toBe(false);
  });
});

describe('trialDaysLeft', () => {
  it('arredonda para cima e nunca fica negativo', () => {
    expect(trialDaysLeft(trial(7), now)).toBe(7);
    expect(trialDaysLeft(trial(0.2), now)).toBe(1);
    expect(trialDaysLeft(trial(-2), now)).toBe(0);
    expect(trialDaysLeft(signup, now)).toBe(0);
  });
});
