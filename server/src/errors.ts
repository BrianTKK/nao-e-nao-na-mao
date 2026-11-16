import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/** Erro com status HTTP e um código que o cliente entende (os mesmos de DataErrorCode no shared). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** As exceções das funções do banco viram respostas HTTP. */
const DB_ERRORS: Record<string, number> = {
  spot_not_found: 404,
  alert_not_found: 404,
  rate_limited: 429,
  invalid_kind: 400,
  outcome_required: 400,
  invalid_transition: 409,
  already_taken: 409,
  not_staff: 403,
  not_manager: 403,
  staff_not_found: 404,
};

export function toHttpError(err: unknown): HttpError | null {
  if (err instanceof HttpError) return err;
  if (err instanceof ZodError) return new HttpError(400, 'bad_request');
  const message = err instanceof Error ? err.message : '';
  if (message in DB_ERRORS) return new HttpError(DB_ERRORS[message], message);
  // Violação de check do banco (ex.: desfecho que não existe) = entrada inválida.
  const code = (err as { code?: string })?.code;
  if (code === '23514' || code === '22P02') return new HttpError(400, 'bad_request');
  if (code === '23505') return new HttpError(409, 'conflict');
  return null;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const known = toHttpError(err);
  if (known) {
    res.status(known.status).json({ error: known.code });
    return;
  }
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 413 ? 'payload_too_large' : status === 400 ? 'bad_request' : 'internal_error' });
};
