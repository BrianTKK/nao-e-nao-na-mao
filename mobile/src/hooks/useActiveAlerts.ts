import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Alert } from '@nenm/shared';
import { dataSource } from '@/data/source';
import { ring, setContinuousVibration, silence } from '@/notifications/alarm';

export { setupNotifications } from '@/notifications/alarm';

/**
 * Alertas abertos do bar, ao vivo, com o alarme (ver notifications/alarm.ts).
 * Toca enquanto o alerta estiver "novo" (ninguém viu) ou, se a gerência me
 * mandou, até eu tocar em "Estou indo". Para sozinho quando isso muda.
 *
 * Só toca com o app aberto ou em segundo plano recente: com o app fechado, o
 * aviso precisaria de push remoto, que o Expo Go do Android não tem.
 */
export function useActiveAlerts(meId: string | null): Alert[] | null {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const first = useRef(true);
  const ringing = useRef<Map<string, 'new' | 'assigned'>>(new Map());

  useEffect(() => {
    if (!meId) return;
    first.current = true;
    const stop = dataSource.staff.watchActiveAlerts((list) => {
      setAlerts(list);
      const now = new Map<string, 'new' | 'assigned'>();
      for (const a of list) {
        if (a.assignedToId === meId && !a.responderId) now.set(a.id, 'assigned');
        else if (a.status === 'open') now.set(a.id, 'new');
      }
      // Na primeira lista (abrir o app) não toca o que já estava aberto antes: só vibra.
      for (const [id, why] of now) {
        if (ringing.current.get(id) === why) continue;
        const alert = list.find((a) => a.id === id)!;
        if (!first.current || why === 'assigned') ring(alert, why === 'assigned').catch(() => {});
      }
      for (const id of ringing.current.keys()) if (!now.has(id)) silence(id).catch(() => {});
      ringing.current = now;
      first.current = false;
      setContinuousVibration(now.size > 0 && AppState.currentState === 'active');
    });
    // Ao voltar para o app com alerta tocando, a vibração contínua recomeça; ao sair, para.
    const sub = AppState.addEventListener('change', (state) => setContinuousVibration(state === 'active' && ringing.current.size > 0));
    return () => {
      stop();
      sub.remove();
      setContinuousVibration(false);
      for (const id of ringing.current.keys()) silence(id).catch(() => {});
      ringing.current = new Map();
    };
  }, [meId]);

  return alerts;
}
