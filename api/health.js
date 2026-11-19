// Diaqnostika: serverin hansı ayarları gördüyünü göstərir (gizli dəyərləri yox).
export default function handler(req, res) {
  const names = Object.keys(process.env).filter(n => /fire|service|account|google|cred|auth_|firestore/i.test(n));
  let sa = 'yoxdur';
  const k = Object.keys(process.env).find(n => /^\s*(firebase_service_account(_json|_key)?|google_application_credentials_json|service_account(_json)?)\s*$/i.test(n));
  if (k) {
    try { const raw = String(process.env[k]).trim(); const j = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); sa = `var (${k}) — layihə: ${j.project_id}, email: ${j.client_email}, açar: ${j.private_key ? 'var' : 'YOXDUR'}`; }
    catch { sa = `var (${k}), amma JSON oxunmur`; }
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ vercel_env: process.env.VERCEL_ENV || null, branch: process.env.VERCEL_GIT_COMMIT_REF || null, commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null, service_account: sa, similar_env_names: names }, null, 2));
}
