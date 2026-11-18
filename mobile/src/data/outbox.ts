import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createOutbox } from '@nenm/shared';
import { dataSource } from '@/data/source';

const KEY = 'nenm.outbox.v1';
/** Com toque guardado, tenta de novo neste intervalo mesmo sem aviso de reconexão. */
const RETRY_MS = 15_000;

/**
 * Fila de toques sem sinal deste aparelho (regras em shared/src/data/outbox.ts).
 * "Vi o alerta", "Estou indo" e "Encerrar" passam por aqui: sem conexão, ficam
 * guardados no AsyncStorage e saem quando ela volta, mesmo que o app tenha
 * sido fechado no meio.
 */
/** Quem está logado neste aparelho agora (a sessão avisa a cada entrada e saída). */
let activeUser: string | null = null;
export function setOutboxUser(userId: string | null): void {
  activeUser = userId;
}

const authLostListeners = new Set<() => void>();
/** Avisa quando o servidor recusa o login no meio de um envio: a sessão confere e manda a pessoa entrar de novo. */
export function onOutboxAuthLost(listener: () => void): () => void {
  authLostListeners.add(listener);
  return () => authLostListeners.delete(listener);
}

export const outbox = createOutbox({
  staff: dataSource.staff,
  storage: {
    // Sem `catch` na leitura: se ela falhar, a fila tenta de novo em vez de gravar uma fila vazia por cima.
    get: () => AsyncStorage.getItem(KEY),
    set: (value) => AsyncStorage.setItem(KEY, value).catch(() => {}),
  },
  // O envio usa o login do aparelho: o toque de quem saiu não sai com o login de quem entrou.
  currentUserId: () => activeUser,
  onAuthLost: () => authLostListeners.forEach((l) => l()),
});

/**
 * Envia sozinho o que está guardado para quem entrou: ao entrar, quando o tempo
 * real reconecta, quando a pessoa volta ao app e, enquanto houver toque
 * guardado, a cada 15 s. Devolve como parar (ao sair).
 */
export function startOutboxSync(userId: string): () => void {
  const flush = () => {
    outbox.flush(userId).catch(() => {});
  };
  const stopConnection = dataSource.watchConnection((state) => {
    if (state === 'online') flush();
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') flush();
  });
  const timer = setInterval(() => {
    if (outbox.snapshot().actions.some((a) => a.userId === userId)) flush();
  }, RETRY_MS);
  flush();
  return () => {
    stopConnection();
    appState.remove();
    clearInterval(timer);
  };
}
