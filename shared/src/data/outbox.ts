/**
 * Fila de toques sem sinal do app da equipe.
 *
 * Bar cheio tem conexão ruim. Se "Vi o alerta", "Estou indo" ou "Encerrar" não
 * chega ao servidor, o toque fica guardado no aparelho e é enviado quando a
 * conexão volta, na ordem em que foi feito.
 *
 * - Cada toque tem um id próprio. O servidor aplica cada id uma vez só, então
 *   reenviar (inclusive quando o toque chegou mas a resposta se perdeu) não
 *   repete a transição.
 * - Conflito não é sobrescrito: se, enquanto o aparelho estava sem sinal, outra
 *   pessoa assumiu ou encerrou o alerta, o toque guardado é descartado e vira
 *   um aviso para a tela mostrar. Os toques seguintes do mesmo alerta caem junto.
 * - Toque velho demais (12 h) é descartado com aviso.
 *
 * Não depende de React nem do React Native: a tela assina `subscribe` e lê
 * `snapshot`. Quem guarda no aparelho é o `storage` que o app passa.
 */
import { isActive, type Alert, type AlertOutcome } from '../domain';
import { DataError, type ActionMeta, type DataErrorCode, type StaffApi, type Unsubscribe } from './ports';

export type QueuedActionKind = 'ack' | 'start' | 'resolve';

export interface QueuedAction {
  /** Id do toque (UUID): a chave de idempotência no servidor. */
  id: string;
  kind: QueuedActionKind;
  alertId: string;
  /** Quem tocou: o toque só é enviado com o login dessa pessoa. */
  userId: string;
  /** Nome do local, para o aviso fazer sentido fora da tela do alerta. */
  spotLabel?: string;
  outcome?: AlertOutcome;
  note?: string;
  /** Hora do toque no relógio do aparelho (ms). */
  createdAt: number;
  /** Envios que falharam por erro inesperado (não conta a falta de conexão). */
  attempts: number;
}

/**
 * Por que um toque guardado não foi aplicado:
 * - `closed`: o alerta já tinha sido encerrado ou cancelado;
 * - `taken`: outra pessoa já tinha assumido;
 * - `not_found`: o alerta não existe mais;
 * - `failed`: o servidor recusou várias vezes por erro inesperado;
 * - `expired`: ficou guardado por tempo demais.
 */
export type OutboxNoticeReason = 'closed' | 'taken' | 'not_found' | 'failed' | 'expired';

export interface OutboxNotice {
  /** O id do toque descartado. */
  id: string;
  alertId: string;
  userId: string;
  kind: QueuedActionKind;
  spotLabel?: string;
  reason: OutboxNoticeReason;
  at: number;
}

export interface OutboxSnapshot {
  readonly actions: readonly QueuedAction[];
  readonly notices: readonly OutboxNotice[];
}

export interface OutboxStorage {
  get(): Promise<string | null> | string | null;
  set(value: string): Promise<void> | void;
}

export interface OutboxOptions {
  staff: Pick<StaffApi, 'ackAlert' | 'startResponse' | 'resolveAlert'>;
  storage: OutboxStorage;
  /** Gera o id de cada toque (padrão: UUID v4). */
  newId?: () => string;
  now?: () => number;
  /** Depois disso o toque guardado é descartado. Padrão: 12 h. */
  maxAgeMs?: number;
  /** Quantos erros inesperados do servidor um toque aguenta antes de ser descartado. Padrão: 5. */
  maxAttempts?: number;
}

export interface NewAction {
  kind: QueuedActionKind;
  alertId: string;
  userId: string;
  spotLabel?: string;
  outcome?: AlertOutcome;
  note?: string;
}

export interface Outbox {
  /**
   * Registra o toque e tenta enviar na hora.
   * - `sent`: o servidor aplicou;
   * - `queued`: sem conexão; ficou guardado e será enviado por `flush`.
   * Se o servidor recusar na hora (ex.: outra pessoa já está indo), lança o
   * `DataError` e não guarda nada.
   */
  perform(action: NewAction): Promise<'sent' | 'queued'>;
  /** Envia o que está guardado para esta pessoa. Chamar quando a conexão volta. */
  flush(userId: string): Promise<void>;
  snapshot(): OutboxSnapshot;
  subscribe(listener: () => void): Unsubscribe;
  dismissNotice(id: string): void;
  /** Resolve quando a fila guardada no aparelho foi lida. */
  readonly ready: Promise<void>;
}

const HOUR = 60 * 60 * 1000;
const MAX_NOTICES = 20;
/** Avisos antigos somem sozinhos. */
const NOTICE_TTL_MS = 24 * HOUR;
/** O servidor recusa `queuedMs` acima de 24 h. */
const QUEUED_MS_CAP = 24 * HOUR;

/** Erros do servidor que significam "outra coisa aconteceu com o alerta enquanto o toque esperava". */
const CONFLICT: Partial<Record<DataErrorCode, OutboxNoticeReason>> = {
  invalid_transition: 'closed',
  already_taken: 'taken',
  alert_not_found: 'not_found',
};

/** Falhas que não dizem nada sobre o toque: parar e tentar tudo de novo depois. */
const RETRY_LATER: DataErrorCode[] = ['network', 'rate_limited', 'not_staff'];

/** UUID v4. O id só precisa ser único (não é segredo: o servidor confere de quem é o toque). */
export function randomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function parse(raw: string | null): { actions: QueuedAction[]; notices: OutboxNotice[] } {
  try {
    const data = raw ? (JSON.parse(raw) as { v?: number; actions?: unknown; notices?: unknown }) : null;
    if (data?.v !== 1 || !Array.isArray(data.actions) || !Array.isArray(data.notices)) return { actions: [], notices: [] };
    const ok = (x: unknown): x is { id: string; alertId: string; userId: string; kind: string } =>
      !!x && typeof x === 'object' && ['id', 'alertId', 'userId', 'kind'].every((k) => typeof (x as Record<string, unknown>)[k] === 'string');
    return {
      actions: (data.actions as unknown[]).filter(ok).filter((a) => typeof (a as QueuedAction).createdAt === 'number') as QueuedAction[],
      notices: (data.notices as unknown[]).filter(ok) as OutboxNotice[],
    };
  } catch {
    return { actions: [], notices: [] };
  }
}

export function createOutbox(options: OutboxOptions): Outbox {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUuid;
  const maxAgeMs = options.maxAgeMs ?? 12 * HOUR;
  const maxAttempts = options.maxAttempts ?? 5;

  let actions: QueuedAction[] = [];
  let notices: OutboxNotice[] = [];
  let snap: OutboxSnapshot = { actions, notices };
  const listeners = new Set<() => void>();
  /** Toques cujo `perform` ainda está esperando: o erro volta para a tela, não vira aviso. */
  const direct = new Set<string>();
  const directFailures = new Map<string, DataErrorCode>();

  // As gravações saem em ordem; se o aparelho não deixar gravar, a fila segue em memória.
  let writes: Promise<void> = Promise.resolve();
  const commit = () => {
    snap = { actions: [...actions], notices: [...notices] };
    const json = JSON.stringify({ v: 1, actions, notices });
    writes = writes.then(() => options.storage.set(json)).then(
      () => {},
      () => {},
    );
    listeners.forEach((l) => l());
    return writes;
  };

  /** Tira o que venceu. Devolve se mudou algo. */
  const prune = () => {
    const t = now();
    const old = actions.filter((x) => t - x.createdAt > maxAgeMs);
    for (const a of old) discard(a, 'expired');
    const kept = notices.filter((n) => t - n.at <= NOTICE_TTL_MS);
    const changed = old.length > 0 || kept.length !== notices.length;
    notices = kept;
    return changed;
  };

  const ready: Promise<void> = Promise.resolve()
    .then(() => options.storage.get())
    .then(
      (raw) => {
        // O que foi tocado antes de a leitura terminar fica depois do que já estava guardado.
        const stored = parse(raw);
        actions = [...stored.actions, ...actions];
        notices = [...stored.notices, ...notices];
        prune();
        return commit();
      },
      () => {},
    );

  /**
   * Tira da fila o toque que não vai ser aplicado e os toques seguintes da mesma
   * pessoa no mesmo alerta (eles partiam do estado que o primeiro deixaria).
   * O aviso fala do primeiro toque que a pessoa de fato fez ("Vi o alerta" é automático).
   */
  function discard(action: QueuedAction, reason: OutboxNoticeReason, code: DataErrorCode = 'unknown') {
    const index = actions.indexOf(action);
    if (index < 0) return;
    const victims = actions.filter((a, i) => i >= index && a.alertId === action.alertId && a.userId === action.userId);
    actions = actions.filter((a) => !victims.includes(a));
    for (const v of victims) if (direct.has(v.id)) directFailures.set(v.id, code);
    const shown = victims.find((v) => v.kind !== 'ack' && !direct.has(v.id));
    if (shown) {
      notices = [
        ...notices,
        { id: shown.id, alertId: shown.alertId, userId: shown.userId, kind: shown.kind, spotLabel: shown.spotLabel, reason, at: now() },
      ].slice(-MAX_NOTICES);
    }
  }

  function send(action: QueuedAction): Promise<void> {
    const meta: ActionMeta = { actionId: action.id, queuedMs: Math.min(QUEUED_MS_CAP, Math.max(0, Math.round(now() - action.createdAt))) };
    if (action.kind === 'ack') return options.staff.ackAlert(action.alertId, meta);
    if (action.kind === 'start') return options.staff.startResponse(action.alertId, meta);
    // Sem desfecho o servidor recusa (outcome_required) e o toque acaba descartado como falha.
    return options.staff.resolveAlert(action.alertId, action.outcome as AlertOutcome, action.note, meta);
  }

  /** Uma rodada de envio. Devolve true se parou no meio (sem conexão ou sem login): o resto fica para depois. */
  async function run(userId: string, tried: Set<string>): Promise<boolean> {
    await ready;
    if (prune()) await commit();
    /** Alertas com um toque que falhou e ficou: os seguintes esperam, para manter a ordem. */
    const blocked = new Set<string>();
    for (;;) {
      // Relê a fila a cada volta: um toque feito durante o envio entra na mesma rodada.
      const action = actions.find((a) => a.userId === userId && !tried.has(a.id) && !blocked.has(a.alertId));
      if (!action) return false;
      tried.add(action.id);
      try {
        await send(action);
        actions = actions.filter((a) => a !== action);
      } catch (err) {
        const code: DataErrorCode = err instanceof DataError ? err.code : 'unknown';
        if (RETRY_LATER.includes(code)) {
          // Sem login válido, o toque feito agora não fica guardado: a tela mostra o erro.
          if (code === 'not_staff' && direct.has(action.id)) {
            discard(action, 'failed', code);
            await commit();
          }
          return true;
        }
        const conflict = CONFLICT[code];
        if (conflict) discard(action, conflict, code);
        else if (direct.has(action.id)) discard(action, 'failed', code);
        else {
          action.attempts += 1;
          if (action.attempts >= maxAttempts) discard(action, 'failed', code);
          else blocked.add(action.alertId);
        }
      }
      await commit();
    }
  }

  interface Round {
    userId: string;
    /** Toques que esta rodada tentou enviar. */
    tried: Set<string>;
    halted: boolean;
    done: Promise<void>;
  }
  /** Uma rodada por vez: duas ao mesmo tempo mandariam o mesmo toque duas vezes. */
  let round: Round | null = null;
  function startRound(userId: string): Round {
    if (round) {
      if (round.userId === userId) return round;
      // Outra pessoa entrou no aparelho no meio da rodada: a dela começa quando esta acabar.
      const previous = round;
      const chained: Round = { userId, tried: new Set(), halted: false, done: Promise.resolve() };
      chained.done = previous.done.then(async () => {
        const next = startRound(userId);
        await next.done;
        next.tried.forEach((id) => chained.tried.add(id));
        chained.halted = next.halted;
      });
      return chained;
    }
    const current: Round = { userId, tried: new Set(), halted: false, done: Promise.resolve() };
    current.done = run(userId, current.tried)
      .then(
        (halted) => {
          current.halted = halted;
        },
        () => {
          current.halted = true;
        },
      )
      .finally(() => {
        if (round === current) round = null;
      });
    round = current;
    return current;
  }
  const flush = (userId: string): Promise<void> => startRound(userId).done;

  return {
    ready,

    async perform(input) {
      await ready;
      const same = actions.find((a) => a.userId === input.userId && a.alertId === input.alertId && a.kind === input.kind);
      if (same) {
        // O mesmo toque já está guardado (ex.: abrir o alerta de novo sem sinal): não duplica.
        await flush(input.userId);
        return actions.includes(same) ? 'queued' : 'sent';
      }
      const action: QueuedAction = { ...input, id: newId(), createdAt: now(), attempts: 0 };
      actions = [...actions, action];
      direct.add(action.id);
      try {
        await commit();
        const first = startRound(input.userId);
        await first.done;
        // A rodada em curso pode ter terminado sem ver o toque novo: mais uma, a menos que ela
        // tenha parado por falta de conexão (tentar de novo agora só faria a pessoa esperar).
        if (actions.includes(action) && !first.tried.has(action.id) && !first.halted) await flush(input.userId);
      } finally {
        direct.delete(action.id);
      }
      const failure = directFailures.get(action.id);
      if (failure) {
        directFailures.delete(action.id);
        throw new DataError(failure);
      }
      return actions.includes(action) ? 'queued' : 'sent';
    },

    flush,
    snapshot: () => snap,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dismissNotice(id) {
      if (!notices.some((n) => n.id === id)) return;
      notices = notices.filter((n) => n.id !== id);
      void commit();
    },
  };
}

/**
 * O alerta como a tela deve mostrar enquanto há toques guardados desta pessoa:
 * o estado que o servidor vai ter quando eles chegarem. A tela avisa, ao lado,
 * que ainda não foi enviado.
 */
export function applyPending(alert: Alert, actions: readonly QueuedAction[], me: { id: string; fullName: string }): Alert {
  let out = alert;
  for (const a of actions) {
    if (a.alertId !== alert.id || a.userId !== me.id || !isActive(out.status)) continue;
    if (a.kind === 'ack') {
      if (out.status === 'open') out = { ...out, status: 'seen' };
    } else if (a.kind === 'start') {
      if (out.status !== 'on_the_way') out = { ...out, status: 'on_the_way', responderId: me.id, responderName: me.fullName };
    } else {
      out = {
        ...out,
        status: 'resolved',
        outcome: a.outcome ?? null,
        note: a.note?.trim() || null,
        responderId: out.responderId ?? me.id,
        responderName: out.responderName ?? me.fullName,
      };
    }
  }
  return out;
}

/** Toques guardados desta pessoa (para este alerta, se informado). */
export function pendingFor(snapshot: OutboxSnapshot, userId: string | null | undefined, alertId?: string): QueuedAction[] {
  if (!userId) return [];
  return snapshot.actions.filter((a) => a.userId === userId && (alertId === undefined || a.alertId === alertId));
}

/** Avisos de toques que não foram aplicados, desta pessoa (para este alerta, se informado). */
export function noticesFor(snapshot: OutboxSnapshot, userId: string | null | undefined, alertId?: string): OutboxNotice[] {
  if (!userId) return [];
  return snapshot.notices.filter((n) => n.userId === userId && (alertId === undefined || n.alertId === alertId));
}
