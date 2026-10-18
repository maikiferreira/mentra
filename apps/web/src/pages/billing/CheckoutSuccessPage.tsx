import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useBillingMe } from './billing-shared';

const POLL_MS = 2_000;
const TIMEOUT_MS = 30_000;
const isActive = (status: string | null | undefined) =>
  status === 'active' || status === 'trialing';

/**
 * RN-PAY-10: esta página só observa. Quem libera o acesso é o webhook; aqui
 * consultamos /billing/me até a assinatura aparecer como ativa.
 */
export function CheckoutSuccessPage() {
  const [timedOut, setTimedOut] = useState(false);
  const me = useBillingMe({
    refetchInterval: (data) => (timedOut || isActive(data?.status) ? false : POLL_MS),
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirmed = isActive(me.data?.status);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!confirmed) return;
    // Telas carregadas antes do pagamento podem ter guardado o 402.
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== 'billing-me',
    });
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 2_500);
    return () => window.clearTimeout(timer);
  }, [confirmed, navigate, queryClient]);

  return (
    <div className="panel checkout-status" role="status" aria-live="polite">
      {confirmed ? (
        <>
          <h1>Acesso liberado!</h1>
          <p className="muted">Pagamento confirmado. Levando você para o início…</p>
          <Link className="btn primary" to="/">
            Ir para o início
          </Link>
        </>
      ) : timedOut ? (
        <>
          <h1>Pagamento em processamento</h1>
          <p className="muted">
            A confirmação está demorando mais que o normal. Assim que o pagamento for aprovado, você
            recebe um e-mail e o acesso é liberado automaticamente.
          </p>
          <Link className="btn" to="/perfil/assinatura">
            Ver minha assinatura
          </Link>
        </>
      ) : (
        <>
          <h1>Confirmando pagamento…</h1>
          <p className="muted">Isso costuma levar poucos segundos. Não feche esta página.</p>
        </>
      )}
    </div>
  );
}
