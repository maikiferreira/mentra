import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mapEduzzContractStatus, toBillingEvent, verifyEduzzSignature } from './eduzz-gateway.js';

describe('gateway Eduzz', () => {
  const body = Buffer.from('{"id":"e1","event":"ping","data":{}}');
  const hmac = createHmac('sha256', 'segredo').update(body).digest();

  it('aceita x-signature em hex ou base64 e recusa o resto', () => {
    expect(verifyEduzzSignature(body, hmac.toString('hex'), 'segredo')).toBe(true);
    expect(verifyEduzzSignature(body, hmac.toString('base64'), 'segredo')).toBe(true);
    expect(verifyEduzzSignature(body, hmac.toString('hex'), 'outro')).toBe(false);
    expect(verifyEduzzSignature(body, undefined, 'segredo')).toBe(false);
    expect(verifyEduzzSignature(body, hmac.toString('hex'), '')).toBe(false);
  });

  it('mapeia os status de contrato', () => {
    expect(mapEduzzContractStatus('upToDate')).toBe('active');
    expect(mapEduzzContractStatus('trial')).toBe('trialing');
    expect(mapEduzzContractStatus('awaitingPayment')).toBe('incomplete');
    expect(mapEduzzContractStatus('late')).toBe('past_due');
    expect(mapEduzzContractStatus('suspended')).toBe('past_due');
    expect(mapEduzzContractStatus('canceled')).toBe('canceled');
    expect(mapEduzzContractStatus('finished')).toBe('canceled');
  });

  it('traduz fatura paga com valor em centavos, rastreio e e-mail normalizado', () => {
    const event = toBillingEvent({
      id: 'e2',
      event: 'myeduzz.invoice_paid',
      data: {
        id: 12345678,
        buyer: { email: 'Ana@Exemplo.com' },
        tracker: { code1: 'ana' },
        paid: { currency: 'BRL', value: 538.92 },
        items: [{ productId: 'P1' }],
        paidAt: '2026-10-18T12:00:00.000Z',
        paymentMethod: 'pix',
        contract: { id: '3456' },
      },
    });
    expect(event).toMatchObject({
      type: 'invoice.paid',
      invoice: {
        id: '12345678',
        amountCents: 53892,
        currency: 'brl',
        paymentMethod: 'pix',
        productIds: ['P1'],
        match: { tracker: 'ana', contractId: '3456', buyerEmail: 'ana@exemplo.com' },
      },
    });
  });
});
