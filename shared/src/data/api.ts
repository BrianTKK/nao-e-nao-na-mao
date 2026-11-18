/**
 * Implementação da camada de dados que fala com o servidor (server/):
 * HTTP para ler e agir, Socket.IO para saber na hora que algo mudou.
 * A mesma no app (React Native) e na web.
 */
import { io, type Socket } from 'socket.io-client';
import type { Alert, AlertKind, AlertOutcome, PublicAlert, PublicSpot, Spot, SpotKind, StaffMember, Venue, VenueMenu, VenueWifi } from '../domain';
import { DataError, type ActionMeta, type ConnectionState, type DataErrorCode, type DataSource, type NewStaffInput, type StaffPatch, type Unsubscribe } from './ports';

/** Onde guardar o token de login (localStorage na web, AsyncStorage no app). */
export interface TokenStore {
  get(): Promise<string | null> | string | null;
  set(token: string | null): Promise<void> | void;
}

export interface ApiOptions {
  /** URL do servidor. Vazio = mesma origem (a web servida pelo próprio servidor). */
  baseUrl: string;
  tokenStore?: TokenStore;
  /** Intervalo da consulta de reserva da página da mulher quando o WebSocket cai. */
  pollMs?: number;
  /** Para os testes trocarem a rede (padrão: o fetch global). */
  fetch?: typeof fetch;
  /** Teto de espera dos toques da equipe ("Vi", "Estou indo", "Encerrar"), em ms. Padrão: 10 s. */
  actionTimeoutMs?: number;
  /**
   * Teto de espera das leituras do app da equipe (quem está logado, lista e alerta), em ms. Padrão: 8 s.
   * Com sinal fraco a conexão fica pendurada sem falhar: sem teto, o app não chega a abrir com o último
   * login nem mostra o que já tem.
   */
  readTimeoutMs?: number;
}

/** O servidor não respondeu (proxy sem o app atrás, ou app reiniciando): para quem usa, é falta de conexão. */
const GATEWAY_ERRORS = [502, 503, 504];

const KNOWN_ERRORS: DataErrorCode[] = [
  'spot_not_found',
  'alert_not_found',
  'rate_limited',
  'invalid_kind',
  'invalid_transition',
  'already_taken',
  'outcome_required',
  'not_staff',
  'invalid_credentials',
  'not_manager',
  'staff_not_found',
  'email_taken',
  'cannot_change_self',
  'menu_full',
  'invalid_image',
  'action_wrong_user',
];

export function createApiDataSource(options: ApiOptions): DataSource {
  const base = options.baseUrl.replace(/\/$/, '');
  /** O servidor devolve o endereço das fotos relativo (/api/menu-files/...): o app precisa dele completo. */
  const withBase = (menu: VenueMenu): VenueMenu => ({
    url: menu.url,
    files: menu.files.map((f) => ({ ...f, url: f.url.startsWith('/') ? `${base}${f.url}` : f.url })),
  });
  const pollMs = options.pollMs ?? 3000;
  const actionTimeoutMs = options.actionTimeoutMs ?? 10_000;
  const readTimeoutMs = options.readTimeoutMs ?? 8_000;
  const doFetch: typeof fetch = (input, init) => (options.fetch ?? fetch)(input, init);
  let token: string | null = null;
  let tokenLoaded = false;

  const loadToken = async () => {
    if (!tokenLoaded) {
      token = (await options.tokenStore?.get()) ?? null;
      tokenLoaded = true;
    }
    return token;
  };
  const saveToken = async (value: string | null) => {
    token = value;
    tokenLoaded = true;
    await options.tokenStore?.set(value);
  };

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown; auth?: boolean; alertToken?: string; timeoutMs?: number } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.auth) {
      const t = await loadToken();
      if (!t) throw new DataError('not_staff');
      headers.authorization = `Bearer ${t}`;
    }
    if (init.alertToken) headers['x-alert-token'] = init.alertToken;
    let res: Response;
    // Com teto de espera, uma conexão que não responde vira "sem conexão" em vez de travar a tela.
    const abort = init.timeoutMs ? new AbortController() : null;
    const timer = abort ? setTimeout(() => abort.abort(), init.timeoutMs) : null;
    try {
      res = await doFetch(`${base}/api${path}`, {
        method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: abort?.signal,
      });
    } catch {
      throw new DataError('network');
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (GATEWAY_ERRORS.includes(res.status)) throw new DataError('network');
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      if (res.status === 401 && init.auth) {
        await saveToken(null);
        closeStaffSocket();
        throw new DataError('not_staff');
      }
      const code = (data?.error ?? 'unknown') as DataErrorCode;
      if (KNOWN_ERRORS.includes(code)) throw new DataError(code, data?.error);
      throw new DataError(res.status >= 500 ? 'server_error' : 'unknown', data?.error);
    }
    return data as T;
  }

  // ---------------------------------------------------------------- tempo real da equipe

  let staffSocket: Socket | null = null;
  let connection: ConnectionState = 'offline';
  const alertListeners = new Set<(a: Alert) => void>();
  const connectionListeners = new Set<(s: ConnectionState) => void>();
  const reconnectListeners = new Set<() => void>();

  const setConnection = (s: ConnectionState) => {
    connection = s;
    connectionListeners.forEach((l) => l(s));
  };

  function closeStaffSocket() {
    staffSocket?.close();
    staffSocket = null;
    setConnection('offline');
  }

  async function ensureStaffSocket() {
    if (staffSocket) return;
    const t = await loadToken();
    if (!t || staffSocket) return;
    setConnection('connecting');
    const s = io(base || undefined, { path: '/socket.io', transports: ['websocket'], auth: { token: t } });
    staffSocket = s;
    s.on('connect', () => {
      setConnection('online');
      reconnectListeners.forEach((l) => l());
    });
    s.on('disconnect', () => setConnection('connecting'));
    s.on('connect_error', () => setConnection('offline'));
    s.on('alert:update', (a: Alert | null) => {
      if (a) alertListeners.forEach((l) => l(a));
    });
  }

  /** Assina mudanças: chama `refresh` a cada pedido alterado e a cada reconexão (para não perder nada). */
  function subscribeStaff(refresh: () => void): Unsubscribe {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 80);
    };
    alertListeners.add(debounced);
    reconnectListeners.add(debounced);
    ensureStaffSocket().catch(() => setConnection('offline'));
    return () => {
      if (timer) clearTimeout(timer);
      alertListeners.delete(debounced);
      reconnectListeners.delete(debounced);
    };
  }

  // ---------------------------------------------------------------- a fonte

  return {
    kind: 'api',

    watchConnection(onChange) {
      onChange(connection);
      connectionListeners.add(onChange);
      return () => connectionListeners.delete(onChange);
    },

    public: {
      async getSpot(code) {
        try {
          const spot = await request<PublicSpot>(`/spots/${encodeURIComponent(code)}`);
          return { ...spot, menu: withBase(spot.menu) };
        } catch (err) {
          if (err instanceof DataError && (err.code === 'spot_not_found' || err.code === 'unknown')) return null;
          throw err;
        }
      },
      createAlert: (spotCode: string, kind: AlertKind) =>
        request<{ token: string; shortCode: string }>('/alerts', { body: { spotCode: spotCode.toUpperCase(), kind } }),
      async getAlert(alertToken) {
        try {
          return await request<PublicAlert>('/alerts/mine', { alertToken });
        } catch (err) {
          if (err instanceof DataError && err.code === 'alert_not_found') return null;
          throw err;
        }
      },
      watchAlert(alertToken, onChange) {
        // WebSocket na sala do pedido; se cair, consulta a cada `pollMs` até voltar.
        let last = '';
        let stopped = false;
        let poll: ReturnType<typeof setInterval> | null = null;
        const push = (a: PublicAlert | null) => {
          const key = JSON.stringify(a);
          if (stopped || key === last) return;
          last = key;
          onChange(a);
        };
        const fetchOnce = () => {
          this.getAlert(alertToken)
            .then(push)
            .catch(() => {});
        };
        const startPolling = () => {
          // Fechar o socket ao parar também dispara "disconnect": não religar a consulta.
          if (!poll && !stopped) poll = setInterval(fetchOnce, pollMs);
        };
        const stopPolling = () => {
          if (poll) clearInterval(poll);
          poll = null;
        };
        const s = io(base || undefined, { path: '/socket.io', transports: ['websocket'], auth: { alertToken } });
        s.on('connect', () => {
          stopPolling();
          fetchOnce();
        });
        s.on('disconnect', (reason) => {
          startPolling();
          // Quando o servidor encerra a conexão, o Socket.IO não tenta de novo sozinho.
          if (reason === 'io server disconnect') setTimeout(() => !stopped && s.connect(), 5000);
        });
        s.on('connect_error', startPolling);
        s.on('public:update', push);
        fetchOnce();
        return () => {
          stopped = true;
          stopPolling();
          s.close();
        };
      },
      async cancelAlert(alertToken) {
        await request<void>('/alerts/mine/cancel', { method: 'POST', alertToken });
      },
    },

    staff: {
      async signIn(email, password) {
        let res: { token: string; staff: StaffMember };
        try {
          res = await request<{ token: string; staff: StaffMember }>('/auth/login', { body: { email: email.trim(), password } });
        } catch (err) {
          // E-mail malformado também é "e-mail ou senha incorretos" para quem digita.
          if (err instanceof DataError && err.code === 'unknown') throw new DataError('invalid_credentials');
          throw err;
        }
        closeStaffSocket();
        await saveToken(res.token);
        return res.staff;
      },
      async signOut() {
        closeStaffSocket();
        await saveToken(null);
      },
      async currentStaff() {
        if (!(await loadToken())) return null;
        try {
          return await request<StaffMember>('/me', { auth: true, timeoutMs: readTimeoutMs });
        } catch (err) {
          if (err instanceof DataError && err.code === 'not_staff') return null;
          throw err;
        }
      },
      listActiveAlerts: () => request<Alert[]>('/staff/alerts/active', { auth: true, timeoutMs: readTimeoutMs }),
      watchActiveAlerts(onChange) {
        const refresh = () => {
          this.listActiveAlerts()
            .then(onChange)
            .catch(() => {});
        };
        refresh();
        return subscribeStaff(refresh);
      },
      async getAlert(id) {
        try {
          return await request<Alert>(`/staff/alerts/${id}`, { auth: true, timeoutMs: readTimeoutMs });
        } catch (err) {
          if (err instanceof DataError && err.code === 'alert_not_found') return null;
          throw err;
        }
      },
      async ackAlert(id, meta?: ActionMeta) {
        await request(`/staff/alerts/${id}/ack`, { auth: true, body: { ...meta }, timeoutMs: actionTimeoutMs });
      },
      async startResponse(id, meta?: ActionMeta) {
        await request(`/staff/alerts/${id}/start`, { auth: true, body: { ...meta }, timeoutMs: actionTimeoutMs });
      },
      async resolveAlert(id: string, outcome: AlertOutcome, note?: string, meta?: ActionMeta) {
        await request(`/staff/alerts/${id}/resolve`, {
          auth: true,
          body: note?.trim() ? { outcome, note, ...meta } : { outcome, ...meta },
          timeoutMs: actionTimeoutMs,
        });
      },
      async setMyAppearance(appearance) {
        await request('/me/appearance', { method: 'PUT', auth: true, body: { appearance } });
      },
      registerPushToken: (token, platform) => request<{ pushEnabled: boolean }>('/me/push-token', { method: 'PUT', auth: true, body: { token, platform } }),
      async removePushToken(token) {
        await request('/me/push-token', { method: 'DELETE', auth: true, body: { token } });
      },
    },

    manager: {
      getVenue: () => request<Venue>('/manager/venue', { auth: true }),
      listAlerts: ({ from, to }) =>
        request<Alert[]>(`/manager/alerts?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`, {
          auth: true,
        }),
      watchAlerts: (onChange) => subscribeStaff(onChange),
      listStaff: () => request<StaffMember[]>('/manager/staff', { auth: true }),
      listSpots: () => request<Spot[]>('/manager/spots', { auth: true }),
      createSpot: (input: { label: string; kind: SpotKind }) => request<Spot>('/manager/spots', { auth: true, body: input }),
      async setSpotActive(id, active) {
        await request(`/manager/spots/${id}`, { method: 'PATCH', auth: true, body: { active } });
      },
      rotateSpotCode: (id: string) => request<Spot>(`/manager/spots/${id}/rotate-code`, { auth: true, body: {} }),
      async assignAlert(id: string, staffId: string) {
        await request(`/manager/alerts/${id}/assign`, { auth: true, body: { staffId } });
      },
      createStaff: (input: NewStaffInput) => request<StaffMember>('/manager/staff', { auth: true, body: input }),
      updateStaff: (id: string, patch: StaffPatch) => request<StaffMember>(`/manager/staff/${id}`, { method: 'PATCH', auth: true, body: patch }),
      getMenu: async () => withBase(await request<VenueMenu>('/manager/menu', { auth: true })),
      setMenuUrl: async (url: string | null) => withBase(await request<VenueMenu>('/manager/menu/url', { method: 'PUT', auth: true, body: { url } })),
      addMenuFile: async (input: { contentType: string; base64: string }) =>
        withBase(await request<VenueMenu>('/manager/menu/files', { auth: true, body: input })),
      getWifi: () => request<VenueWifi | null>('/manager/wifi', { auth: true }),
      setWifi: (wifi: VenueWifi | null) => request<VenueWifi | null>('/manager/wifi', { method: 'PUT', auth: true, body: { wifi } }),
      removeMenuFile: async (id: string) => withBase(await request<VenueMenu>(`/manager/menu/files/${id}`, { method: 'DELETE', auth: true })),
    },
  };
}
