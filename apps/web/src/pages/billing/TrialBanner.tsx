import { Link, useLocation } from 'react-router-dom';
import { daysLabel, useBillingMe } from './billing-shared';

/** Faixa no topo do app durante o teste grátis (RN-PAY-03). */
export function TrialBanner() {
  const me = useBillingMe();
  const location = useLocation();
  const days = me.data?.reason === 'trial' ? me.data.trialDaysLeft : 0;
  if (!days || location.pathname.startsWith('/assinatura')) return null;
  return (
    <div className="trial-banner" role="status">
      <span>
        Seu teste grátis termina em <b>{daysLabel(days)}</b>
      </span>
      <span aria-hidden="true">·</span>
      <Link className="link" to="/assinatura/planos">
        Assinar agora
      </Link>
    </div>
  );
}
