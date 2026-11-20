import { SA_NAME_RE, parseServiceAccount, getMeta, listAll, plainWrite, commitRaw } from '../server/firestore.js';
import { send, sendError, requireUser, parseBody, fail, type Req, type Res } from '../server/http.js';
import { APP_VERSION } from '../shared/version.js';
import { z } from 'zod';

// GET  /api/health — diaqnostika (auth tələb etmir; gizli dəyər yoxdur): versiya, commit, Firestore vəziyyəti,
//      son snapshot/backup (SPEC §14). Firestore yoxlaması instansiyada 60 s keşlənir (oxuma büdcəsi).
// GET  /api/health?errors=1 — son klient xətaları (admin)
// POST /api/health { message, stack?, url? } — klient xətası (SPEC §14: `errors` kolleksiyası, 30 gün; daxil olmuş istifadəçi,
//      istifadəçi başına saatda ≤ 20). Ayrıca endpoint yoxdur — Vercel pulsuz planında funksiya sayı ≤ 12.
let cache: { t: number; v: Record<string, unknown> } | null = null;
const reports = new Map<string, { n: number; t: number }>();

const ErrorBody = z.object({
  message: z.string().max(2000),
  stack: z.string().max(4000).optional(),
  url: z.string().max(500).optional(),
  version: z.string().max(40).optional(),
});

export default async function handler(req: Req, res: Res) {
  if (req.method === 'POST') {
    const me = await requireUser(req, res);
    if (!me) return;
    const b = await parseBody(req, res, ErrorBody);
    if (!b) return;
    const now = Date.now();
    const r = reports.get(me.id);
    if (r && now - r.t < 3600e3 && r.n >= 20) return send(res, 200, { ok: true, dropped: true });
    reports.set(me.id, r && now - r.t < 3600e3 ? { n: r.n + 1, t: r.t } : { n: 1, t: now });
    try {
      const id = 'E-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      await commitRaw([
        plainWrite('errors', id, {
          ts: new Date(now).toISOString(),
          user: me.name,
          message: b.message,
          stack: b.stack ?? '',
          url: b.url ?? '',
          version: b.version ?? '',
          ua: String(req.headers['user-agent'] ?? '').slice(0, 300),
        }),
      ]);
      return send(res, 200, { ok: true });
    } catch (e) {
      return fail(res, e);
    }
  }
  if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET və ya POST gözlənilir');
  const q = new URL(req.url || '/', 'http://x').searchParams;
  if (q.has('errors')) {
    const me = await requireUser(req, res, 'admin');
    if (!me) return;
    try {
      const list = (await listAll('errors'))
        .map(({ _id, ...rest }) => ({ ...rest, id: _id }) as Record<string, unknown>)
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
        .slice(0, 50);
      return send(res, 200, { errors: list });
    } catch (e) {
      return fail(res, e);
    }
  }

  const env = process.env;
  const names = Object.keys(env).filter((n) => /fire|service|account|google|cred|auth_|firestore/i.test(n));
  let sa = 'yoxdur';
  const k = Object.keys(env).find((n) => SA_NAME_RE.test(n));
  if (k) {
    try {
      const j = parseServiceAccount(String(env[k]));
      sa = `var (${k}) — layihə: ${j.project_id}, email: ${j.client_email}, açar: ${j.private_key ? 'var' : 'YOXDUR'}`;
    } catch {
      sa = `var (${k}), amma JSON oxunmur`;
    }
  }
  if (!cache || Date.now() - cache.t > 60_000) {
    try {
      const meta = await getMeta();
      cache = {
        t: Date.now(),
        v: {
          firestore: 'ok',
          lastSnapshot: (meta?.last_snapshot as string) || null,
          lastBackup: (meta?.last_backup as string) || null,
          lastUpdate: (meta?.updated as string) || null,
        },
      };
    } catch (e) {
      cache = { t: Date.now(), v: { firestore: 'error', firestore_error: e instanceof Error ? e.message : String(e) } };
    }
  }
  send(res, 200, {
    version: APP_VERSION,
    vercel_env: env.VERCEL_ENV || null,
    branch: env.VERCEL_GIT_COMMIT_REF || null,
    commit: (env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    cron_secret: env.CRON_SECRET ? 'var' : 'yoxdur',
    ...cache.v,
    service_account: sa,
    similar_env_names: names,
  });
}
