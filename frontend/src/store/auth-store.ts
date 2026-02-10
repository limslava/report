import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  fullName: string;
  department: string;
  role: string;
}

const LAST_ACTIVITY_KEY = 'last-activity-at';

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => {
        try {
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        } catch {
          // ignore storage errors
        }
        set({ token, user });
      },
      logout: () => {
        try {
          localStorage.removeItem(LAST_ACTIVITY_KEY);
        } catch {
          // ignore storage errors
        }
        set({ token: null, user: null });
      },
      updateUser: (updated) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updated } : null,
        })),
    }),
    {
      name: 'auth-storage',
    }
  )
);
