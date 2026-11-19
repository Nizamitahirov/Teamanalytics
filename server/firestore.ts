// Firestore (Firebase) — REST API ilə, yalnız serverdən. Brauzer Firestore-a birbaşa qoşulmur,
// ona görə Firestore qaydaları "hamıya bağlı" qala bilər və Firebase Auth lazım deyil.
//
// Mühit dəyişəni:
//   FIREBASE_SERVICE_ACCOUNT  = Firebase-dən yüklənən service account JSON faylının bütün məzmunu
//   FIRESTORE_DATABASE        = (istəyə bağlı) verilənlər bazasının ID-si, susmaya görə "(default)"
//   FIRESTORE_API_BASE, FIRESTORE_FAKE_TOKEN — yalnız lokal mock/test üçün
//
// Kolleksiyalar: tasks/{id}, employees/{ad}, log/{id}, meta/main (son dəyişiklik vaxtı + ayarlar), users/{id}
// Hər yazılan sənədə _ts = server vaxtı qoyulur; brauzer yalnız son yoxlamadan sonra dəyişənləri soruşur.
// Silinən sənədlər _deleted=true kimi saxlanır ki, digər istifadəçilərə silinmə xəbəri çatsın.
//
// v2 dəyişikliyi (SPEC §15.3): upsert artıq sənədi tam əvəz etmir — `updateMask` ilə yalnız göndərilən
// sahələr yazılır. Firestore-da v1 klientinin bilmədiyi sahələr (v2 sahələri, konsolda əlavə olunanlar) qorunur.
import { SETTINGS_KEYS, type Op } from '../shared/schema.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const apiRoot = () => process.env.FIRESTORE_API_BASE || 'https://firestore.googleapis.com/v1';
const COLL = { Tasks: 'tasks', Employees: 'employees' } as const;
const MAX_WRITES = 450; // Firestore bir commit-də ən çox 500 yazma qəbul edir

export type Scalar = string | number | boolean | null;
export type Doc = Record<string, Scalar> & { _id: string };
type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string };
type FsFields = Record<string, FsValue>;
type FsDocument = { name: string; fields?: FsFields };
export type FsWrite =
  | {
      update: { name: string; fields: FsFields };
      updateMask?: { fieldPaths: string[] };
      updateTransforms?: { fieldPath: string; setToServerValue: 'REQUEST_TIME' }[];
    }
  | { delete: string };

/* ---------- konfiqurasiya ---------- */
// Adda kiçik fərqlər (boşluq, kiçik hərf, alternativ adlar) bağışlanır
export const SA_NAME_RE =
  /^\s*(firebase_service_account(_json|_key)?|google_application_credentials_json|service_account(_json)?)\s*$/i;
function findServiceAccountVar(): string | null {
  const k = Object.keys(process.env).find((n) => SA_NAME_RE.test(n) && String(process.env[n] || '').trim());
  return k ? (process.env[k] as string) : null;
}
export function parseServiceAccount(raw: string): Record<string, string> {
  let s = String(raw).trim();
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  if (!s.startsWith('{')) s = Buffer.from(s, 'base64').toString('utf8'); // base64 kimi yapışdırılıbsa
  return JSON.parse(s);
}
// Serverin gördüyü vəziyyəti izah edir (dəyərləri yox, yalnız adları)
export function envHelp(): string {
  const similar = Object.keys(process.env).filter((n) => /fire|service|account|google|cred/i.test(n));
  const env = process.env;
  const where = env.VERCEL_ENV
    ? `Bu deploy mühiti: ${env.VERCEL_ENV}${env.VERCEL_GIT_COMMIT_REF ? ` (branch: ${env.VERCEL_GIT_COMMIT_REF})` : ''}.`
    : '';
  return (
    `FIREBASE_SERVICE_ACCOUNT mühit dəyişəni bu deploy-da görünmür. ${where} ` +
    (similar.length ? `Oxşar adlı dəyişənlər: ${similar.join(', ')}. ` : 'Oxşar adlı dəyişən də yoxdur. ') +
    `Vercel → Settings → Environment Variables-da dəyişənin "${env.VERCEL_ENV || 'Production'}" mühiti üçün seçildiyini yoxlayın və saxladıqdan SONRA Redeploy edin.`
  );
}
type ServiceAccount = { email: string; key: string; project: string };
let saCache: ServiceAccount | null = null;
function serviceAccount(): ServiceAccount {
  if (saCache) return saCache;
  const raw = findServiceAccountVar();
  if (!raw) throw new Error(envHelp());
  let j: Record<string, string>;
  try {
    j = parseServiceAccount(raw);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT tapıldı, amma düzgün JSON deyil — faylın bütün məzmununu { ilə } daxil olmaqla yapışdırın',
    );
  }
  if (!j.client_email || !j.private_key || !j.project_id)
    throw new Error('FIREBASE_SERVICE_ACCOUNT-da client_email / private_key / project_id yoxdur');
  saCache = { email: j.client_email, key: j.private_key.replace(/\\n/g, '\n'), project: j.project_id };
  return saCache;
}
/** Yalnız testlər üçün: mühit dəyişənləri dəyişəndə keşi sıfırlayır. */
export function _resetCaches(): void {
  saCache = null;
  tokenCache = { value: null, exp: 0 };
}
const dbPath = () => `projects/${serviceAccount().project}/databases/${process.env.FIRESTORE_DATABASE || '(default)'}`;
const docsRoot = () => `${dbPath()}/documents`;
export const docName = (coll: string, id: string) => `${docsRoot()}/${coll}/${id}`;

/* ---------- OAuth token (JWT RS256), funksiya isti qaldıqca keşlənir ---------- */
let tokenCache: { value: string | null; exp: number } = { value: null, exp: 0 };
const b64url = (input: string | ArrayBuffer) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function accessToken(): Promise<string> {
  if (process.env.FIRESTORE_FAKE_TOKEN) return process.env.FIRESTORE_FAKE_TOKEN; // yalnız lokal test
  if (tokenCache.value && tokenCache.exp > Date.now() + 60e3) return tokenCache.value;
  const sa = serviceAccount();
  const der = Uint8Array.from(atob(sa.key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({
      iss: sa.email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error('Google token xətası: ' + (j.error_description || j.error || res.status));
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

type FsOpts = { method?: string; body?: unknown; query?: Record<string, string | number | undefined>; allow404?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore REST cavabları müxtəlif formadadır
async function fs(path: string, { method = 'GET', body, query, allow404 = false }: FsOpts = {}): Promise<any> {
  const url = new URL(`${apiRoot()}/${path}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && res.status === 404) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (Array.isArray(j) ? j[0]?.error?.message : j.error?.message) || res.statusText;
    if (res.status === 403) throw new Error(`Firestore-a giriş yoxdur: ${msg}`);
    if (res.status === 404)
      throw new Error(
        `Firestore verilənlər bazası tapılmadı (${dbPath()}). Firebase-də Firestore Database yaradıldığını və FIRESTORE_DATABASE-i yoxlayın. ${msg}`,
      );
    throw new Error(`Firestore xətası (${res.status}): ${msg}`);
  }
  return j;
}

/* ---------- dəyər çevirmə ---------- */
export function toValue(v: unknown): FsValue {
  if (v === null || v === undefined || v === '') return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}
export function fromValue(v: FsValue | undefined): Scalar {
  if (!v || 'nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}
export const toFields = (o: Record<string, unknown>): FsFields =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => [k, toValue(v)]),
  );
function fromDoc(d: FsDocument): Doc {
  const o: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(d.fields || {})) o[k] = fromValue(v);
  return { ...o, _id: d.name.split('/').pop() as string };
}

/* ---------- oxuma ---------- */
async function listAll(coll: string): Promise<Doc[]> {
  const out: Doc[] = [];
  let pageToken: string | undefined;
  do {
    const j = await fs(`${docsRoot()}/${coll}`, { query: { pageSize: 1000, pageToken } });
    ((j.documents || []) as FsDocument[]).forEach((d) => out.push(fromDoc(d)));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}
async function query(coll: string, { since, orderDesc, limit }: { since?: string; orderDesc?: boolean; limit?: number } = {}) {
  const sq: Record<string, unknown> = { from: [{ collectionId: coll }] };
  if (since) sq.where = { fieldFilter: { field: { fieldPath: '_ts' }, op: 'GREATER_THAN', value: { timestampValue: since } } };
  if (orderDesc || since) sq.orderBy = [{ field: { fieldPath: '_ts' }, direction: orderDesc ? 'DESCENDING' : 'ASCENDING' }];
  if (limit) sq.limit = limit;
  const j = (await fs(`${docsRoot()}:runQuery`, { method: 'POST', body: { structuredQuery: sq } })) as {
    document?: FsDocument;
  }[];
  return (j || []).filter((r) => r.document).map((r) => fromDoc(r.document as FsDocument));
}
export async function getMeta(): Promise<Doc | null> {
  const d = await fs(`${docsRoot()}/meta/main`, { allow404: true });
  return d ? fromDoc(d) : null;
}
const clean = (o: Doc) => {
  const { _id, _ts, _deleted, ...rest } = o;
  void _id;
  void _ts;
  void _deleted;
  return rest;
};
export const settingsOf = (meta: Doc | null): Record<string, Scalar> =>
  Object.fromEntries(SETTINGS_KEYS.filter((k) => meta && meta[k] != null).map((k) => [k, (meta as Doc)[k]]));
const logRow = (o: Doc) => ({ id: o._id, ...clean(o) });

export type DataResponse =
  | { unchanged: true; ts: Scalar; settings: Record<string, Scalar> }
  | {
      delta?: true;
      full?: true;
      ts: Scalar;
      settings: Record<string, Scalar>;
      tasks: Record<string, Scalar>[];
      employees: Record<string, Scalar>[];
      log: Record<string, Scalar>[];
    };

/** Tam yükləmə və ya `since`-dən sonrakı dəyişikliklər. */
export async function readData(since: string | null): Promise<DataResponse> {
  const meta = await getMeta();
  const ts = meta ? meta.updated : null;
  if (since && ts && since === ts) return { unchanged: true, ts, settings: settingsOf(meta) };
  if (since && ts) {
    const [tasks, employees, log] = await Promise.all([
      query('tasks', { since }),
      query('employees', { since }),
      query('log', { since, limit: 500 }),
    ]);
    return {
      delta: true,
      ts,
      settings: settingsOf(meta),
      tasks: tasks.map((t) => ({ ...clean(t), id: t.id || t._id, _deleted: !!t._deleted })),
      employees: employees.map((e) => ({ ...clean(e), name: e.name || e._id, _deleted: !!e._deleted })),
      log: log.map(logRow),
    };
  }
  const [tasks, employees, log] = await Promise.all([
    listAll('tasks'),
    listAll('employees'),
    query('log', { orderDesc: true, limit: 300 }),
  ]);
  return {
    full: true,
    ts,
    settings: settingsOf(meta),
    tasks: tasks.filter((t) => !t._deleted).map((t) => ({ ...clean(t), id: t.id || t._id })),
    employees: employees.filter((e) => !e._deleted).map((e) => ({ ...clean(e), name: e.name || e._id })),
    log: log.reverse().map(logRow),
  };
}

export async function readFullLog() {
  const log = await listAll('log');
  return log.sort((a, b) => String(a.ts).localeCompare(String(b.ts))).map(logRow);
}

/* ---------- yazma ---------- */
const stamp = [{ fieldPath: '_ts', setToServerValue: 'REQUEST_TIME' as const }];
function metaWrite(settings: Record<string, number> = {}): FsWrite {
  const fields = Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, toValue(v)]));
  return {
    update: { name: docName('meta', 'main'), fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: [{ fieldPath: 'updated', setToServerValue: 'REQUEST_TIME' }],
  };
}
/** Sahə adını Firestore field path kimi təhlükəsiz yazır (sadə adlar olduğu kimi, qalanları `backtick`-lə). */
const fieldPath = (k: string) => (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : '`' + k.replace(/[`\\]/g, '\\$&') + '`');

/**
 * Upsert yazısı: yalnız göndərilən sahələr (+ `_deleted=false`) yazılır, qalan sahələr toxunulmaz qalır.
 * Sənəd yoxdursa yaradılır (updateMask mövcud olmayan sənəd üçün də işləyir).
 */
export function upsertWrite(coll: string, key: string, row: Record<string, unknown>): FsWrite {
  const fields: FsFields = { ...toFields(row), _deleted: { booleanValue: false } };
  return {
    update: { name: docName(coll, key), fields },
    updateMask: { fieldPaths: Object.keys(fields).map(fieldPath) },
    updateTransforms: stamp,
  };
}

async function commit(writes: FsWrite[]): Promise<void> {
  const metaName = docName('meta', 'main');
  // Böyük partiyaları hissələrə bölür; hər hissənin sonunda meta.updated yenilənir
  for (let i = 0; i < writes.length; i += MAX_WRITES) {
    const chunk = writes.slice(i, i + MAX_WRITES);
    if (!chunk.some((w) => 'update' in w && w.update.name === metaName)) chunk.push(metaWrite());
    await fs(`${docsRoot()}:commit`, { method: 'POST', body: { writes: chunk } });
  }
}

/** Op-ları Firestore yazılarına çevirir (saf funksiya — testlənir). */
export function buildWrites(ops: Op[], user: string, now = new Date().toISOString()): FsWrite[] {
  const writes: FsWrite[] = [];
  const settings: Record<string, number> = {};
  for (const op of ops) {
    if (op.t === 'log') {
      const id = String(op.row.id || crypto.randomUUID()).replace(/\//g, '_');
      const row: Record<string, unknown> = { ...op.row, user, ts: op.row.ts || now };
      delete row.id;
      writes.push({ update: { name: docName('log', id), fields: toFields(row) }, updateTransforms: stamp });
      continue;
    }
    if (op.table === 'Settings') {
      if (op.t === 'upsert') {
        const n = Number(op.row.value);
        if (Number.isFinite(n)) settings[op.row.key] = n;
      }
      continue;
    }
    const coll = COLL[op.table];
    if (op.t === 'delete') {
      writes.push({
        update: { name: docName(coll, op.key.trim()), fields: { _deleted: { booleanValue: true } } },
        updateMask: { fieldPaths: ['_deleted'] },
        updateTransforms: stamp,
      });
      continue;
    }
    const key = String(op.table === 'Tasks' ? op.row.id : op.row.name).trim();
    const row = op.table === 'Tasks' ? { ...op.row, updated_by: user, updated_at: op.row.updated_at || now } : { ...op.row };
    writes.push(upsertWrite(coll, key, row));
  }
  if (!writes.length && !Object.keys(settings).length) return [];
  writes.push(metaWrite(settings));
  return writes;
}

/**
 * ops: { t:'upsert', table:'Tasks'|'Employees'|'Settings', row } | { t:'delete', table, key } | { t:'log', row }
 * (Zod ilə yoxlanmış — shared/schema.ts → OpSchema)
 */
export async function applyOps(ops: Op[], user: string): Promise<void> {
  const writes = buildWrites(ops, user);
  if (writes.length) await commit(writes);
}

/** Baza boşdursa ilkin məlumatları yazır. */
export async function seed(
  { tasks, employees }: { tasks: Record<string, Scalar>[]; employees: Record<string, Scalar>[] },
  user: string,
): Promise<boolean> {
  const j = await fs(`${docsRoot()}/tasks`, { query: { pageSize: 1 } });
  if ((j.documents || []).length) return false;
  const ops = [
    ...tasks.map((row) => ({ t: 'upsert', table: 'Tasks', row })),
    ...employees.map((row) => ({ t: 'upsert', table: 'Employees', row })),
    {
      t: 'log',
      row: { action: 'Import', task_label: `İlkin məlumatlar: ${tasks.length} tapşırıq, ${employees.length} əməkdaş` },
    },
  ] as Op[];
  await applyOps(ops, user);
  return true;
}

/* ---------- istifadəçilər (giriş) — məlumat sinxronuna daxil deyil ---------- */
export const privateKeyMaterial = () => serviceAccount().key;

export async function getUser(id: string): Promise<Doc | null> {
  const d = await fs(`${docsRoot()}/users/${encodeURIComponent(id)}`, { allow404: true });
  return d ? fromDoc(d) : null;
}
export async function countUsers(): Promise<number> {
  const j = await fs(`${docsRoot()}/users`, { query: { pageSize: 1 } });
  return (j.documents || []).length;
}
export async function listUsers() {
  return (await listAll('users')).map((u) => ({
    id: u._id,
    name: (u.name as string) || u._id,
    active: u.active !== false,
    created_by: (u.created_by as string) || '',
  }));
}
/** İstifadəçi sənədini yazır. Yalnız verilən sahələr yazılır (məs. gələcək `role` sahəsi qorunur). */
export async function putUser(id: string, data: Record<string, unknown>): Promise<void> {
  const fields = toFields(data);
  await fs(`${docsRoot()}:commit`, {
    method: 'POST',
    body: {
      writes: [
        { update: { name: docName('users', id), fields }, updateMask: { fieldPaths: Object.keys(fields).map(fieldPath) } },
      ],
    },
  });
}
export async function deleteUser(id: string): Promise<void> {
  await fs(`${docsRoot()}:commit`, { method: 'POST', body: { writes: [{ delete: docName('users', id) }] } });
}
