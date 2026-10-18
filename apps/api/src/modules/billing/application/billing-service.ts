import {
  PLANS,
  PLAN_BENEFITS,
  TRIAL_DAYS,
  isPlanId,
  type PlanId,
  type SubscriptionStatus,
} from '@mente-ativa/shared';
import {
  ApiError,
  billingUnavailable,
  conflict,
  validationError,
} from '../../shared/kernel/errors.js';
import { logger } from '../../shared/infra/logger.js';
import {
  PaymentModel,
  ProcessedWebhookEventModel,
  SubscriptionModel,
  UnmatchedBillingEventModel,
  UserModel,
  type SubscriptionRecord,
} from '../../shared/infra/models.js';
import type { RequestAccess } from '../../shared/presentation/http.js';
import { trialDaysLeft } from '../domain/access-policy.js';
import type {
  BillingContract,
  BillingEvent,
  BillingGateway,
  BillingInvoice,
  BillingMatch,
} from '../infra/billing-gateway.js';

export interface BillingConfig {
  appUrl: string;
}
export function billingConfigFromEnv(env = process.env): BillingConfig {
  return { appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '') };
}

export interface BillingRecipient {
  username: string;
  name: string;
  email: string;
}
/** E-mails transacionais disparados pelos eventos de cobrança (RN-PAY-08). */
export interface BillingNotifier {
  accessReleased(
    to: BillingRecipient,
    plan: PlanId | null,
    nextChargeDate: Date | null,
  ): Promise<void>;
  paymentFailed(to: BillingRecipient): Promise<void>;
  subscriptionCanceled(to: BillingRecipient, accessUntil: Date | null): Promise<void>;
}
export const silentNotifier: BillingNotifier = {
  accessReleased: async () => undefined,
  paymentFailed: async () => undefined,
  subscriptionCanceled: async () => undefined,
};

// Estados em que já existe assinatura viva: uma nova compra criaria cobrança em dobro.
const LIVE_STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

/** Fim do período pago por uma fatura: 1 mês ou 1 ano depois do pagamento. */
export function periodEndFrom(paidAt: Date, plan: PlanId | null): Date {
  const end = new Date(paidAt);
  if (plan === 'annual') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

type SubscriptionDoc = SubscriptionRecord & { _id: unknown };

export class BillingService {
  constructor(
    private readonly gateway: BillingGateway | null,
    private readonly config: BillingConfig,
    private readonly notifier: BillingNotifier = silentNotifier,
  ) {}

  plans() {
    return {
      plans: Object.values(PLANS),
      benefits: PLAN_BENEFITS,
      trialDays: TRIAL_DAYS,
    };
  }

  async getMine(username: string, access: RequestAccess, now = new Date()) {
    const [user, subscription, payments] = await Promise.all([
      UserModel.findOne({ username }, { trialEndsAt: 1 }).lean(),
      SubscriptionModel.findOne({ username }).lean(),
      PaymentModel.find({ username }).sort({ paidAt: -1, createdAt: -1 }).limit(12).lean(),
    ]);
    return {
      hasAccess: access.hasAccess,
      reason: access.reason,
      status: subscription?.status ?? null,
      plan: subscription?.plan ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      canManage: Boolean(subscription?.eduzzContractId || subscription?.activatedAt),
      customerAreaUrl: this.gateway?.customerAreaUrl() ?? null,
      buyerEmail: subscription?.buyerEmail ?? null,
      trialEndsAt: user?.trialEndsAt?.toISOString() ?? null,
      trialDaysLeft: user ? trialDaysLeft(user, now) : 0,
      payments: payments.map((payment) => ({
        id: payment.providerInvoiceId,
        amountCents: payment.amountCents,
        currency: payment.currency,
        plan: payment.plan ?? null,
        status: payment.status,
        paymentMethod: payment.paymentMethod ?? null,
        paidAt: payment.paidAt?.toISOString() ?? null,
        createdAt: (payment as { createdAt?: Date }).createdAt?.toISOString() ?? null,
      })),
    };
  }

  /** Devolve o link do checkout Eduzz do plano, rastreado com o username do comprador. */
  async startCheckout(username: string, plan: unknown) {
    if (!isPlanId(plan)) throw validationError('Escolha um plano válido.', 'plan');
    const gateway = this.requireGateway();
    const user = await UserModel.findOne({ username }, { name: 1, email: 1 }).lean();
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
    const subscription = await SubscriptionModel.findOne({ username }).lean();
    if (subscription?.activatedAt && LIVE_STATUSES.includes(subscription.status))
      throw conflict(
        'Você já tem uma assinatura ativa. Use "Gerenciar assinatura" para trocar de plano.',
      );
    const url = gateway.checkoutUrl(plan, { username, email: user.email ?? null });
    if (!url) throw billingUnavailable();
    return { url };
  }

  /** Área do comprador Eduzz: troca do meio de pagamento e cancelamento (RN-PAY-07). */
  async openPortal(username: string) {
    const gateway = this.requireGateway();
    const subscription = await SubscriptionModel.findOne({ username }).lean();
    if (!subscription?.eduzzContractId && !subscription?.activatedAt)
      throw conflict('Você ainda não tem uma assinatura para gerenciar.');
    const url = gateway.customerAreaUrl();
    if (!url) throw billingUnavailable();
    return { url };
  }

  /** Valida a assinatura do webhook; lança InvalidWebhookSignature. */
  parseWebhook(payload: Buffer, signature: string | undefined) {
    return this.requireGateway().parseWebhook(payload, signature);
  }

  /**
   * RN-PAY-10: o webhook é a fonte da verdade. Cada evento é processado uma única vez;
   * se o processamento falhar, o registro é desfeito para o provedor poder reenviar.
   */
  async handleEvent(event: BillingEvent): Promise<{ duplicate: boolean }> {
    try {
      await ProcessedWebhookEventModel.create({
        eventId: event.id,
        provider: this.gateway?.provider ?? 'eduzz',
        type: event.type,
      });
    } catch (error) {
      if (isDuplicateKey(error)) return { duplicate: true };
      throw error;
    }
    try {
      await this.dispatch(event);
    } catch (error) {
      await ProcessedWebhookEventModel.deleteOne({ eventId: event.id });
      throw error;
    }
    return { duplicate: false };
  }

  private async dispatch(event: BillingEvent) {
    switch (event.type) {
      case 'invoice.paid':
        return this.onInvoicePaid(event, event.invoice);
      case 'invoice.refunded':
        return this.onInvoiceRefunded(event, event.invoice);
      case 'contract.updated':
        return this.onContractUpdated(event, event.contract);
      case 'ignored':
        return undefined;
    }
  }

  private async onInvoicePaid(event: BillingEvent, invoice: BillingInvoice) {
    const username = await this.resolveUsername(invoice.match);
    if (!username) return this.recordUnmatched(event, invoice.match);
    const existing = await SubscriptionModel.findOne({ username }).lean();
    const plan = this.planForProducts(invoice.productIds) ?? this.knownPlan(existing);
    const paidAt = invoice.paidAt ?? new Date();
    if (invoice.amountCents > 0)
      await PaymentModel.updateOne(
        { providerInvoiceId: invoice.id },
        {
          $set: {
            username,
            amountCents: invoice.amountCents,
            currency: invoice.currency,
            plan,
            status: 'paid',
            paymentMethod: invoice.paymentMethod,
            installments: invoice.installments,
            paidAt,
          },
        },
        { upsert: true },
      );
    const paidUntil = periodEndFrom(paidAt, plan);
    const currentPeriodEnd =
      existing?.currentPeriodEnd && existing.currentPeriodEnd > paidUntil
        ? existing.currentPeriodEnd
        : paidUntil;
    const updated = await this.saveSubscription(username, {
      ...(invoice.match.contractId ? { eduzzContractId: invoice.match.contractId } : {}),
      ...(invoice.match.buyerEmail ? { buyerEmail: invoice.match.buyerEmail } : {}),
      status: 'active',
      plan,
      startedAt: existing?.startedAt ?? paidAt,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      pastDueSince: null,
      cancelNoticeSentAt: null,
    });
    if (updated) await this.afterStatusChange(updated, existing);
  }

  private async onInvoiceRefunded(event: BillingEvent, invoice: BillingInvoice) {
    const username = await this.resolveUsername(invoice.match);
    if (!username) return this.recordUnmatched(event, invoice.match);
    const existing = await SubscriptionModel.findOne({ username }).lean();
    await PaymentModel.updateOne(
      { providerInvoiceId: invoice.id },
      {
        $set: { username, status: 'refunded' },
        $setOnInsert: {
          amountCents: invoice.amountCents,
          currency: invoice.currency,
          plan: this.planForProducts(invoice.productIds) ?? this.knownPlan(existing),
          paymentMethod: invoice.paymentMethod,
          installments: invoice.installments,
          paidAt: invoice.paidAt,
        },
      },
      { upsert: true },
    );
    // Reembolso ou chargeback corta o acesso na hora.
    const now = new Date();
    await this.saveSubscription(username, {
      status: 'canceled',
      currentPeriodEnd: now,
      cancelAtPeriodEnd: false,
      canceledAt: existing?.canceledAt ?? now,
      pastDueSince: null,
    });
  }

  private async onContractUpdated(event: BillingEvent, contract: BillingContract) {
    const username = await this.resolveUsername(contract.match);
    if (!username) return this.recordUnmatched(event, contract.match);
    const existing = await SubscriptionModel.findOne({ username }).lean();
    const now = new Date();
    // Depois da ativação, "aguardando pagamento" é renovação em atraso, não compra nova.
    const status: SubscriptionStatus =
      contract.status === 'incomplete' && existing?.activatedAt ? 'past_due' : contract.status;
    const canceled = status === 'canceled';
    const currentPeriodEnd = canceled
      ? // Cancelado: o acesso vai até o fim do período já pago (RN-PAY-07).
        (existing?.currentPeriodEnd ?? now)
      : status === 'active' || status === 'trialing'
        ? (contract.nextChargeAt ?? existing?.currentPeriodEnd ?? null)
        : (existing?.currentPeriodEnd ?? contract.nextChargeAt);
    const updated = await this.saveSubscription(username, {
      eduzzContractId: contract.id || existing?.eduzzContractId,
      ...(contract.match.buyerEmail ? { buyerEmail: contract.match.buyerEmail } : {}),
      providerStatus: contract.providerStatus,
      status,
      plan: this.planForProducts(contract.productIds) ?? this.knownPlan(existing),
      startedAt: existing?.startedAt ?? contract.startedAt,
      currentPeriodEnd,
      cancelAtPeriodEnd: canceled,
      canceledAt: canceled ? (existing?.canceledAt ?? now) : null,
      pastDueSince: status === 'past_due' ? (existing?.pastDueSince ?? now) : null,
      // Reativada antes do fim: um cancelamento futuro volta a gerar aviso.
      ...(canceled ? {} : { cancelNoticeSentAt: null }),
    });
    if (updated) await this.afterStatusChange(updated, existing);
  }

  private async saveSubscription(username: string, fields: Record<string, unknown>) {
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    return (await SubscriptionModel.findOneAndUpdate(
      { username },
      { $set: { provider: 'eduzz', ...set }, $setOnInsert: { username } },
      { upsert: true, new: true },
    ).lean()) as SubscriptionDoc | null;
  }

  /** E-mails de liberação, falha e cancelamento, cada um enviado uma única vez. */
  private async afterStatusChange(updated: SubscriptionDoc, previous: SubscriptionRecord | null) {
    const now = new Date();
    const { username } = updated;
    if (updated.status === 'active' || updated.status === 'trialing') {
      // Marca atômica: só um evento envia o e-mail de liberação (RN-PAY-08/10).
      const claimed = await SubscriptionModel.updateOne(
        { _id: updated._id, activatedAt: null },
        { $set: { activatedAt: now } },
      );
      if (claimed.modifiedCount === 1) {
        // RN-PAY-03: quem assina durante o teste deixa de usar o trial.
        await UserModel.updateOne(
          { username, trialEndsAt: { $gt: now } },
          { $set: { trialEndsAt: now } },
        );
        await this.notifyUser(username, (to) =>
          this.notifier.accessReleased(
            to,
            isPlanId(updated.plan) ? updated.plan : null,
            updated.currentPeriodEnd ?? null,
          ),
        );
      }
    }
    if (updated.status === 'past_due' && previous?.status !== 'past_due')
      await this.notifyUser(username, (to) => this.notifier.paymentFailed(to));
    if (updated.status === 'canceled' && updated.cancelAtPeriodEnd && updated.activatedAt) {
      const claimed = await SubscriptionModel.updateOne(
        { _id: updated._id, cancelNoticeSentAt: null, activatedAt: { $ne: null } },
        { $set: { cancelNoticeSentAt: now } },
      );
      if (claimed.modifiedCount === 1)
        await this.notifyUser(username, (to) =>
          this.notifier.subscriptionCanceled(to, updated.currentPeriodEnd ?? null),
        );
    }
  }

  /** Rastreio do checkout > contrato já vinculado > e-mail da compra. */
  private async resolveUsername(match: BillingMatch): Promise<string | null> {
    if (match.tracker) {
      const user = await UserModel.findOne({ username: match.tracker.toLowerCase() }).lean();
      if (user) return user.username;
    }
    if (match.contractId) {
      const sub = await SubscriptionModel.findOne({ eduzzContractId: match.contractId }).lean();
      if (sub) return sub.username;
    }
    if (match.buyerEmail) {
      const sub = await SubscriptionModel.findOne({ buyerEmail: match.buyerEmail }).lean();
      if (sub) return sub.username;
      const users = await UserModel.find({ email: match.buyerEmail }, { username: 1 })
        .limit(2)
        .lean();
      // E-mail repetido em mais de um usuário é ambíguo: fica para o admin vincular.
      if (users.length === 1 && users[0]) return users[0].username;
    }
    return null;
  }

  /** RN-PAY-11: evento sem usuário vira pendência no painel do admin. */
  private async recordUnmatched(event: BillingEvent, match: BillingMatch) {
    logger.warn(
      { eventId: event.id, type: event.type },
      'evento de cobrança sem usuário vinculado',
    );
    await UnmatchedBillingEventModel.updateOne(
      { eventId: event.id },
      {
        $setOnInsert: {
          type: event.type,
          tracker: match.tracker,
          contractId: match.contractId,
          buyerEmail: match.buyerEmail,
          payload: event,
        },
      },
      { upsert: true },
    );
  }

  private async notifyUser(username: string, send: (to: BillingRecipient) => Promise<void>) {
    const [user, subscription] = await Promise.all([
      UserModel.findOne({ username }, { name: 1, email: 1 }).lean(),
      SubscriptionModel.findOne({ username }, { email: 1, buyerEmail: 1 }).lean(),
    ]);
    const email = user?.email ?? subscription?.buyerEmail ?? subscription?.email;
    if (!user || !email) {
      logger.warn({ username }, 'usuário sem e-mail: aviso de cobrança não enviado');
      return;
    }
    // Falha de e-mail nunca derruba o processamento do webhook.
    try {
      await send({ username, name: user.name, email });
    } catch (error) {
      logger.error({ err: error }, 'falha ao enviar e-mail de cobrança');
    }
  }

  private planForProducts(productIds: string[]): PlanId | null {
    return this.gateway?.planForProduct(productIds) ?? null;
  }

  private knownPlan(subscription: SubscriptionRecord | null): PlanId | null {
    return subscription && isPlanId(subscription.plan) ? subscription.plan : null;
  }

  private requireGateway(): BillingGateway {
    if (!this.gateway) throw billingUnavailable();
    return this.gateway;
  }
}
