import type { ReactNode } from 'react';

import { useMemo, useState, useEffect, useContext, useCallback, createContext } from 'react';

import { api, session, refresh, type Me, type Role } from './api';

// ----------------------------------------------------------------------

type AuthState = {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<Me | null>;
  signIn: (t: { accessToken: string; refreshToken: string }) => Promise<Me | null>;
  signOut: () => Promise<void>;
  has: (role: Role) => boolean;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const m = await api.me();
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (session.hasRefresh() && (await refresh())) await reload();
      setLoading(false);
    })();
  }, [reload]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading,
      reload,
      signIn: async (t) => {
        session.save(t);
        return reload();
      },
      signOut: async () => {
        await api.logout().catch(() => {});
        session.clear();
        setMe(null);
      },
      has: (role) => !!me?.roles.some((r) => r.role === role),
    }),
    [me, loading, reload]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

/** Where a user lands after sign-in. */
export function homeFor(me: Me | null): string {
  if (!me) return '/login';
  if (me.roles.some((r) => r.role === 'hr')) return '/hr';
  if (me.roles.some((r) => r.role === 'merchant')) return '/shop';
  if (me.roles.some((r) => r.role === 'employee')) return '/me';
  return '/login';
}
