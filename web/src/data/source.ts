import { createMockDataSource, type DataSource } from '@nenm/shared';

/**
 * Escolhe a implementação da camada de dados.
 * VITE_DATA_SOURCE=mock (padrão): dados simulados no navegador; abas do mesmo
 * navegador conversam entre si (localStorage + BroadcastChannel).
 * VITE_DATA_SOURCE=api: o servidor próprio (server/), a partir da fatia F1.
 */
function safeStorage(): Storage | undefined {
  try {
    const s = window.localStorage;
    s.setItem('nenm.probe', '1');
    s.removeItem('nenm.probe');
    return s;
  } catch {
    return undefined; // aba anônima ou armazenamento bloqueado: fica só em memória
  }
}

function createDataSource(): DataSource {
  const kind = import.meta.env.VITE_DATA_SOURCE ?? 'mock';
  if (kind !== 'mock') {
    console.warn(`VITE_DATA_SOURCE=${kind} ainda não existe nesta fatia; usando os dados simulados.`);
  }
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nenm-mock') : undefined;
  return createMockDataSource({ storage: safeStorage(), channel, latencyMs: 350 });
}

export const dataSource = createDataSource();
