/**
 * A camada de dados que o app e a web usam. As telas só conhecem estas
 * interfaces; quem as implementa é trocável:
 * - `mock.ts`: dados simulados em memória (funciona sem conta e sem internet);
 * - Supabase (fatia F1) ou um backend próprio na VPS, se for a escolha.
 */
import type {
  Alert,
  AlertKind,
  AlertOutcome,
  PublicAlert,
  PublicSpot,
  Spot,
  SpotKind,
  StaffMember,
  Venue,
} from '../domain';

export type Unsubscribe = () => void;

export type DataErrorCode =
  | 'spot_not_found'
  | 'alert_not_found'
  | 'rate_limited'
  | 'invalid_kind'
  | 'invalid_transition'
  | 'already_taken'
  | 'outcome_required'
  | 'not_staff'
  | 'invalid_credentials'
  | 'network'
  | 'unknown';

export class DataError extends Error {
  readonly code: DataErrorCode;
  constructor(code: DataErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'DataError';
  }
}

/** Página do QR code: sem login. */
export interface PublicApi {
  getSpot(code: string): Promise<PublicSpot | null>;
  /** Devolve o token que só esta página conhece e o código curto. */
  createAlert(spotCode: string, kind: AlertKind): Promise<{ token: string; shortCode: string }>;
  getAlert(token: string): Promise<PublicAlert | null>;
  /** Avisa a cada mudança do pedido. */
  watchAlert(token: string, onChange: (alert: PublicAlert | null) => void): Unsubscribe;
  cancelAlert(token: string): Promise<void>;
}

/** App da equipe: com login. */
export interface StaffApi {
  signIn(email: string, password: string): Promise<StaffMember>;
  signOut(): Promise<void>;
  currentStaff(): Promise<StaffMember | null>;
  /** Pedidos ainda abertos (novo, visto, a caminho) do bar. */
  listActiveAlerts(): Promise<Alert[]>;
  /** Avisa com a lista de pedidos abertos a cada mudança. */
  watchActiveAlerts(onChange: (alerts: Alert[]) => void): Unsubscribe;
  getAlert(id: string): Promise<Alert | null>;
  ackAlert(id: string): Promise<void>;
  startResponse(id: string): Promise<void>;
  resolveAlert(id: string, outcome: AlertOutcome, note?: string): Promise<void>;
  setMyAppearance(appearance: string): Promise<void>;
}

/** Painel da gerência (web): com login de gerente. */
export interface ManagerApi {
  getVenue(): Promise<Venue>;
  listAlerts(range: { from: string; to: string }): Promise<Alert[]>;
  watchAlerts(onChange: () => void): Unsubscribe;
  listStaff(): Promise<StaffMember[]>;
  listSpots(): Promise<Spot[]>;
  createSpot(input: { label: string; kind: SpotKind }): Promise<Spot>;
  setSpotActive(id: string, active: boolean): Promise<void>;
}

export interface DataSource {
  readonly kind: 'mock' | 'supabase';
  readonly public: PublicApi;
  /** A gerência usa o mesmo login da equipe (staff.signIn) e depois o manager. */
  readonly staff: StaffApi;
  readonly manager: ManagerApi;
}
