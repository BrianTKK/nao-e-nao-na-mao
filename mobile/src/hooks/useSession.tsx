import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StaffMember } from '@nenm/shared';
import { dataSource } from '@/data/source';

interface SessionState {
  /** undefined enquanto carrega; null sem login. */
  me: StaffMember | null | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<StaffMember | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    setMe(await dataSource.staff.currentStaff());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<SessionState>(
    () => ({
      me,
      refresh,
      signIn: async (email, password) => setMe(await dataSource.staff.signIn(email, password)),
      signOut: async () => {
        await dataSource.staff.signOut();
        setMe(null);
      },
    }),
    [me, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fora do SessionProvider');
  return ctx;
}
