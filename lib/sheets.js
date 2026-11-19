// Google Sheets API (service account) — Apps Script-siz, birbaşa və sürətli.
// Mühit dəyişənləri:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID
// Vərəqlər (yoxdursa avtomatik yaradılır): Tasks, Employees, Log, Settings.
// Başlıq sətri açar adlarıdır; sütunların yeri dəyişə bilər, əlavə sütunlar toxunulmaz qalır.

export const SCHEMA = {
  Tasks: ['id', 'company', 'process', 'category', 'task', 'description', 'owner_before', 'owner_after',
    'min_per_key', 'annual_freq', 'unit', 'hours', 'after_opt', 'is_cancelled', 'updated_at', 'updated_by'],
  Employees: ['name', 'company', 'activity', 'fte', 'is_group', 'active'],
  Log: ['ts', 'user', 'action', 'task_id', 'task_label', 'from', 'to', 'comment'],
  Settings: ['key', 'value'],
};
const KEY_COL = { Tasks: 'id', Employees: 'name', Settings: 'key' };
const BOOL = new Set(['is_cancelled', 'is_group', 'active']);
const NUM = new Set(['min_per_key', 'annual_freq', 'hours', 'after_opt', 'fte']);
const API = process.env.SHEETS_API_BASE || 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';

/* ---------- OAuth token (JWT, RS256) — funksiya isti qaldıqca keşlənir ---------- */
let tokenCache = { value: null, exp: 0 };
const b64url = (input) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function accessToken() {
  if (process.env.SHEETS_FAKE_TOKEN) return process.env.SHEETS_FAKE_TOKEN; // yalnız lokal test üçün
  if (tokenCache.value && tokenCache.exp > Date.now() + 60e3) return tokenCache.value;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const pem = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !pem.includes('PRIVATE KEY')) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY təyin edilməyib');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: TOKEN_URL, iat: now, exp: now + 3600,
  }))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('Google token xətası: ' + (j.error_description || j.error || res.status));
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

async function gapi(path, { method = 'GET', body, query } = {}) {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) throw new Error('SHEET_ID təyin edilməyib');
  const url = new URL(`${API}/${sheetId}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) [].concat(v).forEach(x => url.searchParams.append(k, x));
  const res = await fetch(url, {
    method, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j.error?.message || res.statusText;
    if (res.status === 403 || res.status === 404) throw new Error(`Sheet-ə giriş yoxdur (${res.status}): ${msg}. Sheet-i service account email-i ilə "Editor" kimi paylaşın və SHEET_ID-ni yoxlayın.`);
    throw new Error(`Google Sheets xətası (${res.status}): ${msg}`);
  }
  return j;
}

/* ---------- Vərəq metadata (sheetId-lər) ---------- */
let metaCache = { value: null, at: 0 };
async function ensureSheets() {
  if (metaCache.value && Date.now() - metaCache.at < 10 * 60e3) return metaCache.value;
  const j = await gapi('', { query: { fields: 'sheets.properties(sheetId,title)' } });
  const ids = Object.fromEntries((j.sheets || []).map(s => [s.properties.title, s.properties.sheetId]));
  const missing = Object.keys(SCHEMA).filter(t => ids[t] === undefined);
  if (missing.length) {
    const r = await gapi(':batchUpdate', { method: 'POST', body: { requests: missing.map(title => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) } });
    r.replies.forEach((rep, i) => { ids[missing[i]] = rep.addSheet.properties.sheetId; });
    await gapi('/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'RAW', data: missing.map(t => ({ range: `${t}!A1`, values: [SCHEMA[t]] })) } });
  }
  metaCache = { value: ids, at: Date.now() };
  return ids;
}

/* ---------- Oxuma ---------- */
function toObjects(values, table) {
  const [head = [], ...rows] = values || [];
  const keys = head.map(h => String(h).trim());
  const out = [];
  rows.forEach((r, i) => {
    if (!r || r.every(v => v === '' || v == null)) return;
    const o = { _row: i + 2 };
    keys.forEach((k, j) => {
      if (!k) return;
      let v = r[j];
      if (BOOL.has(k)) v = v === true || /^(true|bəli|1)$/i.test(String(v ?? '').trim());
      else if (NUM.has(k)) v = v === '' || v == null ? null : Number(String(v).replace(',', '.'));
      else v = v == null ? '' : String(v);
      o[k] = v;
    });
    out.push(o);
  });
  return { keys, rows: out, raw: values || [] };
}

async function readTables(tables) {
  await ensureSheets();
  const j = await gapi('/values:batchGet', { query: { ranges: tables, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' } });
  const out = {};
  tables.forEach((t, i) => { out[t] = toObjects(j.valueRanges[i]?.values, t); });
  return out;
}

const strip = (o) => { const { _row, ...rest } = o; return rest; };

export async function readAll() {
  const t = await readTables(['Tasks', 'Employees', 'Log', 'Settings']);
  const settings = {};
  t.Settings.rows.forEach(r => { if (r.key) settings[r.key] = r.value; });
  return {
    tasks: t.Tasks.rows.filter(r => r.id).map(strip),
    employees: t.Employees.rows.filter(r => r.name).map(strip),
    log: t.Log.rows.slice(-3000).map(strip),
    settings,
  };
}

/* ---------- Yazma ---------- */
function cell(key, v) {
  if (v === null || v === undefined || v === '') return {};
  if (BOOL.has(key)) return { userEnteredValue: { boolValue: v === true || v === 'true' } };
  if (NUM.has(key) && isFinite(Number(v))) return { userEnteredValue: { numberValue: Number(v) } };
  if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
  return { userEnteredValue: { stringValue: String(v) } };
}
function rawCell(v) {
  if (v === null || v === undefined || v === '') return {};
  if (typeof v === 'boolean') return { userEnteredValue: { boolValue: v } };
  if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
  return { userEnteredValue: { stringValue: String(v) } };
}

// Başlıqda olmayan sxem sütunlarını sona əlavə edir
function headerFix(table, keys, sheetId, requests) {
  const missing = SCHEMA[table].filter(k => !keys.includes(k));
  if (!missing.length) return keys;
  const start = keys.length;
  requests.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: start, endColumnIndex: start + missing.length }, rows: [{ values: missing.map(k => rawCell(k)) }], fields: 'userEnteredValue' } });
  return keys.concat(missing);
}

/**
 * ops: [{ t:'upsert', table:'Tasks'|'Employees'|'Settings', row }, { t:'delete', table, key }, { t:'log', row }]
 * Hamısı bir atomik spreadsheets.batchUpdate çağırışı ilə yazılır.
 */
export async function applyOps(ops, user) {
  const ids = await ensureSheets();
  const tables = ['Tasks', 'Employees', 'Settings', 'Log'];
  const cur = await readTables(tables.filter(t => t !== 'Log').concat(['Log!1:1']));
  cur.Log = cur['Log!1:1'];
  const requests = [];
  const deletes = [];
  const keysOf = {};
  for (const t of tables) keysOf[t] = headerFix(t, cur[t].keys.length ? cur[t].keys : [], ids[t], requests);
  // boş vərəqdə başlıq yoxdursa, headerFix A1-dən yazır
  const index = {};
  for (const t of ['Tasks', 'Employees', 'Settings']) {
    index[t] = new Map(cur[t].rows.map(r => [String(r[KEY_COL[t]]), r._row]));
  }
  const appends = { Tasks: [], Employees: [], Settings: [], Log: [] };
  const now = new Date().toISOString();

  for (const op of ops) {
    const t = op.table;
    if (op.t === 'log') {
      const row = { ...op.row, user, ts: op.row.ts || now };
      appends.Log.push(keysOf.Log.map(k => SCHEMA.Log.includes(k) ? cell(k, row[k]) : {}));
      continue;
    }
    if (!['Tasks', 'Employees', 'Settings'].includes(t)) continue;
    const keys = keysOf[t];
    if (op.t === 'upsert') {
      const row = t === 'Tasks' ? { ...op.row, updated_by: user, updated_at: op.row.updated_at || now } : op.row;
      const k = String(row[KEY_COL[t]] ?? '');
      if (!k) continue;
      const rowNo = index[t].get(k);
      if (rowNo) {
        const existing = cur[t].raw[rowNo - 1] || [];
        const values = keys.map((key, j) => SCHEMA[t].includes(key) ? cell(key, row[key]) : rawCell(existing[j]));
        requests.push({ updateCells: { range: { sheetId: ids[t], startRowIndex: rowNo - 1, endRowIndex: rowNo, startColumnIndex: 0, endColumnIndex: keys.length }, rows: [{ values }], fields: 'userEnteredValue' } });
      } else {
        appends[t].push(keys.map(key => SCHEMA[t].includes(key) ? cell(key, row[key]) : {}));
        index[t].set(k, -1); // eyni partiyada təkrar əlavə olunmasın
      }
    } else if (op.t === 'delete') {
      const rowNo = index[t].get(String(op.key));
      if (rowNo > 0) { deletes.push({ sheetId: ids[t], rowNo }); index[t].delete(String(op.key)); }
    }
  }
  for (const [t, rows] of Object.entries(appends)) {
    if (rows.length) requests.push({ appendCells: { sheetId: ids[t], rows: rows.map(values => ({ values })), fields: 'userEnteredValue' } });
  }
  // Silmələr ən sonda, aşağıdan yuxarıya — sətir nömrələri sürüşməsin
  deletes.sort((a, b) => b.rowNo - a.rowNo).forEach(d => requests.push({ deleteDimension: { range: { sheetId: d.sheetId, dimension: 'ROWS', startIndex: d.rowNo - 1, endIndex: d.rowNo } } }));
  if (requests.length) await gapi(':batchUpdate', { method: 'POST', body: { requests } });
  return { applied: ops.length };
}

/** Tapşırıq və əməkdaş vərəqlərini tamamilə əvəz edir (import "əvəz et", ilkin yükləmə). */
export async function replaceAll({ tasks, employees }, user) {
  await ensureSheets();
  const now = new Date().toISOString();
  const rows = (t, list) => [SCHEMA[t]].concat(list.map(r => SCHEMA[t].map(k => {
    const v = t === 'Tasks' && k === 'updated_by' ? (r[k] || user) : t === 'Tasks' && k === 'updated_at' ? (r[k] || now) : r[k];
    return v === null || v === undefined ? '' : v;
  })));
  await gapi('/values:batchClear', { method: 'POST', body: { ranges: ['Tasks', 'Employees'] } });
  await gapi('/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'RAW', data: [
    { range: 'Tasks!A1', values: rows('Tasks', tasks || []) },
    { range: 'Employees!A1', values: rows('Employees', employees || []) },
  ] } });
}

export async function isEmpty() {
  const t = await readTables(['Tasks']);
  return !t.Tasks.rows.some(r => r.id);
}
