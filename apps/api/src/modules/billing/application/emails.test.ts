import { describe, expect, it } from 'vitest';
import { accessReleased, subscriptionCanceled } from './emails.js';

const to = { username: 'ana', name: '<i>Ana</i> Souza', email: 'ana@exemplo.com' };

describe('templates de e-mail', () => {
  it('escapa dados do usuário no HTML e mantém o texto equivalente', () => {
    const mail = accessReleased(to, 'https://app.test', 'annual', new Date('2027-10-18T12:00:00Z'));
    // O título usa só o primeiro nome.
    expect(mail.html).toContain('Pagamento confirmado, &lt;i&gt;Ana&lt;/i&gt;!');
    expect(mail.html).not.toContain('<i>Ana</i>');
    expect(mail.text).toContain('Plano Anual: R$ 538,92 por ano. Próxima cobrança em 18/10/2027.');
    expect(mail.text).toContain('Acessar a plataforma: https://app.test/login');
  });

  it('cancelamento informa até quando o acesso continua', () => {
    const mail = subscriptionCanceled(to, 'https://app.test', new Date('2026-11-30T12:00:00Z'));
    expect(mail.text).toContain('Você continua com acesso até 30/11/2026.');
  });
});
