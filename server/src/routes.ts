import { randomInt } from 'node:crypto';
import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ALERT_KINDS, ALERT_OUTCOMES, SPOT_KIND_LABEL, type SpotKind } from '@nenm/shared';
import type { Db } from './db';
import type { Auth } from './auth';
import { HttpError } from './errors';
import * as q from './queries';

export interface RouteDeps {
  db: Db;
  auth: Auth;
  /** Avisa o tempo real que um pedido mudou. */
  alertChanged: (alertId: string) => void;
  limits: { alertsPerMinutePerIp: number; loginsPer5MinPerIp: number };
}

const uuid = z.string().uuid();
const alertToken = z.string().regex(/^[0-9a-f]{64}$/);
const spotCode = z.string().regex(/^[A-Za-z0-9]{6,12}$/);
const kind = z.enum(ALERT_KINDS as [string, ...string[]]);
const outcome = z.enum(ALERT_OUTCOMES as [string, ...string[]]);
const spotKinds = Object.keys(SPOT_KIND_LABEL) as [SpotKind, ...SpotKind[]];

const SPOT_ALPHABET = 'ACDEFHJKMNPRTWXY34679';
/** Código do QR: 10 caracteres ao acaso (21^10 ≈ 1,7 × 10^13 combinações), impossível de adivinhar. */
const newSpotCode = () => Array.from({ length: 10 }, () => SPOT_ALPHABET[randomInt(SPOT_ALPHABET.length)]).join('');

/** Token da mulher vem num cabeçalho, não na URL, para não ficar em logs. */
const tokenFrom = (req: Request) => alertToken.parse(req.header('x-alert-token'));

const limiter = (limit: number, windowMs: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited' });
    },
  });

export function createRoutes({ db, auth, alertChanged, limits }: RouteDeps): Router {
  const r = Router();

  // ------------------------------------------------------------------ página do QR (sem login)

  r.get('/spots/:code', async (req, res) => {
    const spot = await q.getPublicSpot(db, spotCode.parse(req.params.code));
    if (!spot) throw new HttpError(404, 'spot_not_found');
    res.json(spot);
  });

  r.post('/alerts', limiter(limits.alertsPerMinutePerIp, 60_000), async (req, res) => {
    const body = z.object({ spotCode, kind }).strict().parse(req.body);
    const { rows } = await db.query<{ alert_id: string; token: string; short_code: string }>(
      'select * from create_alert($1, $2)',
      [body.spotCode, body.kind],
    );
    alertChanged(rows[0].alert_id);
    res.status(201).json({ token: rows[0].token, shortCode: rows[0].short_code });
  });

  r.get('/alerts/mine', async (req, res) => {
    const alert = await q.getPublicAlertByToken(db, tokenFrom(req));
    if (!alert) throw new HttpError(404, 'alert_not_found');
    res.json(alert);
  });

  r.post('/alerts/mine/cancel', async (req, res) => {
    const { rows } = await db.query<{ alert_id: string }>('select * from cancel_alert_by_token($1)', [tokenFrom(req)]);
    alertChanged(rows[0].alert_id);
    res.status(204).end();
  });

  // ------------------------------------------------------------------ login

  r.post('/auth/login', limiter(limits.loginsPer5MinPerIp, 5 * 60_000), async (req, res) => {
    const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).strict().parse(req.body);
    const { token, actor } = await auth.login(body.email, body.password);
    res.json({ token, staff: await q.getStaffMember(db, actor.id) });
  });

  r.get('/me', auth.requireStaff, async (req, res) => {
    res.json(await q.getStaffMember(db, req.actor!.id));
  });

  r.put('/me/appearance', auth.requireStaff, async (req, res) => {
    const body = z.object({ appearance: z.string().max(60) }).strict().parse(req.body);
    await db.query('select set_appearance($1, $2)', [req.actor!.id, body.appearance]);
    res.json(await q.getStaffMember(db, req.actor!.id));
  });

  // ------------------------------------------------------------------ equipe (app)

  r.get('/staff/alerts/active', auth.requireStaff, async (req, res) => {
    res.json(await q.listActiveAlerts(db, req.actor!.venueId));
  });

  r.get('/staff/alerts/:id', auth.requireStaff, async (req, res) => {
    const alert = await q.getAlert(db, req.actor!.venueId, uuid.parse(req.params.id));
    if (!alert) throw new HttpError(404, 'alert_not_found');
    res.json(alert);
  });

  const transition = (fn: string) =>
    r.post(`/staff/alerts/:id/${fn}`, auth.requireStaff, async (req, res) => {
      const id = uuid.parse(req.params.id);
      if (fn === 'resolve') {
        const body = z.object({ outcome, note: z.string().max(500).optional() }).strict().parse(req.body);
        await db.query('select resolve_alert($1, $2, $3, $4)', [req.actor!.id, id, body.outcome, body.note ?? null]);
      } else {
        await db.query(`select ${fn === 'ack' ? 'ack_alert' : 'start_response'}($1, $2)`, [req.actor!.id, id]);
      }
      alertChanged(id);
      res.json(await q.getAlert(db, req.actor!.venueId, id));
    });
  transition('ack');
  transition('start');
  transition('resolve');

  // ------------------------------------------------------------------ gerência (web)

  r.get('/manager/venue', auth.requireManager, async (req, res) => {
    res.json(await q.getVenue(db, req.actor!.venueId));
  });

  r.get('/manager/alerts', auth.requireManager, async (req, res) => {
    const range = z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(req.query);
    res.json(await q.listAlerts(db, req.actor!.venueId, range.from, range.to));
  });

  r.get('/manager/staff', auth.requireManager, async (req, res) => {
    res.json(await q.listStaff(db, req.actor!.venueId));
  });

  r.get('/manager/spots', auth.requireManager, async (req, res) => {
    res.json(await q.listSpots(db, req.actor!.venueId));
  });

  r.post('/manager/spots', auth.requireManager, async (req, res) => {
    const body = z.object({ label: z.string().trim().min(2).max(40), kind: z.enum(spotKinds) }).strict().parse(req.body);
    const { rows } = await db.query<Parameters<typeof q.toSpot>[0]>(
      'insert into spots (venue_id, code, label, kind) values ($1, $2, $3, $4) returning id, venue_id, code, label, kind, active',
      [req.actor!.venueId, newSpotCode(), body.label, body.kind],
    );
    res.status(201).json(q.toSpot(rows[0]));
  });

  r.patch('/manager/spots/:id', auth.requireManager, async (req, res) => {
    const body = z.object({ active: z.boolean() }).strict().parse(req.body);
    const { rows } = await db.query('update spots set active = $1 where id = $2 and venue_id = $3 returning id', [
      body.active,
      uuid.parse(req.params.id),
      req.actor!.venueId,
    ]);
    if (!rows[0]) throw new HttpError(404, 'spot_not_found');
    res.status(204).end();
  });

  return r;
}
