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
 * - O toque é de quem o fez: só sai com o login dessa pessoa, e o servidor
 *   confere (`userId` no envio).
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
  /**
   * A tela estava desatualizada na hora do toque (a última leitura do alerta tinha falhado).
   * Mesmo enviado na hora, o toque vai ao servidor como "guardado": quem tocou não viu o que mudou.
   */
  stale?: boolean;
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
  /** Outros toques da pessoa neste alerta que caíram junto (ex.: o "Encerrar" feito depois do "Estou indo"). */
  alsoDropped?: QueuedActionKind[];
  at: number;
}

export interface OutboxSnapshot {
  /**
   * Toques guardados, esperando a conexão. O toque que está sendo enviado agora,
   * na hora em que a pessoa tocou, não aparece aqui: para a tela ele ainda não é
   * "sem sinal".
   */
  readonly actions: readonly QueuedAction[];
  /**
   * Toques em envio agora, na hora em que a pessoa tocou. Não são "sem sinal", mas a pessoa já agiu:
   * serve, por exemplo, para o alarme do alerta parar no toque, sem esperar a resposta do servidor.
   */
  readonly sending: readonly QueuedAction[];
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
  /** Quantas recusas inesperadas do servidor um toque aguenta antes de ser descartado. Padrão: 5. */
  maxAttempts?: number;
  /**
   * Quem está logado no aparelho agora (null = ninguém). O envio usa o login do
   * aparelho, então a rodada para antes de cada toque se a pessoa mudou: o toque
   * de uma não sai em nome de outra.
   */
  currentUserId?: () => string | null | undefined;
  /** O servidor não aceitou o login no meio de uma rodada: o app deve mandar a pessoa entrar de novo. */
  onAuthLost?: (userId: string) => void;
}

export interface NewAction {
  kind: QueuedActionKind;
  alertId: string;
  userId: string;
  spotLabel?: string;
  outcome?: AlertOutcome;
  note?: string;
  /** A tela estava desatualizada na hora do toque (ver `QueuedAction.stale`). */
  stale?: boolean;
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
const RETRY_LATER: DataErrorCode[] = ['network', 'rate_limited', 'not_staff', 'action_wrong_user'];

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
  let snap: OutboxSnapshot = { actions, sending: [], notices };
  const listeners = new Set<() => void>();
  /** Toques cujo `perform` ainda está esperando: o erro volta para a tela, não vira aviso. */
  const direct = new Set<string>();
  const directFailures = new Map<string, DataErrorCode>();
  /** Toques já guardados que um `perform` repetido está esperando: o que aconteceu com cada um. */
  const watched = new Map<string, number>();
  const fates = new Map<string, 'sent' | DataErrorCode>();
  /** A fila guardada no aparelho já foi lida. Antes disso nada é gravado, para não apagar o que está lá. */
  let loaded = false;

  // As gravações saem em ordem; se o aparelho não deixar gravar, a fila segue em memória.
  let writes: Promise<void> = Promise.resolve();
  const commit = () => {
    snap = { actions: actions.filter((a) => !direct.has(a.id)), sending: actions.filter((a) => direct.has(a.id)), notices: [...notices] };
    if (loaded) {
      // Guarda também o toque que está sendo enviado: se o app fechar no meio, ele não se perde.
      const json = JSON.stringify({ v: 1, actions, notices });
      writes = writes.then(() => options.storage.set(json)).then(
        () => {},
        () => {},
      );
    }
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

  /**
   * Lê a fila guardada no aparelho. Se a leitura falhar, a fila segue só em
   * memória e a leitura é tentada de novo a cada rodada: gravar por cima agora
   * apagaria os toques que estão lá.
   */
  let loading: Promise<void> | null = null;
  const load = (): Promise<void> => {
    if (loaded) return Promise.resolve();
    loading ??= Promise.resolve()
      .then(() => options.storage.get())
      .then(
        (raw) => {
          // O que foi tocado antes de a leitura terminar fica depois do que já estava guardado.
          const stored = parse(raw);
          const known = new Set(actions.map((a) => a.id));
          actions = [...stored.actions.filter((a) => !known.has(a.id)), ...actions];
          notices = [...stored.notices, ...notices];
          loaded = true;
          prune();
          return commit();
        },
        () => {},
      )
      .finally(() => {
        loading = null;
      });
    return loading;
  };
  const ready: Promise<void> = load();

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
    for (const v of victims) {
      if (direct.has(v.id)) directFailures.set(v.id, code);
      if (watched.has(v.id)) fates.set(v.id, code);
    }
    const told = victims.filter((v) => v.kind !== 'ack' && !direct.has(v.id));
    const shown = told[0];
    if (shown) {
      const alsoDropped = told.slice(1).map((v) => v.kind);
      notices = [
        ...notices,
        {
          id: shown.id,
          alertId: shown.alertId,
          userId: shown.userId,
          kind: shown.kind,
          spotLabel: shown.spotLabel,
          reason,
          ...(alsoDropped.length > 0 ? { alsoDropped } : {}),
          at: now(),
        },
      ].slice(-MAX_NOTICES);
    }
  }

  /** Tira só este toque, sem aviso e sem levar os seguintes (para o "Vi" automático, que não faz falta). */
  function drop(action: QueuedAction, code: DataErrorCode) {
    actions = actions.filter((a) => a !== action);
    if (direct.has(action.id)) directFailures.set(action.id, code);
    if (watched.has(action.id)) fates.set(action.id, code);
  }

  function send(action: QueuedAction): Promise<void> {
    // `queuedMs` acima de zero diz ao servidor que o toque ficou guardado: quem tocou não viu o que mudou
    // depois. O toque enviado na hora, com a pessoa olhando a tela, vai com zero.
    const waited = Math.min(QUEUED_MS_CAP, Math.max(1, Math.round(now() - action.createdAt)));
    const fresh = direct.has(action.id) && !action.stale;
    const meta: ActionMeta = { actionId: action.id, queuedMs: fresh ? 0 : waited, userId: action.userId };
    if (action.kind === 'ack') return options.staff.ackAlert(action.alertId, meta);
    if (action.kind === 'start') return options.staff.startResponse(action.alertId, meta);
    // Sem desfecho o servidor recusa (outcome_required) e o toque acaba descartado como falha.
    return options.staff.resolveAlert(action.alertId, action.outcome as AlertOutcome, action.note, meta);
  }

  /** Uma rodada de envio. Devolve true se parou no meio (sem conexão ou sem login): o resto fica para depois. */
  async function run(userId: string, tried: Set<string>): Promise<boolean> {
    await ready;
    if (!loaded) await load();
    if (prune()) await commit();
    /** Alertas com um toque que falhou e ficou: os seguintes esperam, para manter a ordem. */
    const blocked = new Set<string>();
    for (;;) {
      // Relê a fila a cada volta: um toque feito durante o envio entra na mesma rodada.
      const action = actions.find((a) => a.userId === userId && !tried.has(a.id) && !blocked.has(a.alertId));
      if (!action) return false;
      // O envio usa o login do aparelho: se quem está logado mudou, o toque espera a pessoa voltar.
      if (options.currentUserId && options.currentUserId() !== userId) return true;
      tried.add(action.id);
      try {
        await send(action);
        actions = actions.filter((a) => a !== action);
        if (watched.has(action.id)) fates.set(action.id, 'sent');
      } catch (err) {
        const code: DataErrorCode = err instanceof DataError ? err.code : 'unknown';
        if (RETRY_LATER.includes(code)) {
          if (code === 'not_staff') {
            // Sem login válido, o toque feito agora não fica guardado: a tela mostra o erro. Vale para todo
            // toque que está esperando resposta, não só para o que a rodada tentou (ela para no primeiro).
            // O que já estava guardado continua, para quando a mesma pessoa entrar de novo.
            for (const a of actions.filter((x) => x.userId === userId && direct.has(x.id))) discard(a, 'failed', code);
            await commit();
            options.onAuthLost?.(userId);
          }
          return true;
        }
        const conflict = CONFLICT[code];
        if (conflict) discard(action, conflict, code);
        else if (direct.has(action.id)) discard(action, 'failed', code);
        else if (code === 'server_error') {
          // Erro interno do servidor (banco fora, por exemplo) não diz nada sobre o toque: fica para depois,
          // sem contar tentativa. Os outros alertas seguem na rodada.
          blocked.add(action.alertId);
          continue;
        } else if (action.kind === 'ack') {
          // O "Vi" é automático e o "Estou indo" já marca como visto: recusado, sai sozinho, sem aviso
          // e sem derrubar os toques que a pessoa fez de verdade.
          drop(action, code);
        } else {
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
        // O mesmo toque já está guardado (ex.: abrir o alerta de novo sem sinal): não duplica, e quem
        // tocou de novo recebe o que aconteceu com ele (enviado, ainda guardado ou recusado).
        // Mais de uma chamada pode esperar o mesmo toque: o destino dele só é apagado quando a última ler.
        watched.set(same.id, (watched.get(same.id) ?? 0) + 1);
        try {
          await flush(input.userId);
        } finally {
          const left = (watched.get(same.id) ?? 1) - 1;
          if (left > 0) watched.set(same.id, left);
          else watched.delete(same.id);
        }
        const fate = fates.get(same.id);
        if (!watched.has(same.id)) fates.delete(same.id);
        if (fate && fate !== 'sent') throw new DataError(fate);
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
      if (!actions.includes(action)) return 'sent';
      // Ficou guardado: só agora ele aparece para a tela como "sem sinal".
      await commit();
      return 'queued';
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

/** Toques guardados desta pessoa (para este alerta, se informado). Não inclui o que está sendo enviado agora. */
export function pendingFor(snapshot: OutboxSnapshot, userId: string | null | undefined, alertId?: string): QueuedAction[] {
  if (!userId) return [];
  return snapshot.actions.filter((a) => a.userId === userId && (alertId === undefined || a.alertId === alertId));
}

/** Toques desta pessoa em envio agora (para este alerta, se informado). */
export function sendingFor(snapshot: OutboxSnapshot, userId: string | null | undefined, alertId?: string): QueuedAction[] {
  if (!userId) return [];
  return snapshot.sending.filter((a) => a.userId === userId && (alertId === undefined || a.alertId === alertId));
}

/** Avisos de toques que não foram aplicados, desta pessoa (para este alerta, se informado). */
export function noticesFor(snapshot: OutboxSnapshot, userId: string | null | undefined, alertId?: string): OutboxNotice[] {
  if (!userId) return [];
  return snapshot.notices.filter((n) => n.userId === userId && (alertId === undefined || n.alertId === alertId));
}
