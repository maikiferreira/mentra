import 'dotenv/config';
import { TRIAL_DAYS } from '@mente-ativa/shared';
import { connectDatabase, disconnectDatabase } from './modules/shared/infra/database.js';
import { LeadModel, UserModel } from './modules/shared/infra/models.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Prepara usuários existentes para a cobrança (idempotente):
 * - trial sem prazo ganha `now + 7d`, como carência para quem já estava testando (RN-PAY-03);
 * - usuário sem e-mail recebe o e-mail do Lead de mesmo username, quando houver.
 */
export async function migrateBilling(now = new Date()) {
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  const trials = await UserModel.updateMany(
    { origin: 'trial', trialEndsAt: { $exists: false } },
    { $set: { trialEndsAt } },
  );
  const withoutEmail = await UserModel.find(
    { $or: [{ email: { $exists: false } }, { email: null }, { email: '' }] },
    { username: 1 },
  ).lean();
  let emailsFilled = 0;
  for (const user of withoutEmail) {
    const lead = await LeadModel.findOne({ username: user.username }, { email: 1 })
      .sort({ createdAt: -1 })
      .lean();
    if (!lead?.email) continue;
    await UserModel.updateOne({ _id: user._id }, { $set: { email: lead.email.toLowerCase() } });
    emailsFilled += 1;
  }
  return {
    trialsExtended: trials.modifiedCount,
    emailsFilled,
    stillWithoutEmail: withoutEmail.length - emailsFilled,
  };
}

const entry = process.argv[1]?.replaceAll('\\', '/');
if (entry?.endsWith('/migrate-billing.ts') || entry?.endsWith('/migrate-billing.js')) {
  try {
    await connectDatabase();
    const summary = await migrateBilling();
    console.info(
      `migrate-billing: ${summary.trialsExtended} trial(s) com prazo definido, ` +
        `${summary.emailsFilled} e-mail(s) preenchido(s) a partir do Lead, ` +
        `${summary.stillWithoutEmail} usuário(s) continuam sem e-mail.`,
    );
  } finally {
    await disconnectDatabase();
  }
}
