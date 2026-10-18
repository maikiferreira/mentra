import { PLANS, formatBRL, type PlanId } from '@mente-ativa/shared';
import { sendMail, type MailMessage } from '../../shared/infra/mailer.js';
import type { BillingNotifier, BillingRecipient } from './billing-service.js';

const ACCENT = '#0b7a6b';
const INK = '#15262b';
const MUTED = '#566a70';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const dateBR = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);

interface Layout {
  title: string;
  /** Parágrafos já em HTML seguro. */
  paragraphs: string[];
  /** Os mesmos parágrafos em texto puro. */
  textParagraphs: string[];
  button?: { label: string; url: string };
}
function render({ title, paragraphs, textParagraphs, button }: Layout) {
  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f2f6f6;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d6e0e2;border-radius:12px;overflow:hidden">
<tr><td style="height:6px;background:${ACCENT}"></td></tr>
<tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:bold;color:${ACCENT}">Mente Ativa</td></tr>
<tr><td style="padding:0 28px 8px;font-size:22px;font-weight:bold">${escapeHtml(title)}</td></tr>
${paragraphs.map((paragraph) => `<tr><td style="padding:8px 28px;font-size:16px;line-height:1.5">${paragraph}</td></tr>`).join('\n')}
${
  button
    ? `<tr><td style="padding:16px 28px 8px"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">${escapeHtml(button.label)}</a></td></tr>`
    : ''
}
<tr><td style="padding:24px 28px 28px;font-size:13px;color:${MUTED}">Você recebeu este e-mail porque tem uma conta no Mente Ativa.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    title,
    '',
    ...textParagraphs.flatMap((paragraph) => [paragraph, '']),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    '— Mente Ativa',
  ].join('\n');
  return { html, text };
}
function message(to: BillingRecipient, subject: string, layout: Layout): MailMessage {
  return { to: to.email, subject, ...render(layout) };
}

export function accessReleased(
  to: BillingRecipient,
  appUrl: string,
  plan: PlanId | null,
  nextChargeDate: Date | null,
): MailMessage {
  const name = firstName(to.name);
  const definition = plan ? PLANS[plan] : null;
  const planLine = definition
    ? `Plano ${definition.label}: ${formatBRL(definition.priceCents)} por ${definition.interval === 'month' ? 'mês' : 'ano'}.`
    : null;
  const chargeLine = nextChargeDate ? `Próxima cobrança em ${dateBR(nextChargeDate)}.` : null;
  const details = [planLine, chargeLine].filter(Boolean).join(' ');
  const loginLine = `Para entrar, use o seu usuário: ${to.username}.`;
  return message(to, 'Seu acesso ao Mente Ativa está liberado', {
    title: `Pagamento confirmado, ${name}!`,
    paragraphs: [
      'Sua assinatura está ativa e o acesso completo à plataforma já está liberado.',
      ...(details ? [escapeHtml(details)] : []),
      `Para entrar, use o seu usuário: <b>${escapeHtml(to.username)}</b>.`,
    ],
    textParagraphs: [
      'Sua assinatura está ativa e o acesso completo à plataforma já está liberado.',
      ...(details ? [details] : []),
      loginLine,
    ],
    button: { label: 'Acessar a plataforma', url: `${appUrl}/login` },
  });
}

export function trialWelcome(to: BillingRecipient, appUrl: string, trialEndsAt: Date): MailMessage {
  const name = firstName(to.name);
  const until = `Seu teste grátis vale até ${dateBR(trialEndsAt)}, sem precisar de cartão.`;
  return message(to, 'Bem-vindo(a) ao teste grátis do Mente Ativa', {
    title: `Boas-vindas, ${name}!`,
    paragraphs: [
      escapeHtml(until),
      `Seu usuário é <b>${escapeHtml(to.username)}</b> e a senha são os 4 últimos dígitos do telefone informado.`,
      'Para continuar depois do teste, escolha um plano dentro da plataforma.',
    ],
    textParagraphs: [
      until,
      `Seu usuário é ${to.username} e a senha são os 4 últimos dígitos do telefone informado.`,
      'Para continuar depois do teste, escolha um plano dentro da plataforma.',
    ],
    button: { label: 'Acessar a plataforma', url: `${appUrl}/login` },
  });
}

export function paymentFailed(to: BillingRecipient, appUrl: string): MailMessage {
  const lines = [
    'Não conseguimos cobrar a sua assinatura do Mente Ativa no cartão cadastrado.',
    'Seu acesso continua por alguns dias. Atualize a forma de pagamento para não perder o acesso.',
  ];
  return message(to, 'Não conseguimos processar o seu pagamento', {
    title: `${firstName(to.name)}, houve um problema com o pagamento`,
    paragraphs: lines.map(escapeHtml),
    textParagraphs: lines,
    button: { label: 'Atualizar forma de pagamento', url: `${appUrl}/perfil/assinatura` },
  });
}

export function subscriptionCanceled(
  to: BillingRecipient,
  appUrl: string,
  accessUntil: Date | null,
): MailMessage {
  const lines = [
    'Recebemos o cancelamento da sua assinatura do Mente Ativa.',
    accessUntil
      ? `Você continua com acesso até ${dateBR(accessUntil)}. Depois disso, nenhuma nova cobrança será feita.`
      : 'Nenhuma nova cobrança será feita.',
    'Mudou de ideia? Você pode reativar a assinatura a qualquer momento pelo seu perfil.',
  ];
  return message(to, 'Sua assinatura foi cancelada', {
    title: `Até breve, ${firstName(to.name)}`,
    paragraphs: lines.map(escapeHtml),
    textParagraphs: lines,
    button: { label: 'Ver minha assinatura', url: `${appUrl}/perfil/assinatura` },
  });
}

/** Implementação de BillingNotifier que envia os e-mails por SMTP. */
export function createEmailNotifier(appUrl: string, send = sendMail): BillingNotifier {
  return {
    async accessReleased(to, plan, nextChargeDate) {
      await send(accessReleased(to, appUrl, plan, nextChargeDate));
    },
    async paymentFailed(to) {
      await send(paymentFailed(to, appUrl));
    },
    async subscriptionCanceled(to, accessUntil) {
      await send(subscriptionCanceled(to, appUrl, accessUntil));
    },
  };
}
