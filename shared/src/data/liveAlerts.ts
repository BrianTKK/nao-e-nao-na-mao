/**
 * Os alertas abertos como o app da equipe mostra e quais deles tocam o alarme.
 *
 * Função pura (sem React Native), para o hook do app e para os testes. Junta a
 * última lista do servidor com os toques desta pessoa que ainda não aparecem
 * nela: os guardados sem sinal, os que estão sendo enviados agora e os que o
 * servidor acabou de aceitar (a lista nova chega depois, pelo socket).
 */
import type { Alert } from '../domain';
import { applyPending, pendingFor, sendingFor, settledFor, type OutboxSnapshot } from './outbox';

/** Por que o alarme do alerta toca: ninguém viu (`new`) ou a gerência me mandou e eu ainda não disse "Estou indo". */
export type AlarmReason = 'new' | 'assigned';

export interface LiveAlerts {
  /** A lista como a tela mostra: com os toques guardados e os aceitos há pouco, sem os que estão em envio. */
  alerts: Alert[];
  /** Os alertas que devem tocar, e por quê. Conta também o toque em envio: o alarme para no toque. */
  ringing: Map<string, AlarmReason>;
}

export function liveAlerts(
  fromServer: readonly Alert[],
  snapshot: OutboxSnapshot,
  me: { id: string; fullName: string },
  now: number = Date.now(),
): LiveAlerts {
  const pending = pendingFor(snapshot, me.id);
  const sending = sendingFor(snapshot, me.id);
  const settled = settledFor(snapshot, me.id, undefined, now);
  // O toque aceito sai sozinho quando a lista nova chega: os estados só andam para a frente, então, com a
  // lista já mostrando o toque, `applyPending` não muda mais nada. A fila o descarta em `SETTLED_MS`,
  // um prazo longo: a lista nova pode demorar ou falhar, e o toque aceito nunca contradiz o servidor.
  const shown = [...settled, ...pending];
  const alerts = shown.length ? fromServer.map((a) => applyPending(a, shown, me)) : [...fromServer];
  const acted = sending.length ? fromServer.map((a) => applyPending(a, [...shown, ...sending], me)) : alerts;

  const ringing = new Map<string, AlarmReason>();
  for (const a of acted) {
    if (a.assignedToId === me.id && !a.responderId) ringing.set(a.id, 'assigned');
    else if (a.status === 'open') ringing.set(a.id, 'new');
  }
  return { alerts, ringing };
}
