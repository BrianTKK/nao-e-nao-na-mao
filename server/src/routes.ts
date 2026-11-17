import { randomInt } from 'node:crypto';
import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ALERT_KINDS, ALERT_OUTCOMES, MENU_LIMITS, SPOT_KIND_LABEL, WIFI_LIMITS, type SpotKind } from '@nenm/shared';
import type { Db } from './db';
import type { Auth } from './auth';
import { HttpError } from './errors';
import * as q from './queries';

export interface RouteDeps {
  db: Db;
  auth: Auth;
  /** Avisa o tempo real que um pedido mudou. */
  alertChanged: (alertId: string) => void;
  /** Derruba o tempo real de quem foi desativado. */
  disconnectUser: (userId: string) => void;
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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Confere pelos primeiros bytes que o arquivo é mesmo a imagem que diz ser
 * (não basta o tipo declarado: ele vem de quem envia).
 */
export function sniffImage(bytes: Buffer): (typeof MENU_LIMITS.contentTypes)[number] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const menuUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => u.startsWith('https://') && !/\s/.test(u), 'https_only');

export function createRoutes({ db, auth, alertChanged, disconnectUser, limits }: RouteDeps): Router {
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

  // ------------------------------------------------------------------ push remoto (app próprio, Android)

  // Token do Firebase do aparelho. O app registra ao entrar (e a cada abertura) e remove ao sair.
  const pushToken = z.string().regex(/^[A-Za-z0-9_:-]{20,4096}$/);

  r.put('/me/push-token', auth.requireStaff, async (req, res) => {
    const body = z.object({ token: pushToken, platform: z.literal('android') }).strict().parse(req.body);
    await db.tx(async (t) => {
      // O token é do aparelho: se outra pessoa entrou nele, passa para ela.
      await t.query(
        `insert into push_tokens (user_id, token, platform) values ($1, $2, $3)
         on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()`,
        [req.actor!.id, body.token, body.platform],
      );
      // No máximo 5 aparelhos por pessoa: os mais antigos saem.
      await t.query(
        `delete from push_tokens where user_id = $1 and id not in (
           select id from push_tokens where user_id = $1 order by updated_at desc limit 5)`,
        [req.actor!.id],
      );
    });
    res.status(204).end();
  });

  r.delete('/me/push-token', auth.requireStaff, async (req, res) => {
    const body = z.object({ token: pushToken }).strict().parse(req.body);
    await db.query('delete from push_tokens where token = $1 and user_id = $2', [body.token, req.actor!.id]);
    res.status(204).end();
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

  // Direcionar: a gerência escolhe quem vai. Assumir = a própria gerência usa /staff/alerts/:id/start.
  r.post('/manager/alerts/:id/assign', auth.requireManager, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const body = z.object({ staffId: uuid }).strict().parse(req.body);
    await db.query('select assign_alert($1, $2, $3)', [req.actor!.id, id, body.staffId]);
    alertChanged(id);
    res.json(await q.getAlert(db, req.actor!.venueId, id));
  });

  r.post('/manager/staff', auth.requireManager, async (req, res) => {
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email().max(200),
        fullName: z.string().trim().min(3).max(80),
        role: z.enum(['staff', 'manager']),
        jobTitle: z.string().trim().max(40).optional(),
        trainedAt: isoDate.nullable().optional(),
        // Senha provisória que a gerência entrega à pessoa.
        password: z.string().min(8).max(200),
      })
      .strict()
      .parse(req.body);
    const hash = await bcrypt.hash(body.password, 10);
    const id = await db.tx(async (t) => {
      const taken = await t.query('select 1 from users where email = $1', [body.email]);
      if (taken.rows.length) throw new HttpError(409, 'email_taken');
      const { rows } = await t.query<{ id: string }>('insert into users (email, password_hash) values ($1, $2) returning id', [body.email, hash]);
      await t.query(
        'insert into staff (id, venue_id, full_name, role, job_title, trained_at) values ($1, $2, $3, $4, $5, $6)',
        [rows[0].id, req.actor!.venueId, body.fullName, body.role, body.jobTitle || null, body.trainedAt ?? null],
      );
      return rows[0].id;
    });
    res.status(201).json(await q.getStaffInVenue(db, req.actor!.venueId, id));
  });

  r.patch('/manager/staff/:id', auth.requireManager, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const body = z
      .object({
        active: z.boolean().optional(),
        role: z.enum(['staff', 'manager']).optional(),
        jobTitle: z.string().trim().max(40).nullable().optional(),
        trainedAt: isoDate.nullable().optional(),
      })
      .strict()
      .parse(req.body);
    // Ninguém tira o próprio acesso pelo painel (o bar ficaria sem gerência).
    if (id === req.actor!.id && (body.active === false || body.role === 'staff')) throw new HttpError(409, 'cannot_change_self');
    const current = await q.getStaffInVenue(db, req.actor!.venueId, id);
    if (!current) throw new HttpError(404, 'staff_not_found');
    await db.query(
      `update staff set
         active = coalesce($3, active),
         role = coalesce($4, role),
         job_title = case when $5::boolean then $6 else job_title end,
         trained_at = case when $7::boolean then $8::date else trained_at end
       where id = $1 and venue_id = $2`,
      [id, req.actor!.venueId, body.active ?? null, body.role ?? null, 'jobTitle' in body, body.jobTitle ?? null, 'trainedAt' in body, body.trainedAt ?? null],
    );
    if (body.active === false || (body.role && body.role !== current.role)) disconnectUser(id);
    res.json(await q.getStaffInVenue(db, req.actor!.venueId, id));
  });

  // Troca o código do QR (ex.: QR arrancado ou usado para trote): o código antigo deixa de funcionar.
  r.post('/manager/spots/:id/rotate-code', auth.requireManager, async (req, res) => {
    const { rows } = await db.query<Parameters<typeof q.toSpot>[0]>(
      'update spots set code = $1 where id = $2 and venue_id = $3 returning id, venue_id, code, label, kind, active',
      [newSpotCode(), uuid.parse(req.params.id), req.actor!.venueId],
    );
    if (!rows[0]) throw new HttpError(404, 'spot_not_found');
    res.json(q.toSpot(rows[0]));
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

  // ------------------------------------------------------------------ cardápio do local

  r.get('/manager/menu', auth.requireManager, async (req, res) => {
    res.json(await q.getMenu(db, req.actor!.venueId));
  });

  r.put('/manager/menu/url', auth.requireManager, async (req, res) => {
    const body = z.object({ url: z.union([menuUrl, z.null(), z.literal('')]) }).strict().parse(req.body);
    await db.query('update venues set menu_url = $1 where id = $2', [body.url || null, req.actor!.venueId]);
    res.json(await q.getMenu(db, req.actor!.venueId));
  });

  // A imagem chega em base64 já reduzida pelo painel ou pelo app (o PDF vira imagens no painel).
  r.post('/manager/menu/files', auth.requireManager, async (req, res) => {
    const maxBase64 = Math.ceil((MENU_LIMITS.maxBytes * 4) / 3) + 4;
    const body = z
      .object({
        contentType: z.enum(MENU_LIMITS.contentTypes),
        base64: z.string().max(maxBase64).regex(/^[A-Za-z0-9+/]+={0,2}$/),
      })
      .strict()
      .parse(req.body);
    const bytes = Buffer.from(body.base64, 'base64');
    if (bytes.length === 0 || bytes.length > MENU_LIMITS.maxBytes || sniffImage(bytes) !== body.contentType) {
      throw new HttpError(400, 'invalid_image');
    }
    const venueId = req.actor!.venueId;
    await db.tx(async (t) => {
      // Trava a linha do bar: duas fotos enviadas juntas não passam do limite.
      await t.query('select id from venues where id = $1 for update', [venueId]);
      const { rows } = await t.query<{ n: number; next: number }>(
        'select count(*)::int as n, coalesce(max(position), 0)::int + 1 as next from menu_files where venue_id = $1',
        [venueId],
      );
      if (rows[0].n >= MENU_LIMITS.maxFiles) throw new HttpError(409, 'menu_full');
      await t.query('insert into menu_files (venue_id, content_type, data, size, position) values ($1, $2, $3, $4, $5)', [
        venueId,
        body.contentType,
        bytes,
        bytes.length,
        rows[0].next,
      ]);
    });
    res.status(201).json(await q.getMenu(db, venueId));
  });

  r.delete('/manager/menu/files/:id', auth.requireManager, async (req, res) => {
    const { rows } = await db.query('delete from menu_files where id = $1 and venue_id = $2 returning id', [
      uuid.parse(req.params.id),
      req.actor!.venueId,
    ]);
    if (!rows[0]) throw new HttpError(404, 'not_found');
    res.json(await q.getMenu(db, req.actor!.venueId));
  });

  // ------------------------------------------------------------------ Wi-Fi do local
  // A senha é do bar (aparece na página do QR dele); nunca vai para log nem notificação.

  r.get('/manager/wifi', auth.requireManager, async (req, res) => {
    res.json(await q.getWifi(db, req.actor!.venueId));
  });

  r.put('/manager/wifi', auth.requireManager, async (req, res) => {
    const noControl = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);
    const body = z
      .object({
        wifi: z
          .object({
            ssid: z.string().trim().min(1).max(WIFI_LIMITS.maxSsid).refine(noControl),
            password: z.union([z.string().min(1).max(WIFI_LIMITS.maxPassword).refine(noControl), z.literal(''), z.null()]),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .parse(req.body);
    await db.query('update venues set wifi_ssid = $1, wifi_password = $2 where id = $3', [
      body.wifi?.ssid ?? null,
      body.wifi?.password || null,
      req.actor!.venueId,
    ]);
    res.json(await q.getWifi(db, req.actor!.venueId));
  });

  // Público: a página de ajuda mostra as fotos do cardápio. O id é aleatório e o
  // conteúdo nunca muda (trocar = apagar e enviar outra), então pode ficar em cache.
  r.get('/menu-files/:id', async (req, res) => {
    const id = uuid.safeParse(req.params.id);
    if (!id.success) throw new HttpError(404, 'not_found');
    const { rows } = await db.query<{ content_type: string; data: Uint8Array }>('select content_type, data from menu_files where id = $1', [id.data]);
    if (!rows[0]) throw new HttpError(404, 'not_found');
    res.setHeader('Content-Type', rows[0].content_type);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Disposition', 'inline');
    res.end(Buffer.from(rows[0].data));
  });

  return r;
}
