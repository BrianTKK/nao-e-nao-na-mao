import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';
import type { Config } from './config';
import type { Db } from './db';
import { HttpError } from './errors';

export interface Actor {
  id: string;
  venueId: string;
  role: 'staff' | 'manager';
}

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
  }
}

/** Hash usado para comparar quando o e-mail não existe: o tempo de resposta não entrega quem tem conta. */
const DUMMY_HASH = bcrypt.hashSync('nao-existe-esta-senha', 10);

export function createAuth(config: Config, db: Db) {
  const key = new TextEncoder().encode(config.jwtSecret);

  async function login(email: string, password: string): Promise<{ token: string; actor: Actor }> {
    const { rows } = await db.query<{ id: string; password_hash: string; venue_id: string | null; role: Actor['role'] | null; active: boolean | null }>(
      `select u.id, u.password_hash, s.venue_id, s.role, s.active
       from users u left join staff s on s.id = u.id
       where u.email = $1`,
      [email.trim().toLowerCase()],
    );
    const row = rows[0];
    const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok || !row.venue_id || !row.active || !row.role) throw new HttpError(401, 'invalid_credentials');
    const actor: Actor = { id: row.id, venueId: row.venue_id, role: row.role };
    const token = await new SignJWT({ venue: actor.venueId, role: actor.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(actor.id)
      .setIssuedAt()
      .setExpirationTime(`${config.SESSION_HOURS}h`)
      .sign(key);
    return { token, actor };
  }

  /**
   * Confere o token e, a cada uso, se a pessoa continua ativa no mesmo bar
   * (quem for desativada perde o acesso na hora, sem esperar o token vencer).
   */
  async function verify(token: string | undefined): Promise<Actor> {
    if (!token) throw new HttpError(401, 'unauthorized');
    let sub: string | undefined;
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
      sub = payload.sub;
    } catch {
      throw new HttpError(401, 'unauthorized');
    }
    const { rows } = await db.query<{ venue_id: string; role: Actor['role'] }>(
      'select venue_id, role from staff where id = $1 and active',
      [sub],
    );
    if (!rows[0]) throw new HttpError(401, 'unauthorized');
    return { id: sub!, venueId: rows[0].venue_id, role: rows[0].role };
  }

  const bearer = (req: Request) => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  };

  const requireStaff = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.actor = await verify(bearer(req));
      next();
    } catch (err) {
      next(err);
    }
  };

  const requireManager = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.actor = await verify(bearer(req));
      if (req.actor.role !== 'manager') throw new HttpError(403, 'forbidden');
      next();
    } catch (err) {
      next(err);
    }
  };

  return { login, verify, requireStaff, requireManager };
}

export type Auth = ReturnType<typeof createAuth>;

/** Mesmo hash da função hash_token do banco (sha256 em hexadecimal). */
export const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
