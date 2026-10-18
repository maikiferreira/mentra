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
  ProcessedStripeEventModel,
  SubscriptionModel,
  UserModel,
} from '../../shared/infra/models.js';
import type { RequestAccess } from '../../shared/presentation/http.js';
import { trialDaysLeft } from '../domain/access-policy.js';
import type {
  BillingEvent,
  BillingGateway,
  BillingInvoice,
  BillingSubscription,
} from '../infra/stripe-gateway.js';

export interface BillingConfig {
  appUrl: string;
  prices: Record<PlanId, string | undefined>;
}
export function billingConfigFromEnv(env = process.env): BillingConfig {
  return {
    appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
    prices: { monthly: env.STRIPE_PRICE_MONTHLY, annual: env.STRIPE_PRICE_ANNUAL },
  };
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
      canManage: Boolean(subscription?.stripeCustomerId),
      trialEndsAt: user?.trialEndsAt?.toISOString() ?? null,
      trialDaysLeft: user ? trialDaysLeft(user, now) : 0,
      payments: payments.map((payment) => ({
        id: payment.stripeInvoiceId,
        amountCents: payment.amountCents,
        currency: payment.currency,
        plan: payment.plan ?? null,
        status: payment.status,
        paidAt: payment.paidAt?.toISOString() ?? null,
        createdAt: (payment as { createdAt?: Date }).createdAt?.toISOString() ?? null,
      })),
    };
  }

  async startCheckout(username: string, plan: unknown) {
    if (!isPlanId(plan)) throw validationError('Escolha um plano válido.', 'plan');
    const gateway = this.requireGateway();
    const priceId = this.config.prices[plan];
    if (!priceId) throw billingUnavailable();
    const user = await UserModel.findOne({ username }, { name: 1, email: 1 }).lean();
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
    const subscription = await SubscriptionModel.findOne({ username }).lean();
    if (subscription?.stripeSubscriptionId && LIVE_STATUSES.includes(subscription.status))
      throw conflict(
        'Você já tem uma assinatura ativa. Use "Gerenciar assinatura" para trocar de plano.',
      );
    let customerId = subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await gateway.createCustomer({
        email: user.email ?? null,
        name: user.name,
        username,
      });
      customerId = customer.id;
      await SubscriptionModel.updateOne(
        { username },
        {
          $set: { stripeCustomerId: customerId, email: user.email ?? null },
          $setOnInsert: { username },
        },
        { upsert: true },
      );
    }
    return gateway.createCheckoutSession({
      customerId,
      priceId,
      username,
      successUrl: `${this.config.appUrl}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${this.config.appUrl}/assinatura/planos`,
    });
  }

  async openPortal(username: string) {
    const gateway = this.requireGateway();
    const subscription = await SubscriptionModel.findOne({ username }).lean();
    if (!subscription?.stripeCustomerId)
      throw conflict('Você ainda não tem uma assinatura para gerenciar.');
    return gateway.createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${this.config.appUrl}/perfil/assinatura`,
    });
  }

  /** Valida a assinatura do Stripe; lança InvalidWebhookSignature. */
  parseWebhook(payload: Buffer, signature: string | undefined) {
    return this.requireGateway().constructEvent(payload, signature);
  }

  /**
   * RN-PAY-10: o webhook é a fonte da verdade. Cada evento é processado uma única vez;
   * se o processamento falhar, o registro é desfeito para o Stripe poder reenviar.
   */
  async handleEvent(event: BillingEvent): Promise<{ duplicate: boolean }> {
    try {
      await ProcessedStripeEventModel.create({ eventId: event.id, type: event.type });
    } catch (error) {
      if (isDuplicateKey(error)) return { duplicate: true };
      throw error;
    }
    try {
      await this.dispatch(event);
    } catch (error) {
      await ProcessedStripeEventModel.deleteOne({ eventId: event.id });
      throw error;
    }
    return { duplicate: false };
  }

  private async dispatch(event: BillingEvent) {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.onCheckoutCompleted(event);
      case 'invoice.paid':
        return this.onInvoicePaid(event.invoice);
      case 'invoice.payment_failed':
        return this.onInvoiceFailed(event.invoice);
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // Busca o estado atual: eventos podem chegar fora de ordem.
        return this.syncSubscription(
          await this.requireGateway().retrieveSubscription(event.subscriptionId),
        );
      case 'ignored':
        return undefined;
    }
  }

  private async onCheckoutCompleted(
    event: Extract<BillingEvent, { type: 'checkout.session.completed' }>,
  ) {
    const username =
      event.username ??
      (event.customerId
        ? (await SubscriptionModel.findOne({ stripeCustomerId: event.customerId }).lean())?.username
        : undefined);
    if (!username) {
      logger.warn({ eventId: event.id }, 'checkout.session.completed sem usuário vinculado');
      return;
    }
    await SubscriptionModel.updateOne(
      { username },
      {
        $set: {
          ...(event.customerId ? { stripeCustomerId: event.customerId } : {}),
          ...(event.subscriptionId ? { stripeSubscriptionId: event.subscriptionId } : {}),
        },
        $setOnInsert: { username },
      },
      { upsert: true },
    );
    if (event.subscriptionId)
      await this.syncSubscription(
        await this.requireGateway().retrieveSubscription(event.subscriptionId),
        username,
      );
  }

  private async onInvoicePaid(invoice: BillingInvoice) {
    const username = await this.usernameForInvoice(invoice);
    if (!username) {
      logger.warn({ invoiceId: invoice.id }, 'invoice.paid sem usuário vinculado');
      return;
    }
    if (invoice.amountPaidCents > 0)
      await PaymentModel.updateOne(
        { stripeInvoiceId: invoice.id },
        {
          $set: {
            username,
            amountCents: invoice.amountPaidCents,
            currency: invoice.currency,
            plan: this.planForPrice(invoice.priceId),
            status: 'paid',
            paidAt: invoice.paidAt ?? new Date(),
          },
        },
        { upsert: true },
      );
    if (invoice.subscriptionId)
      await this.syncSubscription(
        await this.requireGateway().retrieveSubscription(invoice.subscriptionId),
        username,
      );
  }

  private async onInvoiceFailed(invoice: BillingInvoice) {
    const username = await this.usernameForInvoice(invoice);
    if (!username) {
      logger.warn({ invoiceId: invoice.id }, 'invoice.payment_failed sem usuário vinculado');
      return;
    }
    const existing = await PaymentModel.findOne({ stripeInvoiceId: invoice.id }).lean();
    if (existing?.status === 'paid') return;
    await PaymentModel.updateOne(
      { stripeInvoiceId: invoice.id },
      {
        $set: {
          username,
          amountCents: invoice.amountDueCents,
          currency: invoice.currency,
          plan: this.planForPrice(invoice.priceId),
          status: 'failed',
          paidAt: null,
        },
      },
      { upsert: true },
    );
    const now = new Date();
    await SubscriptionModel.updateOne(
      { username, status: { $in: ['active', 'trialing'] } },
      { $set: { status: 'past_due', pastDueSince: now } },
    );
    await SubscriptionModel.updateOne(
      { username, status: 'past_due', pastDueSince: null },
      { $set: { pastDueSince: now } },
    );
    // Novas tentativas da mesma fatura não repetem o aviso.
    if (existing?.status !== 'failed') {
      const recipient = await this.recipient(username);
      if (recipient) await this.notify(() => this.notifier.paymentFailed(recipient));
    }
  }

  private async syncSubscription(remote: BillingSubscription, usernameHint?: string) {
    const existing =
      (await SubscriptionModel.findOne({ stripeSubscriptionId: remote.id }).lean()) ??
      (usernameHint || remote.username
        ? await SubscriptionModel.findOne({ username: usernameHint ?? remote.username }).lean()
        : null) ??
      (remote.customerId
        ? await SubscriptionModel.findOne({ stripeCustomerId: remote.customerId }).lean()
        : null);
    const username = existing?.username ?? usernameHint ?? remote.username;
    if (!username) {
      logger.warn({ subscriptionId: remote.id }, 'assinatura do Stripe sem usuário vinculado');
      return;
    }
    const now = new Date();
    const scheduledEnd = remote.cancelAtPeriodEnd || remote.status === 'canceled';
    const updated = await SubscriptionModel.findOneAndUpdate(
      { username },
      {
        $set: {
          stripeSubscriptionId: remote.id,
          ...(remote.customerId ? { stripeCustomerId: remote.customerId } : {}),
          status: remote.status,
          plan: this.planForPrice(remote.priceId) ?? existing?.plan ?? null,
          startedAt: existing?.startedAt ?? remote.startedAt,
          currentPeriodEnd: remote.currentPeriodEnd,
          cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
          canceledAt: remote.canceledAt,
          pastDueSince: remote.status === 'past_due' ? (existing?.pastDueSince ?? now) : null,
          // Reativada antes do fim: um cancelamento futuro volta a gerar aviso.
          ...(scheduledEnd ? {} : { cancelNoticeSentAt: null }),
        },
        $setOnInsert: { username },
      },
      { upsert: true, new: true },
    ).lean();
    if (!updated) return;

    if (remote.status === 'active' || remote.status === 'trialing') {
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
        const recipient = await this.recipient(username);
        if (recipient)
          await this.notify(() =>
            this.notifier.accessReleased(
              recipient,
              isPlanId(updated.plan) ? updated.plan : null,
              remote.currentPeriodEnd,
            ),
          );
      }
    }
    if (scheduledEnd && updated.activatedAt !== null) {
      const claimed = await SubscriptionModel.updateOne(
        { _id: updated._id, cancelNoticeSentAt: null, activatedAt: { $ne: null } },
        { $set: { cancelNoticeSentAt: now } },
      );
      if (claimed.modifiedCount === 1) {
        const recipient = await this.recipient(username);
        if (recipient)
          await this.notify(() =>
            this.notifier.subscriptionCanceled(recipient, remote.currentPeriodEnd),
          );
      }
    }
  }

  private async usernameForInvoice(invoice: BillingInvoice) {
    const bySubscription = invoice.subscriptionId
      ? await SubscriptionModel.findOne({ stripeSubscriptionId: invoice.subscriptionId }).lean()
      : null;
    if (bySubscription) return bySubscription.username;
    const byCustomer = invoice.customerId
      ? await SubscriptionModel.findOne({ stripeCustomerId: invoice.customerId }).lean()
      : null;
    if (byCustomer) return byCustomer.username;
    if (!invoice.subscriptionId) return null;
    return (await this.requireGateway().retrieveSubscription(invoice.subscriptionId)).username;
  }

  private async recipient(username: string): Promise<BillingRecipient | null> {
    const [user, subscription] = await Promise.all([
      UserModel.findOne({ username }, { name: 1, email: 1 }).lean(),
      SubscriptionModel.findOne({ username }, { email: 1 }).lean(),
    ]);
    const email = user?.email ?? subscription?.email;
    if (!user || !email) {
      logger.warn({ username }, 'usuário sem e-mail: aviso de cobrança não enviado');
      return null;
    }
    return { username, name: user.name, email };
  }

  /** Falha de e-mail nunca derruba o processamento do webhook. */
  private async notify(send: () => Promise<void>) {
    try {
      await send();
    } catch (error) {
      logger.error({ err: error }, 'falha ao enviar e-mail de cobrança');
    }
  }

  private planForPrice(priceId: string | null): PlanId | null {
    if (!priceId) return null;
    if (priceId === this.config.prices.monthly) return 'monthly';
    if (priceId === this.config.prices.annual) return 'annual';
    return null;
  }

  private requireGateway(): BillingGateway {
    if (!this.gateway) throw billingUnavailable();
    return this.gateway;
  }
}
