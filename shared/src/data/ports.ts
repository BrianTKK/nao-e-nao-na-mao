/**
 * A camada de dados que o app e a web usam. As telas só conhecem estas
 * interfaces; quem as implementa é trocável:
 * - `mock.ts`: dados simulados em memória (funciona sem conta e sem internet);
 * - `api`: o servidor próprio (server/), por HTTP e WebSocket (fatia F1).
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

/** Estado da ligação em tempo real da equipe com o servidor (o app mostra). */
export type ConnectionState = 'online' | 'connecting' | 'offline';

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
  | 'not_manager'
  | 'staff_not_found'
  | 'email_taken'
  | 'cannot_change_self'
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
  /** Troca o código impresso no QR; o código antigo para de funcionar. */
  rotateSpotCode(id: string): Promise<Spot>;
  /** Direciona o pedido para alguém da equipe (assumir = staff.startResponse). */
  assignAlert(id: string, staffId: string): Promise<void>;
  createStaff(input: NewStaffInput): Promise<StaffMember>;
  updateStaff(id: string, patch: StaffPatch): Promise<StaffMember>;
}

export interface NewStaffInput {
  email: string;
  fullName: string;
  role: StaffMember['role'];
  jobTitle?: string;
  trainedAt?: string | null;
  /** Senha provisória (8+ caracteres) que a gerência entrega à pessoa. */
  password: string;
}

export interface StaffPatch {
  active?: boolean;
  role?: StaffMember['role'];
  jobTitle?: string | null;
  trainedAt?: string | null;
}

export interface DataSource {
  readonly kind: 'mock' | 'api';
  /** Avisa quando a ligação em tempo real cai ou volta (só depois do login). */
  watchConnection(onChange: (state: ConnectionState) => void): Unsubscribe;
  readonly public: PublicApi;
  /** A gerência usa o mesmo login da equipe (staff.signIn) e depois o manager. */
  readonly staff: StaffApi;
  readonly manager: ManagerApi;
}
