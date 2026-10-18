import { Link } from 'react-router-dom';
import { PLANS, formatBRL } from '@mente-ativa/shared';
import {
  PAYMENT_STATUS_LABEL,
  STATUS_LABEL,
  daysLabel,
  formatDate,
  useBillingMe,
  usePortal,
} from './billing-shared';

export function SubscriptionSettingsPage() {
  const me = useBillingMe();
  const portal = usePortal();
  if (me.isLoading)
    return (
      <p className="muted" role="status">
        Carregando…
      </p>
    );
  if (me.error || !me.data)
    return (
      <div className="note warn" role="alert">
        {me.error?.message ?? 'Não foi possível carregar a assinatura.'}
      </div>
    );
  const data = me.data;
  const plan = data.plan ? PLANS[data.plan] : null;
  const status = data.status ? STATUS_LABEL[data.status] : null;
  const ending = data.cancelAtPeriodEnd || data.status === 'canceled';
  const inTrial = data.reason === 'trial' && data.trialDaysLeft > 0;
  return (
    <>
      <div className="head">
        <h1>Assinatura</h1>
        <p className="muted">Plano, forma de pagamento e histórico de cobranças.</p>
      </div>
      <div className="stack">
        {data.reason === 'exempt' ? (
          <div className="panel">
            <p className="muted">Sua conta tem acesso liberado e não precisa de assinatura.</p>
          </div>
        ) : (
          <div className="panel sub-summary">
            {inTrial && (
              <div className="note" style={{ marginBottom: 14 }}>
                Seu teste grátis termina em <b>{daysLabel(data.trialDaysLeft)}</b> (
                {formatDate(data.trialEndsAt)}).
              </div>
            )}
            <dl className="sub-facts">
              <div>
                <dt>Status</dt>
                <dd>
                  {status ? (
                    <span className={`chip ${status.tone}`}>{status.label}</span>
                  ) : inTrial ? (
                    <span className="chip acc">Teste grátis</span>
                  ) : (
                    <span className="chip">Sem assinatura</span>
                  )}
                </dd>
              </div>
              {plan && (
                <>
                  <div>
                    <dt>Plano</dt>
                    <dd>{plan.label}</dd>
                  </div>
                  <div>
                    <dt>Valor</dt>
                    <dd>
                      {formatBRL(plan.priceCents)}/{plan.interval === 'month' ? 'mês' : 'ano'}
                    </dd>
                  </div>
                </>
              )}
              {data.currentPeriodEnd && (
                <div>
                  <dt>{ending ? 'Acesso até' : 'Próxima cobrança'}</dt>
                  <dd>{formatDate(data.currentPeriodEnd)}</dd>
                </div>
              )}
            </dl>
            {ending && data.currentPeriodEnd && (
              <div className="note warn" style={{ marginTop: 14 }}>
                Cancelada: acesso até {formatDate(data.currentPeriodEnd)}. Nenhuma nova cobrança
                será feita.
              </div>
            )}
            {data.status === 'past_due' && (
              <div className="note warn" style={{ marginTop: 14 }}>
                Não conseguimos cobrar o seu cartão. Atualize a forma de pagamento para manter o
                acesso.
              </div>
            )}
            {portal.error && (
              <div className="note warn" role="alert" style={{ marginTop: 14 }}>
                {portal.error.message}
              </div>
            )}
            <div className="actions" style={{ marginTop: 16 }}>
              {data.canManage && data.status && data.status !== 'incomplete' ? (
                <>
                  <button
                    className="btn primary"
                    disabled={portal.isPending}
                    onClick={() => portal.mutate()}
                  >
                    Atualizar forma de pagamento
                  </button>
                  {!ending && (
                    <button
                      className="btn"
                      disabled={portal.isPending}
                      onClick={() => portal.mutate()}
                    >
                      Cancelar assinatura
                    </button>
                  )}
                  {ending && (
                    <button
                      className="btn"
                      disabled={portal.isPending}
                      onClick={() => portal.mutate()}
                    >
                      Reativar assinatura
                    </button>
                  )}
                </>
              ) : (
                <Link className="btn primary" to="/assinatura/planos">
                  Ver planos
                </Link>
              )}
            </div>
          </div>
        )}
        <div>
          <h2 style={{ marginBottom: 12 }}>Histórico de pagamentos</h2>
          {data.payments.length ? (
            <div className="panel">
              <div className="tblwrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Plano</th>
                      <th className="num">Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDate(payment.paidAt ?? payment.createdAt)}</td>
                        <td>{payment.plan ? PLANS[payment.plan].label : '—'}</td>
                        <td className="num">{formatBRL(payment.amountCents)}</td>
                        <td>
                          <span className={`chip ${PAYMENT_STATUS_LABEL[payment.status].tone}`}>
                            {PAYMENT_STATUS_LABEL[payment.status].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="panel">
              <p className="muted">Nenhum pagamento registrado ainda.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
