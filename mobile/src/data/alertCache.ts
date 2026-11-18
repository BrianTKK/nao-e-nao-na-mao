import type { Alert } from '@nenm/shared';

/**
 * Último estado conhecido de cada alerta, em memória. Sem sinal, a tela do
 * alerta abre com o que a lista já tinha recebido, em vez de ficar em branco.
 */
const known = new Map<string, Alert>();

export function rememberAlerts(list: readonly Alert[]): void {
  for (const a of list) known.set(a.id, a);
}

export const recallAlert = (id: string): Alert | undefined => known.get(id);

export function forgetAlerts(): void {
  known.clear();
}
