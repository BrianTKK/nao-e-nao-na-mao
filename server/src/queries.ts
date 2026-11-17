import type { Alert, PublicAlert, PublicSpot, Spot, StaffMember, Venue, VenueMenu, VenueWifi } from '@nenm/shared';
import type { Queryable } from './db';

/** Consultas de leitura. Toda consulta da equipe recebe o bar de quem está logado. */

const ALERT_SELECT = `
  select a.id, a.venue_id, a.spot_id, sp.label as spot_label, a.kind, a.status, a.short_code,
         a.created_at, a.seen_at, a.on_the_way_at, a.resolved_at, a.cancelled_at,
         a.responder_id, st.full_name as responder_name,
         a.assigned_to, asg.full_name as assigned_to_name, by_.full_name as assigned_by_name, a.assigned_at,
         a.outcome, a.note
  from alerts a
  join spots sp on sp.id = a.spot_id
  left join staff st on st.id = a.responder_id
  left join staff asg on asg.id = a.assigned_to
  left join staff by_ on by_.id = a.assigned_by`;

interface AlertRow {
  id: string;
  venue_id: string;
  spot_id: string;
  spot_label: string;
  kind: Alert['kind'];
  status: Alert['status'];
  short_code: string;
  created_at: string;
  seen_at: string | null;
  on_the_way_at: string | null;
  resolved_at: string | null;
  cancelled_at: string | null;
  responder_id: string | null;
  responder_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_by_name: string | null;
  assigned_at: string | null;
  outcome: Alert['outcome'];
  note: string | null;
}

const toAlert = (r: AlertRow): Alert => ({
  id: r.id,
  venueId: r.venue_id,
  spotId: r.spot_id,
  spotLabel: r.spot_label,
  kind: r.kind,
  status: r.status,
  shortCode: r.short_code,
  createdAt: r.created_at,
  seenAt: r.seen_at,
  onTheWayAt: r.on_the_way_at,
  resolvedAt: r.resolved_at,
  cancelledAt: r.cancelled_at,
  responderId: r.responder_id,
  responderName: r.responder_name,
  assignedToId: r.assigned_to,
  assignedToName: r.assigned_to_name,
  assignedByName: r.assigned_by_name,
  assignedAt: r.assigned_at,
  outcome: r.outcome,
  note: r.note,
});

export async function getAlert(db: Queryable, venueId: string, id: string): Promise<Alert | null> {
  const { rows } = await db.query<AlertRow>(`${ALERT_SELECT} where a.venue_id = $1 and a.id = $2`, [venueId, id]);
  return rows[0] ? toAlert(rows[0]) : null;
}

export async function listActiveAlerts(db: Queryable, venueId: string): Promise<Alert[]> {
  const { rows } = await db.query<AlertRow>(
    `${ALERT_SELECT} where a.venue_id = $1 and a.status in ('open', 'seen', 'on_the_way') order by a.created_at`,
    [venueId],
  );
  return rows.map(toAlert);
}

export async function listAlerts(db: Queryable, venueId: string, from: string, to: string): Promise<Alert[]> {
  const { rows } = await db.query<AlertRow>(
    `${ALERT_SELECT} where a.venue_id = $1 and a.created_at between $2 and $3 order by a.created_at desc limit 2000`,
    [venueId, from, to],
  );
  return rows.map(toAlert);
}

interface PublicRow {
  status: PublicAlert['status'];
  kind: PublicAlert['kind'];
  spot_label: string;
  venue_name: string;
  short_code: string;
  created_at: string;
  seen_at: string | null;
  on_the_way_at: string | null;
  resolved_at: string | null;
  cancelled_at: string | null;
  responder_first_name: string | null;
  responder_appearance: string | null;
  assigned_first_name: string | null;
  assigned_appearance: string | null;
}

const toPublic = (r: PublicRow): PublicAlert => ({
  status: r.status,
  kind: r.kind,
  spotLabel: r.spot_label,
  venueName: r.venue_name,
  shortCode: r.short_code,
  createdAt: r.created_at,
  seenAt: r.seen_at,
  onTheWayAt: r.on_the_way_at,
  resolvedAt: r.resolved_at,
  cancelledAt: r.cancelled_at,
  responderFirstName: r.responder_first_name,
  responderAppearance: r.responder_appearance,
  // Depois que alguém está indo, a página mostra quem vai, não quem foi chamado.
  assignedFirstName: r.responder_first_name ? null : r.assigned_first_name,
  assignedAppearance: r.responder_first_name ? null : r.assigned_appearance,
});

export async function getPublicAlertByToken(db: Queryable, token: string): Promise<PublicAlert | null> {
  const { rows } = await db.query<PublicRow>('select * from get_alert_by_token($1)', [token]);
  return rows[0] ? toPublic(rows[0]) : null;
}

/** Mesma visão, a partir do hash (usada para avisar a sala do pedido no tempo real). */
export async function getPublicAlertByHash(db: Queryable, tokenHash: string): Promise<PublicAlert | null> {
  const { rows } = await db.query<PublicRow>(
    `select a.status, a.kind, sp.label as spot_label, v.name as venue_name, a.short_code,
            a.created_at, a.seen_at, a.on_the_way_at, a.resolved_at, a.cancelled_at,
            split_part(st.full_name, ' ', 1) as responder_first_name, st.appearance as responder_appearance,
            split_part(asg.full_name, ' ', 1) as assigned_first_name, asg.appearance as assigned_appearance
     from alerts a
     join spots sp on sp.id = a.spot_id
     join venues v on v.id = a.venue_id
     left join staff st on st.id = a.responder_id
     left join staff asg on asg.id = a.assigned_to
     where a.token_hash = $1 and a.created_at > now() - interval '12 hours'`,
    [tokenHash],
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function getPublicSpot(db: Queryable, code: string): Promise<PublicSpot | null> {
  const { rows } = await db.query<{
    code: string;
    label: string;
    venue_id: string;
    venue_name: string;
    help_phrase: string;
    wifi_ssid: string | null;
    wifi_password: string | null;
  }>(
    `select s.code, s.label, v.id as venue_id, v.name as venue_name, v.help_phrase, v.wifi_ssid, v.wifi_password
     from spots s join venues v on v.id = s.venue_id
     where s.code = $1 and s.active`,
    [code.toUpperCase()],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    code: r.code,
    label: r.label,
    venueName: r.venue_name,
    helpPhrase: r.help_phrase,
    menu: await getMenu(db, r.venue_id),
    wifi: r.wifi_ssid ? { ssid: r.wifi_ssid, password: r.wifi_password } : null,
  };
}

export async function getWifi(db: Queryable, venueId: string): Promise<VenueWifi | null> {
  const { rows } = await db.query<{ wifi_ssid: string | null; wifi_password: string | null }>(
    'select wifi_ssid, wifi_password from venues where id = $1',
    [venueId],
  );
  const r = rows[0];
  return r?.wifi_ssid ? { ssid: r.wifi_ssid, password: r.wifi_password } : null;
}

/** Cardápio do próprio local: o link e a lista das fotos, sem os bytes (que saem por /menu-files/:id). */
export async function getMenu(db: Queryable, venueId: string): Promise<VenueMenu> {
  const venue = await db.query<{ menu_url: string | null }>('select menu_url from venues where id = $1', [venueId]);
  const files = await db.query<{ id: string; content_type: string; size: number }>(
    'select id, content_type, size from menu_files where venue_id = $1 order by position, created_at',
    [venueId],
  );
  return {
    url: venue.rows[0]?.menu_url ?? null,
    files: files.rows.map((f) => ({ id: f.id, url: `/api/menu-files/${f.id}`, contentType: f.content_type, size: f.size })),
  };
}

interface StaffRow {
  id: string;
  venue_id: string;
  full_name: string;
  role: StaffMember['role'];
  job_title: string | null;
  appearance: string | null;
  trained_at: string | null;
  active: boolean;
  email?: string;
}

const toStaff = (r: StaffRow): StaffMember => ({
  id: r.id,
  venueId: r.venue_id,
  fullName: r.full_name,
  role: r.role,
  jobTitle: r.job_title,
  appearance: r.appearance,
  trainedAt: r.trained_at,
  active: r.active,
  ...(r.email ? { email: r.email } : {}),
});

export async function getStaffInVenue(db: Queryable, venueId: string, id: string): Promise<StaffMember | null> {
  const { rows } = await db.query<StaffRow>('select s.*, u.email from staff s join users u on u.id = s.id where s.venue_id = $1 and s.id = $2', [venueId, id]);
  return rows[0] ? toStaff(rows[0]) : null;
}

export async function getStaffMember(db: Queryable, id: string): Promise<StaffMember | null> {
  const { rows } = await db.query<StaffRow>('select * from staff where id = $1', [id]);
  return rows[0] ? toStaff(rows[0]) : null;
}

export async function listStaff(db: Queryable, venueId: string): Promise<StaffMember[]> {
  const { rows } = await db.query<StaffRow>(
    'select s.*, u.email from staff s join users u on u.id = s.id where s.venue_id = $1 order by s.active desc, s.role, s.full_name',
    [venueId],
  );
  return rows.map(toStaff);
}

export async function getVenue(db: Queryable, venueId: string): Promise<Venue> {
  const { rows } = await db.query<{ id: string; name: string; neighborhood: string | null; city: string; help_phrase: string }>(
    'select id, name, neighborhood, city, help_phrase from venues where id = $1',
    [venueId],
  );
  const r = rows[0];
  return { id: r.id, name: r.name, neighborhood: r.neighborhood, city: r.city, helpPhrase: r.help_phrase };
}

interface SpotRow {
  id: string;
  venue_id: string;
  code: string;
  label: string;
  kind: Spot['kind'];
  active: boolean;
}

export const toSpot = (r: SpotRow): Spot => ({ id: r.id, venueId: r.venue_id, code: r.code, label: r.label, kind: r.kind, active: r.active });

export async function listSpots(db: Queryable, venueId: string): Promise<Spot[]> {
  const { rows } = await db.query<SpotRow>('select id, venue_id, code, label, kind, active from spots where venue_id = $1 order by created_at, label', [venueId]);
  return rows.map(toSpot);
}
