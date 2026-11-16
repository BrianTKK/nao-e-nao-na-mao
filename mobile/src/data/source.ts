import { createMockDataSource, type DataSource, type MockDataSource } from '@nenm/shared';

/**
 * Camada de dados do app. EXPO_PUBLIC_DATA_SOURCE=mock (padrão) usa os dados
 * simulados em memória; "api" (o servidor, em EXPO_PUBLIC_API_URL) chega na fatia F1.
 */
function create(): DataSource {
  const kind = process.env.EXPO_PUBLIC_DATA_SOURCE ?? 'mock';
  if (kind !== 'mock') {
    console.warn(`EXPO_PUBLIC_DATA_SOURCE=${kind} ainda não existe nesta fatia; usando os dados simulados.`);
  }
  return createMockDataSource({ latencyMs: 300 });
}

export const dataSource = create();

export const mockTools = (dataSource.kind === 'mock' ? dataSource : null) as MockDataSource | null;
