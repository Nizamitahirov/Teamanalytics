import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import { readCookie, verifySession } from './auth.js';

// Vercel Node funksiyası req.body-ni artıq parse edə bilər; lokal mock serverdə axından oxuyuruq
export type Req = IncomingMessage & { body?: unknown };
export type Res = ServerResponse;
export type Handler = (req: Req, res: Res) => unknown | Promise<unknown>;

export function send(res: Res, status: number, obj: unknown, headers: Record<string, string> = {}): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

/** Xəta cavabı: `{ error: az mətn, code: maşın kodu }` (SPEC §4.4). */
export const sendError = (res: Res, status: number, code: string, error: string) => send(res, status, { error, code });

export async function requireUser(req: Req, res: Res): Promise<string | null> {
  const user = await verifySession(readCookie(req.headers.cookie)).catch(() => null);
  if (!user) {
    sendError(res, 401, 'unauthorized', 'Giriş tələb olunur');
    return null;
  }
  return user;
}

export async function body(req: Req): Promise<unknown> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

/** Gövdəni oxuyur və Zod sxemi ilə yoxlayır; yanlışdırsa 400 göndərib `null` qaytarır. */
export async function parseBody<S extends z.ZodType>(req: Req, res: Res, schema: S): Promise<z.infer<S> | null> {
  let raw: unknown;
  try {
    raw = await body(req);
  } catch {
    sendError(res, 400, 'invalid_json', 'Sorğunun gövdəsi düzgün JSON deyil');
    return null;
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path?.length ? ` (${first.path.join('.')})` : '';
    sendError(res, 400, 'invalid_body', `Yanlış sorğu${where}: ${first?.message ?? ''}`.trim());
    return null;
  }
  return r.data;
}

export const methodNotAllowed = (res: Res, expected: string) =>
  sendError(res, 405, 'method_not_allowed', `${expected} gözlənilir`);

export function fail(res: Res, e: unknown): void {
  console.error(e);
  sendError(res, 500, 'internal', e instanceof Error ? e.message : String(e));
}
