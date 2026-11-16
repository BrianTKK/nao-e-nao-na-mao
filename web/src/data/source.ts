import { createApiDataSource, createMockDataSource, type DataSource } from '@nenm/shared';

/**
 * Escolhe a implementação da camada de dados.
 * - VITE_DATA_SOURCE=api (padrão): o servidor (server/). Em produção a web é
 *   servida por ele, na mesma origem; em desenvolvimento o Vite repassa /api e
 *   /socket.io para o servidor local (vite.config.ts).
 * - VITE_DATA_SOURCE=mock: dados simulados no navegador, sem servidor; abas do
 *   mesmo navegador conversam entre si (localStorage + BroadcastChannel).
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

const SESSION_KEY = 'nenm.session';

function createDataSource(): DataSource {
  const storage = safeStorage();
  if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nenm-mock') : undefined;
    return createMockDataSource({ storage, channel, latencyMs: 350 });
  }
  return createApiDataSource({
    baseUrl: import.meta.env.VITE_API_URL ?? '',
    // Só o painel usa login; a página da mulher nunca grava nada além do próprio pedido (sessionStorage).
    tokenStore: {
      get: () => storage?.getItem(SESSION_KEY) ?? null,
      set: (v) => (v ? storage?.setItem(SESSION_KEY, v) : storage?.removeItem(SESSION_KEY)),
    },
  });
}

export const dataSource = createDataSource();

/** Mostra o atalho "preencher com a conta de teste" (bar de demonstração). VITE_SHOW_DEMO=0 esconde. */
export const showDemo = import.meta.env.VITE_SHOW_DEMO !== '0';
