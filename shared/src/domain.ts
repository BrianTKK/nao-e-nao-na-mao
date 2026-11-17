/** Tipos e textos do domínio, iguais no app, na web, no servidor e no banco (db/migrations). */

export type AlertKind = 'unsafe' | 'leave' | 'talk';
export type AlertStatus = 'open' | 'seen' | 'on_the_way' | 'resolved' | 'cancelled';
export type AlertOutcome =
  | 'escorted'
  | 'aggressor_removed'
  | 'ride_called'
  | 'police_called'
  | 'talk_resolved'
  | 'not_found'
  | 'false_alarm';
export type SpotKind = 'restroom' | 'table' | 'bar' | 'outdoor' | 'other';
export type StaffRole = 'staff' | 'manager';

export const ALERT_KINDS: AlertKind[] = ['unsafe', 'leave', 'talk'];
export const ACTIVE_STATUSES: AlertStatus[] = ['open', 'seen', 'on_the_way'];
export const ALERT_OUTCOMES: AlertOutcome[] = [
  'escorted',
  'aggressor_removed',
  'ride_called',
  'talk_resolved',
  'police_called',
  'not_found',
  'false_alarm',
];

export interface Venue {
  id: string;
  name: string;
  neighborhood: string | null;
  city: string;
  helpPhrase: string;
}

export interface Spot {
  id: string;
  venueId: string;
  code: string;
  label: string;
  kind: SpotKind;
  active: boolean;
}

export interface StaffMember {
  id: string;
  venueId: string;
  fullName: string;
  role: StaffRole;
  jobTitle: string | null;
  appearance: string | null;
  trainedAt: string | null;
  active: boolean;
  /** Só na lista da gerência. */
  email?: string;
}

/** Pedido como a equipe e a gerência veem. */
export interface Alert {
  id: string;
  venueId: string;
  spotId: string;
  spotLabel: string;
  kind: AlertKind;
  status: AlertStatus;
  shortCode: string;
  createdAt: string;
  seenAt: string | null;
  onTheWayAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  responderId: string | null;
  responderName: string | null;
  /** Para quem a gerência direcionou o pedido (ainda não é "a caminho"). */
  assignedToId: string | null;
  assignedToName: string | null;
  /** Quem da gerência direcionou ("Marta pediu que você vá"). */
  assignedByName: string | null;
  assignedAt: string | null;
  outcome: AlertOutcome | null;
  note: string | null;
}

/** O que a página do QR code mostra de um local, sem login. */
export interface PublicSpot {
  code: string;
  label: string;
  venueName: string;
  helpPhrase: string;
}

/** O que a mulher vê do próprio pedido, pelo token. */
export interface PublicAlert {
  status: AlertStatus;
  kind: AlertKind;
  spotLabel: string;
  venueName: string;
  shortCode: string;
  createdAt: string;
  seenAt: string | null;
  onTheWayAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  responderFirstName: string | null;
  responderAppearance: string | null;
  /** Quem a gerência chamou, antes de a pessoa tocar em "Estou indo". */
  assignedFirstName: string | null;
  assignedAppearance: string | null;
}

// ---------------------------------------------------------------------------
// Textos (português na interface; o código fica em inglês)
// ---------------------------------------------------------------------------

/** Opções que a mulher escolhe na página do QR code. */
export const KIND_LABEL: Record<AlertKind, string> = {
  unsafe: 'Estou me sentindo insegura',
  leave: 'Quero sair daqui com segurança',
  talk: 'Quero falar com alguém da equipe',
};

/** O mesmo pedido, dito para a equipe. */
export const KIND_STAFF_LABEL: Record<AlertKind, string> = {
  unsafe: 'Está se sentindo insegura',
  leave: 'Quer sair com segurança',
  talk: 'Quer falar com a equipe',
};

export const STATUS_LABEL: Record<AlertStatus, string> = {
  open: 'Novo',
  seen: 'Visto',
  on_the_way: 'A caminho',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
};

export const OUTCOME_LABEL: Record<AlertOutcome, string> = {
  escorted: 'Acompanhei até um lugar seguro ou até o carro',
  aggressor_removed: 'A pessoa que incomodava foi retirada',
  ride_called: 'Chamamos um carro ou um contato dela',
  talk_resolved: 'A conversa resolveu',
  police_called: 'Acionamos o 190',
  not_found: 'Não encontrei a pessoa',
  false_alarm: 'Pedido indevido',
};

export const SPOT_KIND_LABEL: Record<SpotKind, string> = {
  restroom: 'Banheiro',
  table: 'Mesa',
  bar: 'Balcão',
  outdoor: 'Área externa',
  other: 'Outro',
};

// ---------------------------------------------------------------------------
// Regras e contas
// ---------------------------------------------------------------------------

export function isActive(status: AlertStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function seconds(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
}

/** Do pedido até alguém da equipe dizer "estou indo" (o "respondido em 40 s"). */
export function responseSeconds(a: Pick<Alert, 'createdAt' | 'onTheWayAt'>): number | null {
  return seconds(a.createdAt, a.onTheWayAt);
}

/** Do pedido até alguém ver. */
export function seenSeconds(a: Pick<Alert, 'createdAt' | 'seenAt'>): number | null {
  return seconds(a.createdAt, a.seenAt);
}

export function elapsedSeconds(fromIso: string, now: number = Date.now()): number {
  return Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000));
}

/** "40 s", "2 min", "2 min 05 s", "1 h 10 min". */
export function formatDuration(totalSeconds: number, withSeconds = false): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (withSeconds && rest > 0) return `${m} min ${String(rest).padStart(2, '0')} s`;
  return `${m} min`;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Percentil p (0 a 100) pelo método do valor mais próximo. Ex.: 90 = "9 em cada 10 até". */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export interface AlertStats {
  total: number;
  resolved: number;
  cancelled: number;
  medianResponseSeconds: number | null;
  medianSeenSeconds: number | null;
  byOutcome: Partial<Record<AlertOutcome, number>>;
  bySpot: Record<string, number>;
}

/** Números do painel da gerência (o que serve de prova diante do Procon). */
export function computeStats(alerts: Alert[]): AlertStats {
  const response = alerts.map(responseSeconds).filter((v): v is number => v !== null);
  const seen = alerts.map(seenSeconds).filter((v): v is number => v !== null);
  const byOutcome: Partial<Record<AlertOutcome, number>> = {};
  const bySpot: Record<string, number> = {};
  for (const a of alerts) {
    if (a.outcome) byOutcome[a.outcome] = (byOutcome[a.outcome] ?? 0) + 1;
    bySpot[a.spotLabel] = (bySpot[a.spotLabel] ?? 0) + 1;
  }
  return {
    total: alerts.length,
    resolved: alerts.filter((a) => a.status === 'resolved').length,
    cancelled: alerts.filter((a) => a.status === 'cancelled').length,
    medianResponseSeconds: median(response),
    medianSeenSeconds: median(seen),
    byOutcome,
    bySpot,
  };
}

/** Primeiro nome, para a página da mulher ("Diego está indo"). */
export function firstName(fullName: string | null): string | null {
  return fullName ? fullName.trim().split(/\s+/)[0] : null;
}

/** "Diego, de camisa preta, foi chamado para ir até você." */
export function calledMessage(name: string | null, appearance: string | null): string {
  const who = name ?? 'Alguém da equipe';
  return appearance ? `${who}, de ${appearance}, foi chamado para ir até você.` : `${who} foi chamado para ir até você.`;
}

/** "Diego, de camisa preta, está indo até você." */
export function onTheWayMessage(name: string | null, appearance: string | null): string {
  const who = name ?? 'Alguém da equipe';
  return appearance ? `${who}, de ${appearance}, está indo até você.` : `${who} está indo até você.`;
}
