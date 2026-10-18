import { PLANS, PLAN_BENEFITS, formatBRL, type PlanDefinition } from '@mente-ativa/shared';
import type { BillingMe } from '../../api';
import { formatDate, useBillingMe, useCheckout, usePortal } from './billing-shared';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.8" />
    </svg>
  );
}

const LIVE = ['active', 'trialing', 'past_due'];

function headline(me: BillingMe | undefined) {
  if (!me || me.hasAccess) return null;
  switch (me.reason) {
    case 'trial_expired':
      return 'Seu período de teste terminou. Escolha um plano para continuar acompanhando seus pacientes.';
    case 'past_due':
      return 'Não conseguimos cobrar a sua assinatura. Atualize a forma de pagamento no seu perfil.';
    case 'canceled':
      return 'Sua assinatura terminou. Escolha um plano para voltar a usar o Mente Ativa.';
    default:
      return 'Escolha um plano para começar a usar o Mente Ativa.';
  }
}

function PlanCard({
  plan,
  me,
  busy,
  onChoose,
}: {
  plan: PlanDefinition;
  me: BillingMe | undefined;
  busy: boolean;
  onChoose: () => void;
}) {
  const live = Boolean(me?.status && LIVE.includes(me.status));
  const current = live && me?.plan === plan.id;
  const featured = plan.id === 'annual';
  const perMonth = plan.monthlyEquivalentCents ?? plan.priceCents;
  return (
    <article
      className={`plan-card${featured ? ' featured' : ''}${current ? ' current' : ''}`}
      aria-labelledby={`plan-${plan.id}`}
    >
      <div className="plan-band" />
      <div className="plan-body">
        <div className="plan-top">
          {current ? (
            <span className="plan-badge current">Ativo</span>
          ) : plan.discountPercent ? (
            <span className="plan-badge save">Economize {plan.discountPercent}%</span>
          ) : (
            <span className="plan-badge placeholder" aria-hidden="true" />
          )}
          <h2 id={`plan-${plan.id}`} className="plan-name">
            {plan.label}
          </h2>
          <p className="muted">{plan.subtitle}</p>
        </div>
        <p className="plan-price">
          <b>{formatBRL(perMonth)}</b>
          <span>/mês</span>
        </p>
        <p className="plan-note muted">
          {plan.interval === 'year'
            ? `${formatBRL(plan.priceCents)} cobrados anualmente`
            : 'Cobrança mensal no cartão de crédito'}
        </p>
        <hr className="plan-divider" />
        <ul className="plan-benefits">
          {PLAN_BENEFITS.map((benefit) => (
            <li key={benefit}>
              <CheckIcon />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        {current ? (
          <button className="plan-cta current" disabled>
            {me?.cancelAtPeriodEnd
              ? `Acesso até ${formatDate(me.currentPeriodEnd)}`
              : `Renova em ${formatDate(me?.currentPeriodEnd ?? null)}`}
          </button>
        ) : (
          <button className="plan-cta" disabled={busy} onClick={onChoose}>
            {live ? 'Trocar para este plano' : 'Escolher plano'}
          </button>
        )}
      </div>
    </article>
  );
}

export function PlansPage() {
  const me = useBillingMe();
  const checkout = useCheckout();
  const portal = usePortal();
  const live = Boolean(me.data?.status && LIVE.includes(me.data.status));
  const message = headline(me.data);
  const error = checkout.error ?? portal.error;
  return (
    <>
      <div className="head">
        <h1>Planos</h1>
        <p className="muted">
          Acesso completo ao Mente Ativa. Pagamento recorrente no cartão de crédito, cancele quando
          quiser.
        </p>
      </div>
      {message && (
        <div className="note warn" role="status" style={{ marginBottom: 18 }}>
          {message}
        </div>
      )}
      {error && (
        <div className="note warn" role="alert" style={{ marginBottom: 18 }}>
          {error.message}
        </div>
      )}
      <div className="plan-grid">
        {Object.values(PLANS).map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            me={me.data}
            busy={checkout.isPending || portal.isPending}
            // Com assinatura viva, a troca de plano é feita no Portal do Stripe (RN-PAY-07).
            onChoose={() => (live ? portal.mutate() : checkout.mutate(plan.id))}
          />
        ))}
      </div>
      <p className="srcnote">
        Pagamento processado pelo Stripe. Aceitamos cartão de crédito; cartões múltiplos funcionam
        na função crédito.
      </p>
    </>
  );
}
