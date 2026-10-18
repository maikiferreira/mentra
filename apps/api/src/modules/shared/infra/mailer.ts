import nodemailer from 'nodemailer';
import { logger } from './logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export interface MailTransport {
  send(message: MailMessage & { from: string }): Promise<void>;
}

/** Sem SMTP configurado: registra o envio no log, sem o corpo (pode ter dados pessoais). */
const logTransport: MailTransport = {
  async send(message) {
    logger.info({ to: message.to, subject: message.subject }, 'e-mail (SMTP não configurado)');
  },
};

function smtpTransport(env: NodeJS.ProcessEnv): MailTransport {
  const port = Number(env.SMTP_PORT ?? 465);
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    async send(message) {
      await transporter.sendMail(message);
    },
  };
}

let override: MailTransport | null = null;
let fromEnv: MailTransport | null = null;

/** Troca o transporte (testes); `null` volta ao configurado pelo ambiente. */
export function setMailTransport(transport: MailTransport | null) {
  override = transport;
}

function currentTransport(): MailTransport {
  if (override) return override;
  fromEnv ??= process.env.SMTP_HOST ? smtpTransport(process.env) : logTransport;
  return fromEnv;
}

/**
 * Envia um e-mail. Erros são registrados e nunca propagam, para não derrubar
 * o webhook nem o cadastro. Retorna se o envio foi aceito pelo transporte.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const from = process.env.MAIL_FROM ?? 'Mente Ativa <acesso@menteativaa.com.br>';
  try {
    await currentTransport().send({ ...message, from });
    return true;
  } catch (error) {
    logger.error({ err: error, to: message.to, subject: message.subject }, 'falha no envio');
    return false;
  }
}
