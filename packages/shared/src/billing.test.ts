import { describe, expect, it } from 'vitest';
import { PLANS, formatBRL, isPlanId } from './billing';

describe('RN-PAY-01: planos e preços', () => {
  it('anual é o mensal × 12 com 10% de desconto, exibido como valor mensal equivalente', () => {
    expect(PLANS.monthly.priceCents).toBe(4990);
    expect(PLANS.annual.priceCents).toBe(Math.round(4990 * 12 * 0.9));
    expect(PLANS.annual.monthlyEquivalentCents).toBe(Math.round(PLANS.annual.priceCents / 12));
    expect(PLANS.annual.discountPercent).toBe(10);
  });

  it('formata centavos em reais', () => {
    expect(formatBRL(4990)).toBe('R$ 49,90');
    expect(formatBRL(53892)).toBe('R$ 538,92');
    expect(formatBRL(123456789)).toBe('R$ 1.234.567,89');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('reconhece apenas os ids de plano conhecidos', () => {
    expect(isPlanId('annual')).toBe(true);
    expect(isPlanId('toString')).toBe(false);
    expect(isPlanId(undefined)).toBe(false);
  });
});
