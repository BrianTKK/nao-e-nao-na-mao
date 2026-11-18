import { useSyncExternalStore } from 'react';
import type { OutboxSnapshot } from '@nenm/shared';
import { outbox } from '@/data/outbox';

/** Toques guardados sem sinal e avisos do que não foi aplicado, sempre atuais. */
export function useOutbox(): OutboxSnapshot {
  return useSyncExternalStore(outbox.subscribe, outbox.snapshot, outbox.snapshot);
}
