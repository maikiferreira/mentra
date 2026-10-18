import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../ui-store';
import { AppShell } from './AppShell';
import { client } from '../lib/client';
import { onSubscriptionRequired } from '../api';

export function Protected() {
  const session = useUIStore((state) => state.session);
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    // RN-PAY-05: sem acesso válido, qualquer 402 da API leva à escolha de plano.
    onSubscriptionRequired(() => navigate('/assinatura/planos', { replace: true }));
    return () => onSubscriptionRequired(null);
  }, [navigate]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    client('/auth/me').catch(() => {
      if (active) {
        useUIStore.getState().logout();
        queryClient.clear();
      }
    });
    return () => {
      active = false;
    };
  }, [queryClient, session]);
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
