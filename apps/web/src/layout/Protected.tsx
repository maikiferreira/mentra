import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../ui-store';
import { AppShell } from './AppShell';
import { client } from '../lib/client';

export function Protected() {
  const session = useUIStore((state) => state.session);
  const location = useLocation();
  const queryClient = useQueryClient();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
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
