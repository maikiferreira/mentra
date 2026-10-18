import { create } from 'zustand';
import type { AuthUser } from './api';

const savedSession = (() => {
  try {
    return JSON.parse(localStorage.getItem('mentra-session') ?? 'null') as {
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
  justConfirmed: Record<string, string>;
  setSession: (session: { token: string; user: AuthUser }) => void;
  logout: () => void;
  setWelcome: (welcome: WelcomeCredentials | null) => void;
  markConfirmed: (patientId: string, date: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  session: savedSession,
  welcome: null,
  justConfirmed: {},
  setSession: (session) => {
    localStorage.setItem('mentra-session', JSON.stringify(session));
    set({ session });
  },
  logout: () => {
    localStorage.removeItem('mentra-session');
    set({ session: null, welcome: null, justConfirmed: {} });
  },
  setWelcome: (welcome) => set({ welcome }),
  markConfirmed: (patientId, date) =>
    set((state) => ({ justConfirmed: { ...state.justConfirmed, [patientId]: date } })),
}));
