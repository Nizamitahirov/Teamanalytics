import { SA_NAME_RE, parseServiceAccount } from '../server/firestore.js';
import { send, type Req, type Res } from '../server/http.js';
import { APP_VERSION } from '../shared/version.js';

// Diaqnostika: serverin hansı ayarları gördüyünü göstərir (gizli dəyərləri yox). Auth tələb etmir.
export default function handler(_req: Req, res: Res) {
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
  send(res, 200, {
    version: APP_VERSION,
    vercel_env: env.VERCEL_ENV || null,
    branch: env.VERCEL_GIT_COMMIT_REF || null,
    commit: (env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    service_account: sa,
    similar_env_names: names,
  });
}
