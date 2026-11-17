/**
 * Implementação simulada da camada de dados: as mesmas regras do banco
 * (estados, limites, quem vê o quê), em memória. Serve para desenhar e testar
 * as telas sem conta e sem internet.
 *
 * Na web, com `storage` (localStorage) e `channel` (BroadcastChannel), duas
 * abas do mesmo navegador conversam: a página do QR code numa aba e o painel
 * da gerência na outra. Entre o celular e a web só o backend real (F1) liga.
 */
import {
  ACTIVE_STATUSES,
  ALERT_KINDS,
  MENU_LIMITS,
  isActive,
  type Alert,
  type AlertKind,
  type AlertOutcome,
  type PublicAlert,
  type Spot,
  type StaffMember,
  type VenueMenu,
  type VenueWifi,
} from '../domain';
import { DEMO_PASSWORD, DEMO_SPOTS, DEMO_USERS, DEMO_VENUE, type DemoUser } from './demo';
import { DataError, type DataSource, type Unsubscribe } from './ports';
import { pickCodeWord } from '../codeWords';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SyncChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: () => void): void;
}

export interface MockOptions {
  storage?: KeyValueStore;
  channel?: SyncChannel;
  /** Atraso artificial das chamadas, para ver os estados de carregando. */
  latencyMs?: number;
  now?: () => number;
}

interface State {
  version: 1;
  alerts: Alert[];
  tokens: Record<string, string>;
  spots: Spot[];
  staff: DemoUser[];
  sessionId: string | null;
  /** Cardápio do bar de demonstração (as fotos ficam como data: URL). */
  menu?: VenueMenu;
  wifi?: VenueWifi | null;
}

const STORAGE_KEY = 'nenm.mock.v1';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** Letras e números sem os que se confundem, para o código impresso no QR do local. */
const SPOT_CODE_ALPHABET = 'ACDEFHJKMNPRTWXY34679';
const randomChars = (n = 4) => Array.from({ length: n }, () => SPOT_CODE_ALPHABET[Math.floor(Math.random() * SPOT_CODE_ALPHABET.length)]).join('');

/** Gerador pseudoaleatório com semente: o histórico sai igual toda vez. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}


function makeHistory(nowMs: number, staff: DemoUser[]): Alert[] {
  const rand = mulberry32(42);
  const crew = staff.filter((s) => s.role === 'staff');
  const alerts: Alert[] = [];
  for (let n = 1; n <= 42; n++) {
    const day = new Date(nowMs - Math.floor((n * 30) / 42) * 86_400_000);
    day.setHours(20, 0, 0, 0);
    const created = day.getTime() + Math.floor(rand() * 360) * 60_000;
    if (created > nowMs - 3_600_000) continue;
    const spot = DEMO_SPOTS[Math.floor(rand() * DEMO_SPOTS.length)];
    const rk = rand();
    const kind: AlertKind = rk < 0.5 ? 'unsafe' : rk < 0.8 ? 'leave' : 'talk';
    const seen = created + (4 + Math.floor(rand() * 22)) * 1000;
    const go = seen + (5 + Math.floor(rand() * 36)) * 1000;
    const done = go + (120 + Math.floor(rand() * 720)) * 1000;
    const ro = rand();
    const who = crew[Math.floor(rand() * crew.length)];
    const cancelled = ro < 0.05;
    const outcome: AlertOutcome | null = cancelled
      ? null
      : ro < 0.4
        ? 'escorted'
        : ro < 0.6
          ? 'aggressor_removed'
          : ro < 0.75
            ? 'ride_called'
            : ro < 0.88
              ? 'talk_resolved'
              : ro < 0.92
                ? 'police_called'
                : ro < 0.96
                  ? 'not_found'
                  : 'false_alarm';
    const iso = (ms: number) => new Date(ms).toISOString();
    alerts.push({
      id: `hist-${n}`,
      venueId: DEMO_VENUE.id,
      spotId: spot.id,
      spotLabel: spot.label,
      kind,
      status: cancelled ? 'cancelled' : 'resolved',
      shortCode: pickCodeWord([], rand),
      createdAt: iso(created),
      seenAt: cancelled ? null : iso(seen),
      onTheWayAt: cancelled ? null : iso(go),
      resolvedAt: cancelled ? null : iso(done),
      cancelledAt: cancelled ? iso(created + 40_000) : null,
      responderId: cancelled ? null : who.id,
      responderName: cancelled ? null : who.fullName,
      assignedToId: null,
      assignedToName: null,
      assignedByName: null,
      assignedAt: null,
      outcome,
      note: null,
    });
  }
  return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function freshState(nowMs: number): State {
  const staff = DEMO_USERS.map((u) => ({ ...u }));
  return {
    version: 1,
    alerts: makeHistory(nowMs, staff),
    tokens: {},
    spots: DEMO_SPOTS.map((s) => ({ ...s })),
    staff,
    sessionId: null,
  };
}

function toStaffMember(u: DemoUser): StaffMember {
  const { email: _email, ...rest } = u;
  return rest;
}

export interface MockDataSource extends DataSource {
  readonly kind: 'mock';
  /** Só para demonstração: cria um pedido como se alguém tivesse lido o QR code. */
  simulateIncomingAlert(spotCode?: string, kind?: AlertKind): Promise<{ token: string; shortCode: string }>;
  /** Apaga os dados simulados e volta ao histórico inicial. */
  reset(): void;
}

export function createMockDataSource(options: MockOptions = {}): MockDataSource {
  const now = options.now ?? (() => Date.now());
  const latency = options.latencyMs ?? 0;
  const listeners = new Set<() => void>();

  const load = (): State => {
    const raw = options.storage?.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as State;
        if (parsed.version === 1) return parsed;
      } catch {
        // Dado corrompido: recomeça do zero.
      }
    }
    return freshState(now());
  };

  let state = load();

  const emit = () => listeners.forEach((l) => l());
  const menuOf = (): VenueMenu => state.menu ?? { url: null, files: [] };
  const managerOnly = () => {
    if (me().role !== 'manager') throw new DataError('not_manager');
  };
  const commit = () => {
    options.storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    options.channel?.postMessage('changed');
    emit();
  };
  options.channel?.addEventListener('message', () => {
    state = load();
    emit();
  });

  const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());
  const iso = () => new Date(now()).toISOString();

  const me = (): DemoUser => {
    const user = state.staff.find((s) => s.id === state.sessionId && s.active);
    if (!user) throw new DataError('not_staff');
    return user;
  };
  const myAlert = (id: string): Alert => {
    const user = me();
    const alert = state.alerts.find((a) => a.id === id && a.venueId === user.venueId);
    if (!alert) throw new DataError('alert_not_found');
    return alert;
  };
  const activeFor = (venueId: string) =>
    state.alerts
      .filter((a) => a.venueId === venueId && ACTIVE_STATUSES.includes(a.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const publicView = (token: string): PublicAlert | null => {
    const alert = state.alerts.find((a) => a.id === state.tokens[token]);
    if (!alert || now() - Date.parse(alert.createdAt) > TOKEN_TTL_MS) return null;
    const responder = state.staff.find((s) => s.id === alert.responderId);
    const called = responder ? undefined : state.staff.find((s) => s.id === alert.assignedToId);
    return {
      status: alert.status,
      kind: alert.kind,
      spotLabel: alert.spotLabel,
      venueName: DEMO_VENUE.name,
      shortCode: alert.shortCode,
      createdAt: alert.createdAt,
      seenAt: alert.seenAt,
      onTheWayAt: alert.onTheWayAt,
      resolvedAt: alert.resolvedAt,
      cancelledAt: alert.cancelledAt,
      responderFirstName: responder ? responder.fullName.split(' ')[0] : null,
      responderAppearance: responder?.appearance ?? null,
      assignedFirstName: called ? called.fullName.split(' ')[0] : null,
      assignedAppearance: called?.appearance ?? null,
    };
  };

  const subscribe = (fn: () => void): Unsubscribe => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const createAlert = async (spotCode: string, kind: AlertKind) => {
    await wait();
    if (!ALERT_KINDS.includes(kind)) throw new DataError('invalid_kind');
    const spot = state.spots.find((s) => s.code === spotCode.toUpperCase() && s.active);
    if (!spot) throw new DataError('spot_not_found');
    const minuteAgo = now() - 60_000;
    const recent = state.alerts.filter((a) => Date.parse(a.createdAt) > minuteAgo);
    if (recent.filter((a) => a.spotId === spot.id).length >= 3 || recent.filter((a) => a.venueId === spot.venueId).length >= 10) {
      throw new DataError('rate_limited');
    }
    const token = randomToken();
    const alert: Alert = {
      id: `alert-${token.slice(0, 12)}`,
      venueId: spot.venueId,
      spotId: spot.id,
      spotLabel: spot.label,
      kind,
      status: 'open',
      shortCode: pickCodeWord(state.alerts.filter((a) => a.venueId === spot.venueId && isActive(a.status)).map((a) => a.shortCode)),
      createdAt: iso(),
      seenAt: null,
      onTheWayAt: null,
      resolvedAt: null,
      cancelledAt: null,
      responderId: null,
      responderName: null,
      assignedToId: null,
      assignedToName: null,
      assignedByName: null,
      assignedAt: null,
      outcome: null,
      note: null,
    };
    state.alerts.unshift(alert);
    state.tokens[token] = alert.id;
    commit();
    return { token, shortCode: alert.shortCode };
  };

  const source: MockDataSource = {
    kind: 'mock',

    watchConnection(onChange) {
      onChange('online');
      return () => {};
    },

    public: {
      async getSpot(code) {
        await wait();
        const spot = state.spots.find((s) => s.code === code.toUpperCase() && s.active);
        if (!spot) return null;
        return {
          code: spot.code,
          label: spot.label,
          venueName: DEMO_VENUE.name,
          helpPhrase: DEMO_VENUE.helpPhrase,
          menu: menuOf(),
          wifi: state.wifi ?? null,
        };
      },
      createAlert,
      async getAlert(token) {
        await wait();
        return publicView(token);
      },
      watchAlert(token, onChange) {
        // Só avisa quando o pedido mudou de verdade.
        let last = '';
        const push = () => {
          const view = publicView(token);
          const key = JSON.stringify(view);
          if (key === last) return;
          last = key;
          onChange(view);
        };
        push();
        return subscribe(push);
      },
      async cancelAlert(token) {
        await wait();
        const alert = state.alerts.find((a) => a.id === state.tokens[token]);
        if (!alert || !isActive(alert.status)) throw new DataError('alert_not_found');
        alert.status = 'cancelled';
        alert.cancelledAt = iso();
        commit();
      },
    },

    staff: {
      async signIn(email, password) {
        await wait();
        const user = state.staff.find((s) => s.email === email.trim().toLowerCase() && s.active);
        if (!user || password !== DEMO_PASSWORD) throw new DataError('invalid_credentials');
        state.sessionId = user.id;
        commit();
        return toStaffMember(user);
      },
      async signOut() {
        state.sessionId = null;
        commit();
      },
      async currentStaff() {
        const user = state.staff.find((s) => s.id === state.sessionId && s.active);
        return user ? toStaffMember(user) : null;
      },
      async listActiveAlerts() {
        await wait();
        return activeFor(me().venueId);
      },
      watchActiveAlerts(onChange) {
        const push = () => {
          const user = state.staff.find((s) => s.id === state.sessionId);
          onChange(user ? activeFor(user.venueId) : []);
        };
        push();
        return subscribe(push);
      },
      async getAlert(id) {
        try {
          return { ...myAlert(id) };
        } catch {
          return null;
        }
      },
      async ackAlert(id) {
        await wait();
        const alert = myAlert(id);
        if (alert.status === 'open') {
          alert.status = 'seen';
          alert.seenAt = iso();
          commit();
        }
      },
      async startResponse(id) {
        await wait();
        const user = me();
        const alert = myAlert(id);
        if (!isActive(alert.status)) throw new DataError('invalid_transition');
        if (alert.status === 'on_the_way') {
          if (alert.responderId === user.id) return;
          throw new DataError('already_taken');
        }
        alert.status = 'on_the_way';
        alert.seenAt ??= iso();
        alert.onTheWayAt = iso();
        alert.responderId = user.id;
        alert.responderName = user.fullName;
        commit();
      },
      async resolveAlert(id, outcome, note) {
        await wait();
        const user = me();
        const alert = myAlert(id);
        if (!isActive(alert.status)) throw new DataError('invalid_transition');
        if (!outcome) throw new DataError('outcome_required');
        alert.status = 'resolved';
        alert.outcome = outcome;
        alert.note = note?.trim() || null;
        alert.seenAt ??= iso();
        alert.resolvedAt = iso();
        if (!alert.responderId) {
          alert.responderId = user.id;
          alert.responderName = user.fullName;
        }
        commit();
      },
      async setMyAppearance(appearance) {
        await wait();
        me().appearance = appearance.trim() || null;
        commit();
      },
    },

    manager: {
      async getVenue() {
        me();
        return DEMO_VENUE;
      },
      async listAlerts({ from, to }) {
        await wait();
        const user = me();
        return state.alerts.filter((a) => a.venueId === user.venueId && a.createdAt >= from && a.createdAt <= to);
      },
      watchAlerts(onChange) {
        return subscribe(onChange);
      },
      async listStaff() {
        await wait();
        const user = me();
        return state.staff.filter((s) => s.venueId === user.venueId).map((s) => ({ ...toStaffMember(s), email: s.email }));
      },
      async listSpots() {
        await wait();
        const user = me();
        return state.spots.filter((s) => s.venueId === user.venueId);
      },
      async createSpot({ label, kind }) {
        await wait();
        const user = me();
        if (user.role !== 'manager') throw new DataError('not_staff');
        const code = `ESQ${randomChars()}${Math.floor(Math.random() * 10)}`;
        const spot: Spot = { id: `spot-${code}`, venueId: user.venueId, code, label: label.trim(), kind, active: true };
        state.spots.push(spot);
        commit();
        return spot;
      },
      async rotateSpotCode(id) {
        await wait();
        const user = me();
        const spot = state.spots.find((s) => s.id === id && s.venueId === user.venueId);
        if (!spot || user.role !== 'manager') throw new DataError('spot_not_found');
        spot.code = `ESQ${randomChars()}${Math.floor(Math.random() * 10)}`;
        commit();
        return { ...spot };
      },
      async assignAlert(id, staffId) {
        await wait();
        const user = me();
        if (user.role !== 'manager') throw new DataError('not_manager');
        const alert = myAlert(id);
        const target = state.staff.find((s) => s.id === staffId && s.venueId === user.venueId && s.active);
        if (!target) throw new DataError('staff_not_found');
        if (alert.status !== 'open' && alert.status !== 'seen') throw new DataError('invalid_transition');
        alert.assignedToId = target.id;
        alert.assignedToName = target.fullName;
        alert.assignedByName = user.fullName;
        alert.assignedAt = iso();
        alert.status = 'seen';
        alert.seenAt ??= iso();
        commit();
      },
      async createStaff(input) {
        await wait();
        const user = me();
        if (user.role !== 'manager') throw new DataError('not_manager');
        const email = input.email.trim().toLowerCase();
        if (state.staff.some((s) => s.email === email)) throw new DataError('email_taken');
        const created: DemoUser = {
          id: `staff-${randomChars()}`,
          email,
          venueId: user.venueId,
          fullName: input.fullName.trim(),
          role: input.role,
          jobTitle: input.jobTitle?.trim() || null,
          appearance: null,
          trainedAt: input.trainedAt ?? null,
          active: true,
        };
        state.staff.push(created);
        commit();
        return { ...toStaffMember(created), email };
      },
      async updateStaff(id, patch) {
        await wait();
        const user = me();
        if (user.role !== 'manager') throw new DataError('not_manager');
        if (id === user.id && (patch.active === false || patch.role === 'staff')) throw new DataError('cannot_change_self');
        const target = state.staff.find((s) => s.id === id && s.venueId === user.venueId);
        if (!target) throw new DataError('staff_not_found');
        if (patch.active !== undefined) target.active = patch.active;
        if (patch.role) target.role = patch.role;
        if (patch.jobTitle !== undefined) target.jobTitle = patch.jobTitle;
        if (patch.trainedAt !== undefined) target.trainedAt = patch.trainedAt;
        commit();
        return { ...toStaffMember(target), email: target.email };
      },
      async setSpotActive(id, active) {
        await wait();
        const user = me();
        const spot = state.spots.find((s) => s.id === id && s.venueId === user.venueId);
        if (!spot || user.role !== 'manager') throw new DataError('not_staff');
        spot.active = active;
        commit();
      },
      async getMenu() {
        await wait();
        managerOnly();
        return menuOf();
      },
      async setMenuUrl(url) {
        await wait();
        managerOnly();
        if (url !== null && !/^https:\/\/\S+$/.test(url)) throw new DataError('unknown', 'invalid_url');
        state.menu = { ...menuOf(), url };
        commit();
        return menuOf();
      },
      async addMenuFile({ contentType, base64 }) {
        await wait();
        managerOnly();
        const menu = menuOf();
        if (menu.files.length >= MENU_LIMITS.maxFiles) throw new DataError('menu_full');
        if (!(MENU_LIMITS.contentTypes as readonly string[]).includes(contentType)) throw new DataError('invalid_image');
        const size = Math.floor((base64.length * 3) / 4);
        if (size > MENU_LIMITS.maxBytes) throw new DataError('invalid_image');
        const id = `menu-${randomToken().slice(0, 12)}`;
        state.menu = { ...menu, files: [...menu.files, { id, url: `data:${contentType};base64,${base64}`, contentType, size }] };
        commit();
        return menuOf();
      },
      async getWifi() {
        await wait();
        managerOnly();
        return state.wifi ?? null;
      },
      async setWifi(wifi) {
        await wait();
        managerOnly();
        state.wifi = wifi && wifi.ssid.trim() ? { ssid: wifi.ssid.trim(), password: wifi.password || null } : null;
        commit();
        return state.wifi;
      },
      async removeMenuFile(id) {
        await wait();
        managerOnly();
        const menu = menuOf();
        state.menu = { ...menu, files: menu.files.filter((f) => f.id !== id) };
        commit();
        return menuOf();
      },
    },

    simulateIncomingAlert(spotCode = 'ESQBF7K2', kind = 'unsafe') {
      return createAlert(spotCode, kind);
    },

    reset() {
      const session = state.sessionId;
      state = freshState(now());
      state.sessionId = session;
      commit();
    },
  };

  return source;
}
