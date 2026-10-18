import { useMutation, useQuery } from '@tanstack/react-query';
import type { SubscriptionStatus } from '@mente-ativa/shared';
import { jsonBody, type BillingMe } from '../../api';
import { client } from '../../lib/client';
import { useUIStore } from '../../ui-store';

export const billingMeKey = (username: string) => ['billing-me', username] as const;

export function useBillingMe(
  options: { refetchInterval?: (data: BillingMe | undefined) => number | false } = {},
) {
  const username = useUIStore((state) => state.session?.user.username ?? '');
  const { refetchInterval } = options;
  return useQuery({
    queryKey: billingMeKey(username),
    queryFn: () => client<BillingMe>('/billing/me'),
    enabled: Boolean(username),
    ...(refetchInterval
      ? {
          refetchInterval: (query: { state: { data: BillingMe | undefined } }) =>
            refetchInterval(query.state.data),
        }
      : {}),
  });
}

/** Sai do app para uma página hospedada pelo Stripe (Checkout ou Portal). */
export const redirectTo = (url: string) => window.location.assign(url);

export function useCheckout() {
  return useMutation({
    mutationFn: (plan: string) =>
      client<{ url: string }>('/billing/checkout', { method: 'POST', body: jsonBody({ plan }) }),
    onSuccess: ({ url }) => redirectTo(url),
  });
}

export function usePortal() {
  return useMutation({
    mutationFn: () => client<{ url: string }>('/billing/portal', { method: 'POST' }),
    onSuccess: ({ url }) => redirectTo(url),
  });
}

export const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
    : '';

export const STATUS_LABEL: Record<SubscriptionStatus, { label: string; tone: string }> = {
  active: { label: 'Ativa', tone: 'up' },
  trialing: { label: 'Em teste', tone: 'acc' },
  incomplete: { label: 'Aguardando pagamento', tone: 'warn' },
  past_due: { label: 'Pagamento pendente', tone: 'warn' },
  canceled: { label: 'Cancelada', tone: 'down' },
};

export const PAYMENT_STATUS_LABEL = {
  paid: { label: 'Pago', tone: 'up' },
  failed: { label: 'Falhou', tone: 'down' },
  refunded: { label: 'Reembolsado', tone: '' },
} as const;

export const daysLabel = (days: number) => (days === 1 ? '1 dia' : `${days} dias`);
