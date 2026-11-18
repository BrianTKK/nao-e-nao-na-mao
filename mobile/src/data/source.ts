import AsyncStorage from '@react-native-async-storage/async-storage';
import { createApiDataSource, createMockDataSource, DEMO_SPOTS, type DataSource } from '@nenm/shared';

/**
 * Camada de dados do app.
 * - EXPO_PUBLIC_DATA_SOURCE=api (padrão): o servidor em EXPO_PUBLIC_API_URL
 *   (o endereço público, para o Expo Go funcionar de qualquer lugar).
 * - EXPO_PUBLIC_DATA_SOURCE=mock: dados simulados em memória, sem servidor.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://naoenao.obrian.me';

const SESSION_KEY = 'nenm.session';

function create(): DataSource {
  if (process.env.EXPO_PUBLIC_DATA_SOURCE === 'mock') return createMockDataSource({ latencyMs: 300 });
  return createApiDataSource({
    baseUrl: API_URL,
    // Com sinal fraco, a leitura desiste em 8 s e o app segue com o que tem guardado.
    readTimeoutMs: 8_000,
    tokenStore: {
      get: () => AsyncStorage.getItem(SESSION_KEY).catch(() => null),
      set: (v) => (v ? AsyncStorage.setItem(SESSION_KEY, v) : AsyncStorage.removeItem(SESSION_KEY)).catch(() => {}),
    },
  });
}

export const dataSource = create();

/** Atalhos do bar de demonstração (conta de teste e "Simular um alerta"). EXPO_PUBLIC_SHOW_DEMO=0 esconde. */
export const showDemo = process.env.EXPO_PUBLIC_SHOW_DEMO !== '0';

/** Cria um alerta como se alguém tivesse lido o QR code do banheiro feminino do bar de demonstração. */
export const simulateAlert = () => dataSource.public.createAlert(DEMO_SPOTS[0].code, 'unsafe');
