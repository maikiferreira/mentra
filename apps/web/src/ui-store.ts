import { create } from 'zustand';
import type { AuthUser } from './api';

const savedSession = (() => {
  try {
    return JSON.parse(localStorage.getItem('mente-ativa-session') ?? 'null') as {
      token: string;
      user: AuthUser;
    } | null;
  } catch {
    return null;
  }
})();

interface WelcomeCredentials {
  username: string;
  password: string;
  name: string;
}
interface UIState {
  session: { token: string; user: AuthUser } | null;
  welcome: WelcomeCredentials | null;
  justRegistered: Record<string, string>;
  setSession: (session: { token: string; user: AuthUser }) => void;
  logout: () => void;
  setWelcome: (welcome: WelcomeCredentials | null) => void;
  markRegistered: (patientId: string, date: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  session: savedSession,
  welcome: null,
  justRegistered: {},
  setSession: (session) => {
    localStorage.setItem('mente-ativa-session', JSON.stringify(session));
    set({ session });
  },
  logout: () => {
    localStorage.removeItem('mente-ativa-session');
    set({ session: null, welcome: null, justRegistered: {} });
  },
  setWelcome: (welcome) => set({ welcome }),
  markRegistered: (patientId, date) =>
    set((state) => ({ justRegistered: { ...state.justRegistered, [patientId]: date } })),
}));
