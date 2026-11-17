import { readFileSync } from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';
import { z } from 'zod';
import { ALARM_CHANNEL, ALARM_REPEAT_AT_S, ALARM_SOUND, ALARM_VIBRATION, KIND_STAFF_LABEL, isActive, type Alert } from '@nenm/shared';
import type { Db } from './db';
import { getAlert } from './queries';

/**
 * Push remoto do alarme no Android, direto pelo Firebase Cloud Messaging
 * (FCM HTTP v1), sem o serviço de push da Expo (decisão da Central, 17/11/2026).
 * Serve para o alarme chegar com o app minimizado ou fechado, o que o
 * WebSocket não faz.
 *
 * - Alerta novo (ninguém viu): toca para toda a equipe ativa do bar.
 * - Alerta designado pela gerência: toca para a pessoa designada, até ela
 *   tocar em "Estou indo".
 * - Repete em 20, 40, 60, 90 e 120 s, conferindo no banco antes de cada
 *   repetição. O "Vi o alerta" (ou "Estou indo") cancela.
 *
 * A mensagem é só de dados (sem o bloco `notification`). Com o app em segundo
 * plano ou fechado, o expo-notifications monta a notificação com o canal de
 * alarme (`channelId`) e o id do alerta como identificador (`tag`), e a
 * repetição substitui a anterior em vez de empilhar. Com o app aberto, ele não
 * mostra nada: quem avisa é o próprio app, pelo WebSocket, e assim não há
 * aviso em dobro (ver mobile/src/notifications/alarm.ts).
 *
 * A palavra-código nunca vai na mensagem: ela aparece na tela bloqueada.
 */

export type SendResult = 'ok' | 'invalid_token' | 'error';

export interface PushMessage {
  token: string;
  data: Record<string, string>;
}

export interface PushSender {
  send(message: PushMessage): Promise<SendResult>;
}

type Log = (message: string) => void;

// ------------------------------------------------------------------ FCM v1

const serviceAccountSchema = z.object({
  type: z.literal('service_account'),
  project_id: z.string().min(1),
  client_email: z.string().email(),
  private_key: z.string().includes('PRIVATE KEY'),
  token_uri: z.string().url().default('https://oauth2.googleapis.com/token'),
});
export type ServiceAccount = z.infer<typeof serviceAccountSchema>;

export function readServiceAccount(file: string): ServiceAccount {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    // A mensagem do JSON.parse cita um trecho do arquivo, que pode ser a chave: não repassar.
    throw new Error((err as NodeJS.ErrnoException).code ? `arquivo não encontrado ou sem permissão (${(err as NodeJS.ErrnoException).code})` : 'o arquivo não é um JSON válido');
  }
  const parsed = serviceAccountSchema.safeParse(json);
  // Só os nomes dos campos, nunca os valores (a chave privada está ali).
  if (!parsed.success) throw new Error(`conta de serviço inválida: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  return parsed.data;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface FcmOptions {
  account: ServiceAccount;
  fetch?: typeof fetch;
  /** Endereço do FCM (os testes trocam por um servidor falso). */
  fcmBase?: string;
  log?: Log;
}

/** Envia pelo FCM HTTP v1, com o token de acesso OAuth da conta de serviço (renovado antes de vencer). */
export function createFcmSender({ account, fetch: doFetch = fetch, fcmBase = 'https://fcm.googleapis.com', log = console.error }: FcmOptions): PushSender {
  let access: { token: string; expiresAt: number } | null = null;
  let keyPromise: ReturnType<typeof importPKCS8> | null = null;

  async function accessToken(): Promise<string> {
    if (access && access.expiresAt > Date.now() + 60_000) return access.token;
    keyPromise ??= importPKCS8(account.private_key, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(account.client_email)
      .setSubject(account.client_email)
      .setAudience(account.token_uri)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(await keyPromise);
    const res = await doFetch(account.token_uri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!res.ok) throw new Error(`OAuth do Google respondeu ${res.status}`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('OAuth do Google sem access_token');
    access = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return access.token;
  }

  return {
    async send({ token, data }) {
      try {
        const res = await doFetch(`${fcmBase}/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${await accessToken()}` },
          body: JSON.stringify({
            message: {
              token,
              data,
              // Alta prioridade acorda o celular em repouso (Doze). Passado 2 min, o aviso já não serve.
              android: { priority: 'high', ttl: '120s' },
            },
          }),
        });
        if (res.ok) return 'ok';
        const text = await res.text();
        if (res.status === 401) access = null;
        // Token que não serve mais e deve ser apagado:
        // - 404 / UNREGISTERED: app desinstalado ou dados apagados;
        // - 403 SENDER_ID_MISMATCH: token de outro projeto do Firebase;
        // - 400 que fala do token: não é um token do FCM (não apaga 400 de mensagem malformada).
        if (res.status === 404 || text.includes('UNREGISTERED')) return 'invalid_token';
        if (res.status === 403 && text.includes('SENDER_ID_MISMATCH')) return 'invalid_token';
        if (res.status === 400 && /registration token/i.test(text)) return 'invalid_token';
        log(`push: FCM respondeu ${res.status}`);
        return 'error';
      } catch (err) {
        log(`push: falha ao enviar (${(err as Error).message})`);
        return 'error';
      }
    },
  };
}

// ------------------------------------------------------------------ quem recebe e quando

type Why = 'new' | 'assigned';

interface Ring {
  why: Why;
  alertId: string;
  venueId: string;
  userId?: string;
  /** Designado: quando a gerência designou. Uma nova designação da mesma pessoa toca de novo. */
  since?: string;
  timers: NodeJS.Timeout[];
}

/** O texto do aviso. Mesmo texto do toque local do app (mobile/src/notifications/alarm.ts). */
export function messageData(alert: Alert, why: Why, repeat: boolean): Record<string, string> {
  const who = alert.assignedByName?.split(' ')[0] ?? 'A gerência';
  const title = why === 'assigned' ? `${who} pediu que você vá: ${alert.spotLabel}` : `${repeat ? 'Ninguém viu ainda · ' : ''}Alerta · ${alert.spotLabel}`;
  return {
    // Campos que o expo-notifications lê numa mensagem só de dados (NotificationData.kt).
    title,
    message: `${KIND_STAFF_LABEL[alert.kind]}. Toque para atender.`,
    body: JSON.stringify({ alertId: alert.id }),
    channelId: ALARM_CHANNEL,
    tag: alert.id,
    sound: ALARM_SOUND,
    vibrate: JSON.stringify(ALARM_VIBRATION),
    color: '#FF7EAD',
  };
}

/** O alerta ainda pede este toque? */
function stillRinging(alert: Alert | null, ring: Pick<Ring, 'why' | 'userId'>): boolean {
  if (!alert) return false;
  if (ring.why === 'new') return alert.status === 'open';
  return isActive(alert.status) && alert.assignedToId === ring.userId && !alert.responderId;
}

interface PushOptions {
  db: Db;
  /** null: push desligado (sem a conta de serviço). */
  sender: PushSender | null;
  /** Atrasos das repetições, em ms (os testes encurtam). */
  repeatAtMs?: number[];
  log?: Log;
}

export function createPush({ db, sender, repeatAtMs = ALARM_REPEAT_AT_S.map((s) => s * 1000), log = console.error }: PushOptions) {
  const rings = new Map<string, Ring>();
  // O toque fica no mapa até deixar de valer (stop), mesmo depois da última repetição:
  // senão qualquer mudança posterior no alerta recomeçaria o ciclo inteiro.
  const keyOf = (r: Pick<Ring, 'why' | 'alertId' | 'userId' | 'since'>) => `${r.why}:${r.alertId}:${r.userId ?? ''}:${r.since ?? ''}`;

  async function tokensFor(ring: Ring): Promise<string[]> {
    const { rows } =
      ring.why === 'new'
        ? await db.query<{ token: string }>('select t.token from push_tokens t join staff s on s.id = t.user_id where s.venue_id = $1 and s.active and t.expires_at > now()', [ring.venueId])
        : await db.query<{ token: string }>('select t.token from push_tokens t join staff s on s.id = t.user_id where s.id = $1 and s.venue_id = $2 and s.active and t.expires_at > now()', [
            ring.userId,
            ring.venueId,
          ]);
    return rows.map((r) => r.token);
  }

  /** Envia a todos os aparelhos do toque, se ele ainda valer (`current`) na hora de enviar. */
  async function deliver(ring: Ring, alert: Alert, repeat: boolean, current: () => boolean): Promise<void> {
    if (!sender) return;
    const tokens = await tokensFor(ring);
    // Alguém pode ter visto o alerta enquanto lia o banco: não mandar "Ninguém viu ainda" depois disso.
    if (!tokens.length || !current()) return;
    const data = messageData(alert, ring.why, repeat);
    const results = await Promise.all(tokens.map((token) => sender.send({ token, data })));
    const invalid = tokens.filter((_, i) => results[i] === 'invalid_token');
    if (invalid.length) {
      await db.query('delete from push_tokens where token = any($1)', [invalid]);
      log(`push: ${invalid.length} token(s) inválido(s) apagado(s)`);
    }
  }

  function stop(key: string): void {
    const ring = rings.get(key);
    if (!ring) return;
    ring.timers.forEach(clearTimeout);
    rings.delete(key);
  }

  function start(ring: Ring, alert: Alert): void {
    const key = keyOf(ring);
    rings.set(key, ring);
    const current = () => rings.get(key) === ring;
    deliver(ring, alert, false, current).catch((err) => log(`push: ${(err as Error).message}`));
    ring.timers = repeatAtMs.map((ms) => {
      const timer = setTimeout(async () => {
        if (!current()) return;
        try {
          const now = await getAlert(db, ring.venueId, ring.alertId);
          if (!stillRinging(now, ring)) return stop(key);
          await deliver(ring, now!, true, current);
        } catch (err) {
          log(`push: ${(err as Error).message}`);
        }
      }, ms);
      timer.unref();
      return timer;
    });
  }

  // Uma mudança de cada vez por alerta: duas seguidas não podem começar o mesmo toque duas vezes.
  const chains = new Map<string, Promise<void>>();

  /** Chamado a cada mudança num alerta, junto com o tempo real. */
  function alertChanged(alertId: string): Promise<void> {
    if (!sender) return Promise.resolve();
    const next = (chains.get(alertId) ?? Promise.resolve()).then(() => update(alertId)).catch((err) => log(`push: ${(err as Error).message}`));
    chains.set(alertId, next);
    next.finally(() => chains.get(alertId) === next && chains.delete(alertId));
    return next;
  }

  async function update(alertId: string): Promise<void> {
    const { rows } = await db.query<{ venue_id: string }>('select venue_id from alerts where id = $1', [alertId]);
    if (!rows[0]) return;
    const venueId = rows[0].venue_id;
    const alert = await getAlert(db, venueId, alertId);
    const wanted: Ring[] = [];
    if (alert?.status === 'open') wanted.push({ why: 'new', alertId, venueId, timers: [] });
    if (alert?.assignedToId && stillRinging(alert, { why: 'assigned', userId: alert.assignedToId }))
      wanted.push({ why: 'assigned', alertId, venueId, userId: alert.assignedToId, since: alert.assignedAt ?? undefined, timers: [] });
    const wantedKeys = new Set(wanted.map(keyOf));
    for (const key of [...rings.keys()]) if (key.split(':')[1] === alertId && !wantedKeys.has(key)) stop(key);
    for (const ring of wanted) if (!rings.has(keyOf(ring))) start(ring, alert!);
  }

  /** Para todas as repetições (ao desligar o servidor). */
  function close(): void {
    for (const key of [...rings.keys()]) stop(key);
  }

  return { enabled: sender !== null, alertChanged, close, pending: () => rings.size };
}

export type Push = ReturnType<typeof createPush>;

/** Liga o push se houver a conta de serviço; sem ela (ou com ela inválida), desliga com um aviso no log. */
export function senderFromConfig(file: string | undefined, log: Log = console.log): PushSender | null {
  if (!file) {
    log('Push remoto desligado: FCM_SERVICE_ACCOUNT_FILE não definido.');
    return null;
  }
  try {
    const account = readServiceAccount(file);
    log(`Push remoto ligado (FCM, projeto ${account.project_id}).`);
    return createFcmSender({ account });
  } catch (err) {
    log(`Push remoto desligado: não deu para ler ${file} (${(err as Error).message}).`);
    return null;
  }
}
