import { useEffect, useState } from 'react';
import type { Alert } from '@nenm/shared';
import { dataSource } from '../../data/source';

/** Alertas dos últimos `days` dias, recarregados a cada mudança (tempo real). */
export function useAlerts(days: number): { alerts: Alert[] | null; error: boolean } {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const to = new Date(Date.now() + 60_000).toISOString();
      const from = new Date(Date.now() - days * 86_400_000).toISOString();
      dataSource.manager
        .listAlerts({ from, to })
        .then((a) => {
          if (!alive) return;
          setAlerts([...a].sort((x, y) => y.createdAt.localeCompare(x.createdAt)));
          setError(false);
        })
        .catch(() => alive && setError(true));
    };
    load();
    const stop = dataSource.manager.watchAlerts(load);
    return () => {
      alive = false;
      stop();
    };
  }, [days]);

  return { alerts, error };
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
