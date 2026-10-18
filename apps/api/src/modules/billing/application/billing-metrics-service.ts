import { PLANS, isPlanId, type PlanId } from '@mente-ativa/shared';
import { PaymentModel, SubscriptionModel, UserModel } from '../../shared/infra/models.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = 'America/Sao_Paulo';
// Brasília não tem horário de verão desde 2019: o início do mês local é 03:00 UTC.
const BRT_OFFSET_HOURS = 3;

/** Início do mês (horário de Brasília) `monthsAgo` meses antes do mês de `now`. */
function monthStart(now: Date, monthsAgo = 0) {
  const local = new Date(now.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - monthsAgo, 1, BRT_OFFSET_HOURS),
  );
}
const monthKey = (start: Date) =>
  new Date(start.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 7);

const monthlyValueCents = (plan: PlanId) =>
  PLANS[plan].interval === 'year' ? PLANS[plan].priceCents / 12 : PLANS[plan].priceCents;

export type AdminSubscriptionStatus =
  'trial' | 'trialing' | 'incomplete' | 'active' | 'past_due' | 'canceled';

export class BillingMetricsService {
  async summary(now = new Date()) {
    const thisMonth = monthStart(now);
    const firstMonth = monthStart(now, 11);
    const in30Days = new Date(now.getTime() + 30 * DAY_MS);
    const ago30Days = new Date(now.getTime() - 30 * DAY_MS);

    const [
      subscriptions,
      paidTotals,
      revenueThisMonth,
      trials,
      revenueSeries,
      newSeries,
      churnSeries,
    ] = await Promise.all([
      SubscriptionModel.find(
        { stripeSubscriptionId: { $exists: true, $ne: null } },
        {
          username: 1,
          plan: 1,
          status: 1,
          currentPeriodEnd: 1,
          cancelAtPeriodEnd: 1,
          canceledAt: 1,
          activatedAt: 1,
        },
      ).lean(),
      PaymentModel.aggregate<{ total: number; count: number }>([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amountCents' }, count: { $sum: 1 } } },
      ]),
      PaymentModel.aggregate<{ total: number }>([
        { $match: { status: 'paid', paidAt: { $gte: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$amountCents' } } },
      ]),
      UserModel.find(
        { origin: 'trial', trialEndsAt: { $ne: null } },
        { username: 1, trialEndsAt: 1, createdAt: 1 },
      ).lean(),
      this.monthly(PaymentModel, 'paidAt', firstMonth, { status: 'paid' }, '$amountCents'),
      this.monthly(SubscriptionModel, 'activatedAt', firstMonth),
      this.monthly(SubscriptionModel, 'canceledAt', firstMonth),
    ]);

    const live = subscriptions.filter(
      (sub) => sub.status === 'active' || sub.status === 'trialing',
    );
    const activeMonthly = live.filter((sub) => sub.plan === 'monthly').length;
    const activeAnnual = live.filter((sub) => sub.plan === 'annual').length;
    const pastDue = subscriptions.filter((sub) => sub.status === 'past_due').length;
    const canceledThisMonth = subscriptions.filter(
      (sub) => sub.canceledAt && sub.canceledAt >= thisMonth,
    ).length;
    // Base do churn: assinaturas que já estavam ativas no início do mês.
    const activeAtMonthStart = subscriptions.filter(
      (sub) =>
        sub.activatedAt &&
        sub.activatedAt < thisMonth &&
        (!sub.canceledAt || sub.canceledAt >= thisMonth),
    );
    const churnedThisMonth = activeAtMonthStart.filter(
      (sub) => sub.canceledAt && sub.canceledAt >= thisMonth,
    ).length;
    const mrrCents = Math.round(
      activeMonthly * monthlyValueCents('monthly') + activeAnnual * monthlyValueCents('annual'),
    );
    const paidUsernames = new Set(
      subscriptions.filter((sub) => sub.activatedAt).map((sub) => sub.username),
    );
    const inTrial = trials.filter(
      (user) => user.trialEndsAt! > now && !paidUsernames.has(user.username),
    ).length;
    const recentTrials = trials.filter(
      (user) => (user as { createdAt?: Date }).createdAt! >= ago30Days,
    );
    const convertedTrials = recentTrials.filter((user) => paidUsernames.has(user.username)).length;
    const upcoming = live.filter(
      (sub) =>
        !sub.cancelAtPeriodEnd &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd >= now &&
        sub.currentPeriodEnd <= in30Days &&
        isPlanId(sub.plan),
    );
    const totalPaid = paidTotals[0]?.total ?? 0;
    const paidCount = paidTotals[0]?.count ?? 0;
    const months = Array.from({ length: 12 }, (_, index) => monthKey(monthStart(now, 11 - index)));

    return {
      kpis: {
        activeMonthly,
        activeAnnual,
        active: activeMonthly + activeAnnual,
        inTrial,
        pastDue,
        canceledThisMonth,
        mrrCents,
        arrCents: mrrCents * 12,
        revenueThisMonthCents: revenueThisMonth[0]?.total ?? 0,
        revenueTotalCents: totalPaid,
        averageTicketCents: paidCount ? Math.round(totalPaid / paidCount) : 0,
        trialConversionRate: recentTrials.length ? convertedTrials / recentTrials.length : null,
        trialsLast30Days: recentTrials.length,
        convertedTrialsLast30Days: convertedTrials,
        churnRate: activeAtMonthStart.length ? churnedThisMonth / activeAtMonthStart.length : null,
      },
      series: months.map((month) => ({
        month,
        revenueCents: revenueSeries.get(month) ?? 0,
        newSubscriptions: newSeries.get(month) ?? 0,
        cancellations: churnSeries.get(month) ?? 0,
      })),
      upcoming: {
        renewals: upcoming.length,
        expectedRevenueCents: upcoming.reduce(
          (sum, sub) => sum + PLANS[sub.plan as PlanId].priceCents,
          0,
        ),
      },
    };
  }

  /** Soma (ou contagem) por mês de Brasília, a partir de `from`. */
  private async monthly(
    model: typeof PaymentModel | typeof SubscriptionModel,
    field: string,
    from: Date,
    match: Record<string, unknown> = {},
    sum: string | number = 1,
  ) {
    const rows = await (model as typeof PaymentModel).aggregate<{ _id: string; value: number }>([
      { $match: { ...match, [field]: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: `$${field}`, timezone: TIME_ZONE } },
          value: { $sum: sum },
        },
      },
    ]);
    return new Map(rows.map((row) => [row._id, row.value]));
  }

  async subscriptions(filters: { status?: unknown; plan?: unknown }, now = new Date()) {
    const [subscriptions, payments, trialUsers] = await Promise.all([
      SubscriptionModel.find({}).lean(),
      PaymentModel.aggregate<{
        _id: string;
        count: number;
        total: number;
        lastPaidAt: Date | null;
      }>([
        { $match: { status: 'paid' } },
        {
          $group: {
            _id: '$username',
            count: { $sum: 1 },
            total: { $sum: '$amountCents' },
            lastPaidAt: { $max: '$paidAt' },
          },
        },
      ]),
      UserModel.find({ origin: 'trial', trialEndsAt: { $ne: null } }).lean(),
    ]);
    const bySubscriber = new Map(subscriptions.map((sub) => [sub.username, sub]));
    const usernames = [...new Set([...bySubscriber.keys(), ...trialUsers.map((u) => u.username)])];
    const users = await UserModel.find(
      { username: { $in: usernames } },
      { username: 1, name: 1, email: 1, origin: 1, trialEndsAt: 1 },
    ).lean();
    const userByName = new Map(users.map((user) => [user.username, user]));
    const paymentsByUser = new Map(payments.map((row) => [row._id, row]));

    const items = usernames.flatMap((username) => {
      const user = userByName.get(username);
      if (!user) return [];
      const sub = bySubscriber.get(username);
      const hasStripeSubscription = Boolean(sub?.stripeSubscriptionId);
      // Trial sem assinatura real aparece como "trial", mesmo que tenha aberto o checkout.
      if (!hasStripeSubscription && user.origin === 'trial') {
        return [
          {
            username,
            name: user.name,
            email: user.email ?? sub?.email ?? null,
            plan: null,
            status: 'trial' as AdminSubscriptionStatus,
            trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
            trialExpired: Boolean(user.trialEndsAt && user.trialEndsAt <= now),
            startedAt: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            stripeCustomerId: sub?.stripeCustomerId ?? null,
            paymentsCount: 0,
            totalPaidCents: 0,
            lastPaymentAt: null,
          },
        ];
      }
      if (!sub) return [];
      const paid = paymentsByUser.get(username);
      return [
        {
          username,
          name: user.name,
          email: user.email ?? sub.email ?? null,
          plan: isPlanId(sub.plan) ? sub.plan : null,
          status: (hasStripeSubscription ? sub.status : 'incomplete') as AdminSubscriptionStatus,
          trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
          trialExpired: false,
          startedAt: sub.startedAt?.toISOString() ?? null,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          stripeCustomerId: sub.stripeCustomerId ?? null,
          paymentsCount: paid?.count ?? 0,
          totalPaidCents: paid?.total ?? 0,
          lastPaymentAt: paid?.lastPaidAt?.toISOString() ?? null,
        },
      ];
    });
    const filtered = items
      .filter((item) => !filters.status || item.status === filters.status)
      .filter((item) => !filters.plan || item.plan === filters.plan)
      .sort((a, b) =>
        (b.startedAt ?? b.trialEndsAt ?? '').localeCompare(a.startedAt ?? a.trialEndsAt ?? ''),
      );
    return {
      items: filtered,
      stripeDashboardUrl: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')
        ? 'https://dashboard.stripe.com/test'
        : 'https://dashboard.stripe.com',
    };
  }
}
