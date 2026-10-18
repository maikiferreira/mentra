import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../ui-store';
import { Brand } from '../components/Brand';
import { WelcomeModal } from './WelcomeModal';
import { TrialBanner } from '../pages/billing/TrialBanner';

export function AppShell({ children }: { children: ReactNode }) {
  const session = useUIStore((state) => state.session)!;
  const logout = useUIStore((state) => state.logout);
  const queryClient = useQueryClient();
  const location = useLocation();
  const path = location.pathname;
  const active =
    path === '/'
      ? 'home'
      : path.startsWith('/pacientes')
        ? 'list'
        : path.startsWith('/rotinas')
          ? 'routine'
          : path.startsWith('/admin/assinaturas')
            ? 'subscriptions'
            : path.startsWith('/perfil/assinatura') || path.startsWith('/assinatura')
              ? 'billing'
              : 'users';
  const icon = {
    home: (
      <svg viewBox="0 0 24 24">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
    list: (
      <svg viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
        <path d="M16 4.7a3.5 3.5 0 010 6.6M18.5 14.9c1.6.8 2.8 2.5 3 5.1" />
      </svg>
    ),
    routine: (
      <svg viewBox="0 0 24 24">
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" />
      </svg>
    ),
    users: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" />
      </svg>
    ),
    billing: (
      <svg viewBox="0 0 24 24">
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19M6.5 15h4" />
      </svg>
    ),
    subscriptions: (
      <svg viewBox="0 0 24 24">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  };
  const nav = [
    ['home', 'Início', '/'],
    ['list', 'Pacientes', '/pacientes'],
    ['routine', 'Rotinas', '/rotinas'],
  ] as const;
  const extraNav =
    session.user.role === 'admin'
      ? ([
          ['users', 'Usuários', '/usuarios'],
          ['subscriptions', 'Assinaturas', '/admin/assinaturas'],
        ] as const)
      : ([['billing', 'Assinatura', '/perfil/assinatura']] as const);
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <nav aria-label="Menu principal">
          {[...nav, ...extraNav].map(([key, label, to]) => (
            <Link
              className="navb"
              key={key}
              to={to}
              aria-current={active === key ? 'page' : undefined}
            >
              {icon[key]}
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="usr">
          <div>
            <b>{session.user.name}</b>
            <span className="muted">
              {session.user.role === 'admin' ? 'Administrador' : 'Profissional'} ·{' '}
              {session.user.username}
            </span>
          </div>
          <button
            className="btn small"
            onClick={() => {
              logout();
              queryClient.clear();
            }}
          >
            Sair
          </button>
        </div>
      </aside>
      <div className="content">
        {session.user.role !== 'admin' && <TrialBanner />}
        <main>{children}</main>
        <p className="principle">
          <b>A tecnologia sugere. O profissional decide.</b> As sugestões não são diagnóstico nem
          prescrição.
        </p>
      </div>
      <WelcomeModal />
    </div>
  );
}
