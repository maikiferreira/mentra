import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PLANS, formatBRL, type PlanId } from '@mente-ativa/shared';
import { client } from '../../lib/client';
import { STATUS_LABEL, formatDate } from './billing-shared';

interface Summary {
  kpis: {
    activeMonthly: number;
    activeAnnual: number;
    active: number;
    inTrial: number;
    pastDue: number;
    canceledThisMonth: number;
    mrrCents: number;
    arrCents: number;
    revenueThisMonthCents: number;
    revenueTotalCents: number;
    averageTicketCents: number;
    trialConversionRate: number | null;
    trialsLast30Days: number;
    convertedTrialsLast30Days: number;
    churnRate: number | null;
  };
  series: Array<{
    month: string;
    revenueCents: number;
    newSubscriptions: number;
    cancellations: number;
  }>;
  upcoming: { renewals: number; expectedRevenueCents: number };
}
type AdminStatus = 'trial' | 'trialing' | 'incomplete' | 'active' | 'past_due' | 'canceled';
interface SubscriptionRow {
  username: string;
  name: string;
  email: string | null;
  plan: PlanId | null;
  status: AdminStatus;
  trialEndsAt: string | null;
  trialExpired: boolean;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  paymentsCount: number;
  totalPaidCents: number;
  lastPaymentAt: string | null;
}

const TOKENS = ['--chart-1', '--chart-2', '--line', '--muted', '--ink', '--surface'] as const;
type Token = (typeof TOKENS)[number];

/** Lê as cores dos tokens do CSS e acompanha a troca de tema claro/escuro. */
function useTokens(): Record<Token, string> {
  const read = () => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      TOKENS.map((token) => [token, style.getPropertyValue(token).trim() || 'currentColor']),
    ) as Record<Token, string>;
  };
  const [tokens, setTokens] = useState(read);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setTokens(read());
    media?.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      media?.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  return tokens;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = (key: string) => {
  const [year, month] = key.split('-');
  return `${MONTHS[Number(month) - 1]}/${year?.slice(2)}`;
};
const percent = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const compactNumber = (value: number) =>
  value.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

const STATUS_FILTERS: Array<[AdminStatus | '', string]> = [
  ['', 'Todos os status'],
  ['active', 'Ativa'],
  ['trial', 'Em teste grátis'],
  ['past_due', 'Pagamento pendente'],
  ['canceled', 'Cancelada'],
  ['incomplete', 'Checkout não concluído'],
];

function statusChip(row: SubscriptionRow) {
  if (row.status === 'trial')
    return row.trialExpired ? (
      <span className="chip">Teste encerrado</span>
    ) : (
      <span className="chip acc">Teste grátis</span>
    );
  const status = STATUS_LABEL[row.status];
  return (
    <span className={`chip ${status.tone}`}>
      {row.cancelAtPeriodEnd && row.status === 'active'
        ? 'Cancela no fim do período'
        : status.label}
    </span>
  );
}

function Kpi({ value, label, warn }: { value: string | number; label: string; warn?: boolean }) {
  return (
    <div className={`kpi${warn ? ' warn' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

const tooltipStyle = (tokens: Record<Token, string>) => ({
  contentStyle: {
    background: tokens['--surface'],
    border: `1px solid ${tokens['--line']}`,
    borderRadius: 10,
    color: tokens['--ink'],
  },
  labelStyle: { color: tokens['--ink'], fontWeight: 600 },
  itemStyle: { color: tokens['--ink'] },
});

export function AdminBillingPage() {
  const [status, setStatus] = useState<AdminStatus | ''>('');
  const [plan, setPlan] = useState<PlanId | ''>('');
  const tokens = useTokens();
  const summary = useQuery({
    queryKey: ['admin-billing-summary'],
    queryFn: () => client<Summary>('/admin/billing/summary'),
  });
  const list = useQuery({
    queryKey: ['admin-billing-subscriptions', status, plan],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (plan) params.set('plan', plan);
      return client<{ items: SubscriptionRow[]; stripeDashboardUrl: string }>(
        `/admin/billing/subscriptions?${params.toString()}`,
      );
    },
  });
  if (summary.isLoading)
    return (
      <p className="muted" role="status">
        Carregando…
      </p>
    );
  if (summary.error || !summary.data)
    return (
      <div className="note warn" role="alert">
        {summary.error?.message ?? 'Não foi possível carregar o painel.'}
      </div>
    );
  const { kpis, series, upcoming } = summary.data;
  const chartSeries = series.map((row) => ({
    ...row,
    label: monthLabel(row.month),
    revenue: row.revenueCents / 100,
  }));
  const planSplit = [
    { name: 'Mensal', value: kpis.activeMonthly, color: tokens['--chart-1'] },
    { name: 'Anual', value: kpis.activeAnnual, color: tokens['--chart-2'] },
  ];
  const axis = { stroke: tokens['--line'], tick: { fill: tokens['--muted'], fontSize: 12 } };
  const tooltip = tooltipStyle(tokens);

  return (
    <>
      <div className="head">
        <h1>Assinaturas</h1>
        <p className="muted">Receita, assinantes e testes grátis. Valores em reais.</p>
      </div>
      <div className="kpis billing-kpis">
        <Kpi value={formatBRL(kpis.mrrCents)} label="MRR (receita recorrente mensal)" />
        <Kpi value={formatBRL(kpis.arrCents)} label="ARR (receita recorrente anual)" />
        <Kpi
          value={kpis.active}
          label={`Assinaturas ativas (${kpis.activeMonthly} mensais · ${kpis.activeAnnual} anuais)`}
        />
        <Kpi value={kpis.inTrial} label="Em teste grátis" />
        <Kpi value={kpis.pastDue} label="Inadimplentes" warn={kpis.pastDue > 0} />
        <Kpi value={kpis.canceledThisMonth} label="Cancelamentos no mês" />
        <Kpi value={formatBRL(kpis.revenueThisMonthCents)} label="Receita do mês" />
        <Kpi value={formatBRL(kpis.revenueTotalCents)} label="Receita total" />
        <Kpi value={formatBRL(kpis.averageTicketCents)} label="Ticket médio por pagamento" />
        <Kpi
          value={percent(kpis.trialConversionRate)}
          label={`Conversão trial → pago, 30 dias (${kpis.convertedTrialsLast30Days} de ${kpis.trialsLast30Days})`}
        />
        <Kpi value={percent(kpis.churnRate)} label="Churn do mês" />
        <Kpi
          value={formatBRL(upcoming.expectedRevenueCents)}
          label={`Previsto em 30 dias (${upcoming.renewals} renovações)`}
        />
      </div>

      <div className="billing-charts">
        <figure className="panel chart-panel">
          <figcaption>
            <h2>Receita por mês (R$)</h2>
            <p className="muted">Pagamentos confirmados nos últimos 12 meses.</p>
          </figcaption>
          <div className="chart-area">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={tokens['--line']} strokeOpacity={0.6} />
                <XAxis dataKey="label" {...axis} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  {...axis}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(value: number) => compactNumber(value)}
                />
                <Tooltip
                  {...tooltip}
                  cursor={{ fill: tokens['--line'], fillOpacity: 0.4 }}
                  formatter={(value) => [formatBRL(Math.round(Number(value) * 100)), 'Receita']}
                />
                <Bar
                  dataKey="revenue"
                  name="Receita"
                  fill={tokens['--chart-1']}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <figure className="panel chart-panel">
          <figcaption>
            <h2>Novas assinaturas × cancelamentos</h2>
            <p className="muted">Quantidade por mês.</p>
          </figcaption>
          <div className="chart-area">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={tokens['--line']} strokeOpacity={0.6} />
                <XAxis dataKey="label" {...axis} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  {...axis}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip {...tooltip} cursor={{ stroke: tokens['--muted'], strokeWidth: 1 }} />
                <Legend wrapperStyle={{ color: tokens['--ink'], fontSize: 13 }} />
                <Line
                  type="monotone"
                  dataKey="newSubscriptions"
                  name="Novas assinaturas"
                  stroke={tokens['--chart-1']}
                  strokeWidth={2}
                  dot={{
                    r: 4,
                    strokeWidth: 2,
                    stroke: tokens['--surface'],
                    fill: tokens['--chart-1'],
                  }}
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    stroke: tokens['--surface'],
                    fill: tokens['--chart-1'],
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cancellations"
                  name="Cancelamentos"
                  stroke={tokens['--chart-2']}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={{
                    r: 4,
                    strokeWidth: 2,
                    stroke: tokens['--surface'],
                    fill: tokens['--chart-2'],
                  }}
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    stroke: tokens['--surface'],
                    fill: tokens['--chart-2'],
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <figure className="panel chart-panel">
          <figcaption>
            <h2>Mensal × anual</h2>
            <p className="muted">Assinaturas ativas por plano.</p>
          </figcaption>
          {kpis.active ? (
            <div className="donut">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={planSplit}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="88%"
                    stroke={tokens['--surface']}
                    strokeWidth={2}
                    cornerRadius={4}
                    isAnimationActive={false}
                  >
                    {planSplit.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltip} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="donut-legend">
                {planSplit.map((slice) => (
                  <li key={slice.name}>
                    <span className="swatch" style={{ background: slice.color }} />
                    {slice.name}: <b>{slice.value}</b> (
                    {Math.round((slice.value / kpis.active) * 100)}%)
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">Nenhuma assinatura ativa ainda.</p>
          )}
        </figure>
      </div>

      <details className="panel series-table">
        <summary>Ver os dados mensais em tabela</summary>
        <div className="tblwrap">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Receita</th>
                <th className="num">Novas</th>
                <th className="num">Cancelamentos</th>
              </tr>
            </thead>
            <tbody>
              {series.map((row) => (
                <tr key={row.month}>
                  <td>{monthLabel(row.month)}</td>
                  <td className="num">{formatBRL(row.revenueCents)}</td>
                  <td className="num">{row.newSubscriptions}</td>
                  <td className="num">{row.cancellations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="head" style={{ marginTop: 28 }}>
        <h2>Assinantes e testes</h2>
      </div>
      <div className="billing-filters">
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as AdminStatus)}>
            {STATUS_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plano
          <select value={plan} onChange={(event) => setPlan(event.target.value as PlanId)}>
            <option value="">Todos os planos</option>
            {Object.values(PLANS).map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="panel">
        {list.isLoading ? (
          <p className="muted" role="status">
            Carregando…
          </p>
        ) : list.error ? (
          <div className="note warn" role="alert">
            {list.error.message}
          </div>
        ) : list.data?.items.length ? (
          <div className="tblwrap">
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Aquisição</th>
                  <th>Vencimento / próxima cobrança</th>
                  <th className="num">Pagamentos</th>
                  <th className="num">Total pago</th>
                  <th>Último pagamento</th>
                  <th>Stripe</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((row) => (
                  <tr key={row.username}>
                    <td>
                      <b>{row.name}</b>
                      <br />
                      <span className="muted">
                        {row.username}
                        {row.email ? ` · ${row.email}` : ''}
                      </span>
                    </td>
                    <td>{row.plan ? PLANS[row.plan].label : '—'}</td>
                    <td>{statusChip(row)}</td>
                    <td>{formatDate(row.startedAt) || '—'}</td>
                    <td>
                      {row.status === 'trial'
                        ? `Teste até ${formatDate(row.trialEndsAt)}`
                        : formatDate(row.currentPeriodEnd) || '—'}
                    </td>
                    <td className="num">{row.paymentsCount}</td>
                    <td className="num">{formatBRL(row.totalPaidCents)}</td>
                    <td>{formatDate(row.lastPaymentAt) || '—'}</td>
                    <td>
                      {row.stripeCustomerId ? (
                        <a
                          className="link"
                          href={`${list.data.stripeDashboardUrl}/customers/${row.stripeCustomerId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nenhum registro com esses filtros.</p>
        )}
      </div>
    </>
  );
}
