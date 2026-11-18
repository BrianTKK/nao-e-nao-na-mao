import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StaffMember } from '@nenm/shared';
import { dataSource } from '@/data/source';
import { startOutboxSync } from '@/data/outbox';
import { forgetAlerts } from '@/data/alertCache';
import { AppState } from 'react-native';
import { registerPush, shouldRetryPush, unregisterPush } from '@/notifications/push';

/** Quem entrou por último neste aparelho, para o app abrir sem sinal. Não é login: o servidor confere o token. */
const ME_KEY = 'nenm.me';
const saveMe = (me: StaffMember | null) =>
  (me ? AsyncStorage.setItem(ME_KEY, JSON.stringify(me)) : AsyncStorage.removeItem(ME_KEY)).catch(() => {});
async function loadMe(): Promise<StaffMember | null> {
  try {
    const me = JSON.parse((await AsyncStorage.getItem(ME_KEY)) ?? 'null') as StaffMember | null;
    return me && typeof me.id === 'string' && typeof me.fullName === 'string' ? me : null;
  } catch {
    return null;
  }
}

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

  /** O servidor ainda não confirmou quem está logado (app aberto sem sinal). */
  const unconfirmed = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const staff = await dataSource.staff.currentStaff();
      unconfirmed.current = false;
      setMe(staff);
      saveMe(staff);
    } catch {
      // Sem sinal ao abrir: segue com quem entrou por último neste aparelho, para a pessoa
      // conseguir ver e tocar (os toques ficam na fila). O servidor confirma quando o sinal voltar.
      unconfirmed.current = true;
      const last = await loadMe();
      setMe((current) => (current === undefined ? (last ?? undefined) : current));
    }
  }, []);

  useEffect(() => {
    refresh();
    // Enquanto o servidor não confirmou, tenta de novo quando a conexão ou a pessoa voltam.
    const retry = () => {
      if (unconfirmed.current) refresh();
    };
    const stop = dataSource.watchConnection((state) => state === 'online' && retry());
    const sub = AppState.addEventListener('change', (state) => state === 'active' && retry());
    const timer = setInterval(retry, 10_000);
    return () => {
      stop();
      sub.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  const meId = me?.id;

  // Fila de toques sem sinal: envia sozinha o que ficou guardado para quem entrou.
  useEffect(() => (meId ? startOutboxSync(meId) : undefined), [meId]);

  // Push remoto (só no app próprio do Android): registra o aparelho para quem entrou.
  useEffect(() => {
    if (!meId) return;
    registerPush().catch(() => {});
    // Sem rede ao abrir: tenta de novo quando a pessoa volta ao app (o servidor pode estar
    // com o token antigo deste aparelho, e o alarme local repetiria junto com o push).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && shouldRetryPush()) registerPush().catch(() => {});
    });
    return () => sub.remove();
  }, [meId]);

  const value = useMemo<SessionState>(
    () => ({
      me,
      refresh,
      signIn: async (email, password) => {
        const staff = await dataSource.staff.signIn(email, password);
        unconfirmed.current = false;
        saveMe(staff);
        setMe(staff);
      },
      signOut: async () => {
        // Antes de apagar o login: depois dele, o servidor não aceita mais o pedido.
        await unregisterPush();
        await dataSource.staff.signOut();
        unconfirmed.current = false;
        saveMe(null);
        forgetAlerts();
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
