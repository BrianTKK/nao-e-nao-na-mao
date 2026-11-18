import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { applyPending, pendingFor, type Alert } from '@nenm/shared';
import { dataSource } from '@/data/source';
import { outbox } from '@/data/outbox';
import { rememberAlerts } from '@/data/alertCache';
import { dismissStale, ring, setContinuousVibration, silence } from '@/notifications/alarm';

export { setupNotifications } from '@/notifications/alarm';

/**
 * Alertas abertos do bar, ao vivo, com o alarme (ver notifications/alarm.ts).
 * Toca enquanto o alerta estiver "novo" (ninguém viu) ou, se a gerência me
 * mandou, até eu tocar em "Estou indo". Para sozinho quando isso muda.
 *
 * Os toques desta pessoa guardados sem sinal já contam: o alerta aparece como
 * vai ficar quando eles chegarem ao servidor, e o alarme dele para na hora (a
 * pessoa já viu ou já está indo, só o envio é que espera).
 *
 * No Expo Go, só toca com o app aberto ou em segundo plano recente: com o app
 * fechado, o aviso precisa do push remoto, que só o app próprio (APK) tem.
 */
export function useActiveAlerts(me: { id: string; fullName: string } | null): Alert[] | null {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const first = useRef(true);
  const ringing = useRef<Map<string, 'new' | 'assigned'>>(new Map());
  const meId = me?.id ?? null;
  const fullName = me?.fullName ?? '';

  useEffect(() => {
    if (!meId) return;
    first.current = true;
    /** A última lista que o servidor mandou, sem os toques guardados. */
    let fromServer: Alert[] | null = null;

    const evaluate = () => {
      if (!fromServer) return;
      const pending = pendingFor(outbox.snapshot(), meId);
      const list = pending.length ? fromServer.map((a) => applyPending(a, pending, { id: meId, fullName })) : fromServer;
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
      // Avisos do push de alertas que alguém já viu com o celular fechado.
      dismissStale(new Set(now.keys())).catch(() => {});
      setContinuousVibration(now.size > 0 && AppState.currentState === 'active');
    };

    const stop = dataSource.staff.watchActiveAlerts((list) => {
      fromServer = list;
      rememberAlerts(list);
      evaluate();
    });
    const stopOutbox = outbox.subscribe(evaluate);
    // Ao voltar para o app com alerta tocando, a vibração contínua recomeça; ao sair, para.
    const sub = AppState.addEventListener('change', (state) => setContinuousVibration(state === 'active' && ringing.current.size > 0));
    return () => {
      stop();
      stopOutbox();
      sub.remove();
      setContinuousVibration(false);
      for (const id of ringing.current.keys()) silence(id).catch(() => {});
      ringing.current = new Map();
    };
  }, [meId, fullName]);

  return alerts;
}
