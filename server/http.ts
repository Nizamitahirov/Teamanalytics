import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import { hasRole, ipHash, readSessionCookie, validateSession, type UserInfo } from './auth.js';
import type { Role } from '../shared/schema.js';

// Vercel Node funksiyası req.body-ni artıq parse edə bilər; lokal mock serverdə axından oxuyuruq
export type Req = IncomingMessage & { body?: unknown };
export type Res = ServerResponse;
export type Handler = (req: Req, res: Res) => unknown | Promise<unknown>;

export function send(res: Res, status: number, obj: unknown, headers: Record<string, string | string[]> = {}): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

/** Xəta cavabı: `{ error: az mətn, code: maşın kodu }` (SPEC §4.4). */
export const sendError = (res: Res, status: number, code: string, error: string) => send(res, status, { error, code });

/**
 * CSRF (SPEC §10): dəyişiklik edən sorğularda brauzerin `Sec-Fetch-Site` / `Origin` başlıqları başqa sayt göstərirsə rədd et.
 * Başlıqsız sorğular (brauzer olmayan klientlər — cookie-ni avtomatik göndərmirlər) buraxılır.
 */
export function csrfOk(req: Req): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const site = String(req.headers['sec-fetch-site'] ?? '');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '');
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/* ---------- sorğu limiti: istifadəçi başına 300/dəq (instansiya yaddaşında — SPEC §10) ---------- */
const RATE = 300;
const hits = new Map<string, { n: number; t: number }>();
function rateOk(key: string, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || now - h.t > 60_000) {
    hits.set(key, { n: 1, t: now });
    return true;
  }
  h.n++;
  return h.n <= RATE;
}
/** Yalnız testlər üçün. */
export const _resetRate = () => hits.clear();

export const clientIp = (req: Req) =>
  String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim() ||
  req.socket?.remoteAddress ||
  'x';
export const requestIpHash = (req: Req) => ipHash(clientIp(req));

/**
 * Sessiya + rol yoxlaması (RBAC serverdədir — klientdə gizlətmə yalnız UX-dir).
 * 401 — sessiya yoxdur/etibarsızdır; 403 — rol çatmır və ya CSRF; 429 — limit.
 */
export async function requireUser(req: Req, res: Res, min: Role = 'viewer'): Promise<UserInfo | null> {
  if (!csrfOk(req)) {
    sendError(res, 403, 'csrf', 'Sorğu başqa saytdan gəlib və rədd edildi');
    return null;
  }
  const user = await validateSession(readSessionCookie(req.headers.cookie)).catch(() => null);
  if (!user) {
    sendError(res, 401, 'unauthorized', 'Giriş tələb olunur');
    return null;
  }
  if (!rateOk(user.id)) {
    sendError(res, 429, 'rate_limited', 'Çox sayda sorğu. Bir dəqiqə sonra yenidən cəhd edin.');
    return null;
  }
  if (!hasRole(user.role, min)) {
    sendError(res, 403, 'forbidden', 'Bu əməliyyat üçün icazəniz yoxdur');
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
  if (e instanceof Error && (e as Error & { status?: number }).status === 413) return sendError(res, 413, 'too_large', e.message);
  console.error(e);
  sendError(res, 500, 'internal', e instanceof Error ? e.message : String(e));
}
