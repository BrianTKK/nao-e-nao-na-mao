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
export const outbox = createOutbox({
  staff: dataSource.staff,
  storage: {
    get: () => AsyncStorage.getItem(KEY).catch(() => null),
    set: (value) => AsyncStorage.setItem(KEY, value).catch(() => {}),
  },
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
