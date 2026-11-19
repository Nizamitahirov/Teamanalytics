/* Workforce Planning — Əmək Münasibətləri
 * Məlumat modeli:
 *   task: { id, company, process, category, task, description, owner_before, owner_after,
 *           min_per_key, annual_freq, unit, hours, after_opt, is_cancelled, updated_at }
 *   employee: { name, company, activity, fte, is_group, active }
 *   log: { ts, action, task_id, task_label, from, to, comment }
 * Cari icraçı = owner_after, boşdursa owner_before.
 */
(() => {
'use strict';

const ACT_PROJECT = 'Project and AdHoc based';
const ACT_ADMIN = 'Administrativ';
const STATUSES = ['Mövcud', 'Yeni', 'Transfer', 'Ləğv'];
const DEFAULT_SETTINGS = { norm: 1922, warn: 85 };

let state = null;          // { tasks, employees, log, settings, version }
let undoStack = [];
let selected = new Set();
let taskSort = { key: 'company', dir: 1 };
let charts = {};
let drawerEmp = null;

/* ---------------- utils ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (Number(n) || 0).toLocaleString('az-AZ', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtH = (n) => fmt(n, Math.abs(n) < 100 && n % 1 ? 1 : 0);
const pct = (n) => `${fmt(n * 100, 0)}%`;
const nowIso = () => new Date().toISOString();
const uid = () => 'T-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const num = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const sortAz = (a, b) => String(a).localeCompare(String(b), 'az');
const clone = (o) => JSON.parse(JSON.stringify(o));

function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); el.remove(); };
    el.appendChild(b);
  }
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  setTimeout(() => el.remove(), 6000);
}

/* ---------------- model helpers ---------------- */
const curOwner = (t) => (t.owner_after || t.owner_before || '').trim();
function statusOf(t) {
  if (t.is_cancelled) return 'Ləğv';
  if (!t.owner_before && t.owner_after) return 'Yeni';
  if (t.owner_after && t.owner_before && t.owner_after !== t.owner_before) return 'Transfer';
  return 'Mövcud';
}
const empByName = () => Object.fromEntries(state.employees.map(e => [e.name, e]));
function activityOf(name) { const e = state.employees.find(x => x.name === name); return e ? e.activity : ACT_ADMIN; }
const effHours = (t, useOpt) => (useOpt && t.after_opt != null && t.after_opt !== '') ? Number(t.after_opt) : (Number(t.hours) || 0);
const taskLabel = (t) => `${t.process} — ${t.task}`;

function ensureEmployee(name, company) {
  name = (name || '').trim();
  if (!name || state.employees.some(e => e.name === name)) return;
  state.employees.push({ name, company: company || 'Birbank', activity: ACT_ADMIN, fte: 1, is_group: false, active: true });
}

function normalizeTask(t) {
  return {
    id: String(t.id || uid()),
    company: t.company || 'Birbank',
    process: (t.process || '').trim(),
    category: (t.category || '').trim(),
    task: (t.task || '').trim(),
    description: t.description || '',
    owner_before: (t.owner_before || '').trim(),
    owner_after: (t.owner_after || '').trim(),
    min_per_key: num(t.min_per_key),
    annual_freq: num(t.annual_freq),
    unit: t.unit || 'say',
    hours: num(t.hours) ?? 0,
    after_opt: num(t.after_opt),
    is_cancelled: t.is_cancelled === true || /^(true|bəli|1|yes)$/i.test(String(t.is_cancelled ?? '').trim()),
    updated_at: t.updated_at || '',
    updated_by: t.updated_by || '',
  };
}
function normalizeEmployee(e) {
  return {
    name: String(e.name || '').trim(),
    company: e.company || 'Birbank',
    activity: e.activity || ACT_ADMIN,
    fte: num(e.fte) ?? 1,
    is_group: e.is_group === true || /^(true|bəli|1|yes)$/i.test(String(e.is_group ?? '').trim()),
    active: e.active === undefined || e.active === '' ? true : (e.active === true || /^(true|bəli|1|yes)$/i.test(String(e.active).trim())),
  };
}

/* ---------------- persistence: server (Google Sheet) + local cache ---------------- */
const CACHE_KEY = 'wfp.cache.v2';
const POLL_MS = 20000;
let me = '';
let queue = [];            // göndərilməmiş əməliyyat partiyaları
let sending = false;
let lastServerHash = '';

function emptyState() { return { tasks: [], employees: [], log: [], settings: { ...DEFAULT_SETTINGS } }; }
function applyServerData(d) {
  state.tasks = (d.tasks || []).map(normalizeTask);
  state.employees = (d.employees || []).map(normalizeEmployee).filter(e => e.name);
  state.log = d.log || [];
  state.settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(d.settings || {}).map(([k, v]) => [k, num(v) ?? v])) };
}
const dataHash = (d) => JSON.stringify([d.tasks, d.employees, d.settings, (d.log || []).length]);
function saveLocal() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ me, state })); } catch (e) { /* yer yoxdursa keş vacib deyil */ }
}
function loadCache() {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.state) return c; } catch (e) {}
  return null;
}

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 401) { localStorage.removeItem(CACHE_KEY); location.href = '/login.html'; throw new Error('Sessiya bitib'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Server xətası (${res.status})`);
  return j;
}

function setSync(kind, text) {
  const p = $('syncPill');
  p.className = 'sync-pill ' + (kind || '');
  const icon = { ok: 'fa-circle-check', busy: 'fa-circle-notch fa-spin', err: 'fa-triangle-exclamation' }[kind] || 'fa-circle';
  p.innerHTML = `<i class="fas ${icon}"></i> ${esc(text)}`;
}
function syncIdle() { setSync('ok', `Sinxron · ${new Date().toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}`); }

async function pull({ silent = false } = {}) {
  if (!silent) setSync('busy', 'Yüklənir...');
  const d = await api('/api/data');
  me = d.user || me;
  const h = dataHash(d);
  // Göndərilməmiş dəyişiklik varsa, serverdən gələni tətbiq etmə (öz dəyişikliyimiz itməsin)
  if (queue.length || sending) return false;
  const changed = h !== lastServerHash;
  lastServerHash = h;
  if (changed) {
    applyServerData(d);
    saveLocal();
    renderAll();
  }
  $('seedBanner').classList.toggle('hidden', state.tasks.length > 0);
  syncIdle();
  return changed;
}

// Əvvəlki və indiki vəziyyət arasındakı fərqi Sheet əməliyyatlarına çevirir
const TASK_FIELDS = ['id', 'company', 'process', 'category', 'task', 'description', 'owner_before', 'owner_after', 'min_per_key', 'annual_freq', 'unit', 'hours', 'after_opt', 'is_cancelled', 'updated_at'];
const EMP_FIELDS = ['name', 'company', 'activity', 'fte', 'is_group', 'active'];
const pick = (o, f) => Object.fromEntries(f.map(k => [k, o[k] ?? null]));
function diffOps(prev, cur) {
  const ops = [];
  const pT = new Map(prev.tasks.map(t => [t.id, JSON.stringify(pick(t, TASK_FIELDS))]));
  const cT = new Set();
  cur.tasks.forEach(t => { cT.add(t.id); const j = JSON.stringify(pick(t, TASK_FIELDS)); if (pT.get(t.id) !== j) ops.push({ t: 'upsert', table: 'Tasks', row: pick(t, TASK_FIELDS) }); });
  prev.tasks.forEach(t => { if (!cT.has(t.id)) ops.push({ t: 'delete', table: 'Tasks', key: t.id }); });
  const pE = new Map(prev.employees.map(e => [e.name, JSON.stringify(pick(e, EMP_FIELDS))]));
  const cE = new Set();
  cur.employees.forEach(e => { cE.add(e.name); const j = JSON.stringify(pick(e, EMP_FIELDS)); if (pE.get(e.name) !== j) ops.push({ t: 'upsert', table: 'Employees', row: pick(e, EMP_FIELDS) }); });
  prev.employees.forEach(e => { if (!cE.has(e.name)) ops.push({ t: 'delete', table: 'Employees', key: e.name }); });
  Object.keys(cur.settings).forEach(k => { if (k in DEFAULT_SETTINGS && cur.settings[k] !== prev.settings[k]) ops.push({ t: 'upsert', table: 'Settings', row: { key: k, value: cur.settings[k] } }); });
  return ops;
}

function enqueue(prev, logEntries) {
  const ops = diffOps(prev, state);
  const logs = (logEntries || []).map(row => ({ t: 'log', row }));
  if (!ops.length && !logs.length) return;
  // Yalnız dəyişən sətirlər göndərilir — başqalarının eyni vaxtda etdiyi dəyişikliklər üzərinə yazılmır
  const payload = { ops: ops.concat(logs) };
  queue.push(payload);
  flush();
}
async function flush() {
  if (sending || !queue.length) return;
  sending = true;
  setSync('busy', `Saxlanır... (${queue.length})`);
  const payload = queue[0];
  try {
    try { await api('/api/ops', { method: 'POST', body: JSON.stringify(payload) }); }
    catch (e) { if (/Sessiya/.test(e.message)) throw e; await new Promise(r => setTimeout(r, 1500)); await api('/api/ops', { method: 'POST', body: JSON.stringify(payload) }); }
    queue.shift();
    sending = false;
    if (queue.length) return flush();
    lastServerHash = ''; // növbəti pull mütləq yeniləsin (log, updated_by)
    syncIdle();
  } catch (e) {
    console.error(e);
    sending = false; queue = [];
    setSync('err', 'Yazılmadı');
    toast('Sheet-ə yazmaq alınmadı: ' + e.message + '. Son məlumatlar Sheet-dən yenidən yüklənir.');
    lastServerHash = '';
    pull().catch(() => {});
  }
}

/* ---------------- mutations (with undo + log) ---------------- */
function commit(label, mutator, logEntries) {
  const prev = clone({ tasks: state.tasks, employees: state.employees, settings: state.settings });
  const entry = { label, snap: prev };
  undoStack.push(entry);
  if (undoStack.length > 30) undoStack.shift();
  mutator();
  const ts = nowIso();
  const logs = (logEntries || []).map(l => ({ ts, user: me, comment: '', from: '', to: '', task_id: '', task_label: '', ...l }));
  state.log.push(...logs);
  saveLocal(); renderAll();
  enqueue(prev, logs.map(({ user, ...rest }) => rest));
  toast(label, { label: 'Geri al', fn: () => {
    if (undoStack[undoStack.length - 1] === entry) undo();
    else toast('Bu əməliyyatdan sonra başqa dəyişiklik edilib. Yuxarıdakı “Geri al” düyməsi ilə ardıcıl geri qaytarın.');
  } });
}
function undo() {
  const u = undoStack.pop();
  if (!u) return;
  const prev = clone({ tasks: state.tasks, employees: state.employees, settings: state.settings });
  state.tasks = u.snap.tasks; state.employees = u.snap.employees; state.settings = u.snap.settings;
  const log = { ts: nowIso(), user: me, action: 'Geri alma', task_label: u.label, comment: '', from: '', to: '', task_id: '' };
  state.log.push(log);
  saveLocal(); renderAll();
  enqueue(prev, [{ action: log.action, task_label: log.task_label }]);
  toast(`Geri alındı: ${u.label}`);
}

function transferTasks(ids, to, comment) {
  to = to.trim();
  const list = state.tasks.filter(t => ids.includes(t.id) && curOwner(t) !== to);
  if (!list.length) { toast('Seçilən tapşırıqlar artıq bu əməkdaşdadır.'); return; }
  const logs = list.map(t => ({ action: 'Ötürmə', task_id: t.id, task_label: taskLabel(t), from: curOwner(t), to, comment }));
  commit(`${list.length} tapşırıq ${to}-a ötürüldü`, () => {
    ensureEmployee(to, list[0].company);
    list.forEach(t => {
      if (!t.owner_before) t.owner_before = curOwner(t);
      t.owner_after = to; t.updated_at = nowIso();
    });
  }, logs);
}
function setCancelled(ids, value, comment) {
  const list = state.tasks.filter(t => ids.includes(t.id) && t.is_cancelled !== value);
  if (!list.length) return;
  const logs = list.map(t => ({ action: value ? 'Ləğv' : 'Bərpa', task_id: t.id, task_label: taskLabel(t), from: curOwner(t), comment }));
  commit(`${list.length} tapşırıq ${value ? 'ləğv edildi' : 'bərpa edildi'}`, () => {
    list.forEach(t => { t.is_cancelled = value; t.updated_at = nowIso(); });
  }, logs);
}
function deleteTasks(ids) {
  const list = state.tasks.filter(t => ids.includes(t.id));
  if (!list.length) return;
  const logs = list.map(t => ({ action: 'Silinmə', task_id: t.id, task_label: taskLabel(t), from: curOwner(t) }));
  commit(`${list.length} tapşırıq silindi`, () => {
    state.tasks = state.tasks.filter(t => !ids.includes(t.id));
  }, logs);
}

/* ---------------- analytics ---------------- */
function filteredActive(company, activity) {
  return state.tasks.filter(t => !t.is_cancelled
    && (company === 'all' || t.company === company)
    && (activity === 'all' || activityOf(curOwner(t)) === activity));
}
function employeeLoads(company, activity, useOpt) {
  const emps = empByName();
  const norm = state.settings.norm;
  const rows = {};
  const add = (name) => rows[name] || (rows[name] = { name, hours: 0, before: 0, tasks: 0, emp: emps[name] || { name, fte: 1, activity: ACT_ADMIN, company: '', is_group: false } });
  filteredActive(company, activity).forEach(t => { const r = add(curOwner(t)); r.hours += effHours(t, useOpt); r.tasks++; });
  // baseline: ilkin bölgü (owner_before), ləğv edilənlər daxil
  state.tasks.filter(t => (company === 'all' || t.company === company)).forEach(t => {
    const o = t.owner_before || t.owner_after; if (!o) return;
    if (activity !== 'all' && activityOf(o) !== activity) return;
    add(o).before += Number(t.hours) || 0;
  });
  return Object.values(rows).filter(r => r.name).map(r => {
    const fte = r.emp.fte || 1;
    const cap = norm * fte;
    return { ...r, fte, cap, load: r.hours / cap, free: cap - r.hours, isGroup: !!r.emp.is_group };
  });
}
function level(load) {
  const w = state.settings.warn / 100;
  if (load > 1) return { k: 'critical', txt: 'Norma aşılır', icon: 'fa-circle-exclamation', color: 'var(--critical)' };
  if (load > w) return { k: 'warning', txt: 'Yüksək', icon: 'fa-triangle-exclamation', color: 'var(--warning)' };
  if (load === 0) return { k: 'idle', txt: 'Tapşırıq yoxdur', icon: 'fa-circle-minus', color: 'var(--border)' };
  return { k: 'good', txt: 'Normal', icon: 'fa-circle-check', color: 'var(--good)' };
}

/* ---------------- render: shared ---------------- */
function fillSelect(el, options, allLabel = 'Hamısı', keep = true) {
  const cur = el.value;
  el.innerHTML = (allLabel ? `<option value="all">${esc(allLabel)}</option>` : '') + options.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}">${esc(l)}</option>`;
  }).join('');
  if (keep && [...el.options].some(o => o.value === cur)) el.value = cur;
}
const companies = () => [...new Set(state.tasks.map(t => t.company).concat(state.employees.map(e => e.company)).filter(Boolean))].sort(sortAz);
const ownerNames = () => [...new Set(state.tasks.map(curOwner).filter(Boolean))].sort(sortAz);

function renderAll() {
  const cs = companies();
  ['dCompany', 'eCompany', 'tCompany'].forEach(id => fillSelect($(id), cs));
  ['dActivity', 'eActivity', 'tActivity'].forEach(id => fillSelect($(id), [ACT_ADMIN, ACT_PROJECT]));
  fillSelect($('tProcess'), [...new Set(state.tasks.map(t => t.process).filter(Boolean))].sort(sortAz));
  fillSelect($('tOwner'), ownerNames());
  fillSelect($('tStatus'), STATUSES);
  fillSelect($('lAction'), [...new Set(state.log.map(l => l.action))].sort(sortAz));
  fillSelect($('lUser'), [...new Set(state.log.map(l => l.user).filter(Boolean))].sort(sortAz));
  $('normLabel').textContent = fmt(state.settings.norm);
  $('undoBtn').disabled = !undoStack.length;
  $('undoBtn').title = undoStack.length ? `Geri al: ${undoStack[undoStack.length - 1].label}` : 'Geri alınacaq əməliyyat yoxdur';
  const v = currentView();
  if (v === 'dashboard') renderDashboard();
  if (v === 'employees') renderEmployees();
  if (v === 'tasks') renderTasks();
  if (v === 'log') renderLog();
  if (v === 'settings') renderSettings();
  if (drawerEmp) renderDrawer(drawerEmp);
}
const currentView = () => document.querySelector('.tab.active').dataset.view;

/* ---------------- render: dashboard ---------------- */
function chart(id, cfg) {
  if (!window.Chart) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), cfg);
}
const gridColor = '#EFEFF3', tickColor = '#737789';
if (window.Chart) { Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; Chart.defaults.color = tickColor; }
const baseTooltip = { backgroundColor: '#090A13', padding: 10, cornerRadius: 8, titleFont: { weight: '700' }, displayColors: false };

function renderDashboard() {
  const company = $('dCompany').value, activity = $('dActivity').value, useOpt = $('dOpt').checked;
  const norm = state.settings.norm;
  const active = filteredActive(company, activity);
  const scope = state.tasks.filter(t => (company === 'all' || t.company === company) && (activity === 'all' || activityOf(curOwner(t)) === activity));
  const totalH = active.reduce((s, t) => s + effHours(t, useOpt), 0);
  const rawH = active.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const cancelled = scope.filter(t => t.is_cancelled);
  const cancelledH = cancelled.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const optSave = active.filter(t => t.after_opt != null).reduce((s, t) => s + ((Number(t.hours) || 0) - Number(t.after_opt)), 0);
  const transfers = scope.filter(t => statusOf(t) === 'Transfer').length;
  const loads = employeeLoads(company, activity, useOpt);
  const people = loads.filter(r => !r.isGroup && r.hours > 0);
  const fteHave = people.reduce((s, r) => s + r.fte, 0);
  const fteNeed = totalH / norm;
  const over = people.filter(r => r.load > 1).length;

  const hs = (label, value, foot) => `<div class="hero-stat"><div class="l">${label}</div><div class="v">${value}</div><div class="f">${foot}</div></div>`;
  const gap = fteHave - fteNeed;
  $('heroStats').innerHTML = [
    hs('İllik iş həcmi', `${fmt(totalH)} <small>saat</small>`, `${fmt(active.length)} aktiv tapşırıq`),
    hs('Lazım olan ştat', `${fmt(fteNeed, 1)} <small>FTE</small>`, `${fmt(totalH)} ÷ ${fmt(norm)} saat`),
    hs('Mövcud ştat', `${fmt(fteHave, 1)} <small>FTE</small>`, `${people.length} nəfər tapşırıq icra edir`),
    hs(gap >= 0 ? 'Ehtiyat tutum' : 'Ştat çatışmazlığı', `${gap >= 0 ? '+' : '−'}${fmt(Math.abs(gap), 1)} <small>FTE</small>`, `${fmt(Math.abs(gap) * norm)} saat ${gap >= 0 ? 'boş' : 'artıq yük'}`),
  ].join('');
  const kpi = (icon, label, value, foot) => `<div class="card kpi"><div class="ic"><i class="fas ${icon}"></i></div><div><div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div></div>`;
  $('kpis').innerHTML = [
    kpi('fa-fire', 'Norması aşılan', `${over} <small>nəfər</small>`, `> 100% yük`),
    kpi('fa-ban', 'Ləğvdən qənaət', `${fmt(cancelledH)} <small>saat</small>`, `${cancelled.length} iş · ${fmt(cancelledH / norm, 2)} FTE`),
    kpi('fa-right-left', 'Ötürülmüş işlər', `${transfers}`, 'İcraçısı dəyişən aktiv iş'),
    kpi('fa-bolt', 'Optimizasiya potensialı', `${fmt(optSave)} <small>saat</small>`, useOpt ? 'Hesablamaya tətbiq olunub' : `${fmt(optSave / norm, 2)} FTE qənaət mümkündür`),
  ].join('');
  $('warnLabel').textContent = state.settings.warn;

  // Load chart (people only, sorted)
  const lr = loads.filter(r => !r.isGroup).sort((a, b) => b.load - a.load);
  $('loadChartBox').style.height = Math.max(240, lr.length * 26 + 50) + 'px';
  const refLine = {
    id: 'refLine',
    afterDatasetsDraw(c) {
      const x = c.scales.x.getPixelForValue(100);
      const { top, bottom } = c.chartArea;
      const ctx = c.ctx; ctx.save();
      ctx.strokeStyle = '#090A13'; ctx.globalAlpha = .5; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = .8; ctx.fillStyle = '#090A13'; ctx.font = '600 11px Inter';
      ctx.fillText('Norma 100%', x + 6, top + 10); ctx.restore();
    },
  };
  const statusHex = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b', idle: '#C1C7D0' };
  chart('loadChart', {
    type: 'bar',
    data: { labels: lr.map(r => r.name), datasets: [{ data: lr.map(r => +(r.load * 100).toFixed(1)), backgroundColor: lr.map(r => statusHex[level(r.load).k]), borderRadius: 4, barThickness: 16 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, suggestedMax: 120, grid: { color: gridColor }, border: { display: false }, ticks: { callback: v => v + '%' } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: '#11131C', font: { weight: '600' } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { ...baseTooltip, callbacks: {
          title: (i) => lr[i[0].dataIndex].name,
          label: (i) => { const r = lr[i.dataIndex]; return [`Yük: ${fmt(r.load * 100, 1)}% (${level(r.load).txt})`, `${fmt(r.hours, 1)} / ${fmt(r.cap)} saat · ${fmt(r.fte, 2)} ştat`, `${r.tasks} tapşırıq`]; },
        } },
      },
      onClick: (e, els) => { if (els.length) openDrawer(lr[els[0].index].name); },
    },
    plugins: [refLine],
  });

  // Before vs now
  const ba = loads.filter(r => r.before > 0 || r.hours > 0).sort((a, b) => Math.max(b.before, b.hours) - Math.max(a.before, a.hours));
  chart('beforeAfterChart', {
    type: 'bar',
    data: { labels: ba.map(r => r.name), datasets: [
      { label: 'Əvvəl', data: ba.map(r => +r.before.toFixed(1)), backgroundColor: '#A3A7B7', borderRadius: 4, categoryPercentage: .7, barPercentage: .9 },
      { label: 'İndi', data: ba.map(r => +r.hours.toFixed(1)), backgroundColor: '#F2501E', borderRadius: 4, categoryPercentage: .7, barPercentage: .9 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, maxRotation: 60, minRotation: 45 } }, y: { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, title: { display: true, text: 'İllik saat' } } },
      plugins: { legend: { display: false }, tooltip: { ...baseTooltip, displayColors: true, mode: 'index', intersect: false, callbacks: {
        label: (i) => `${i.dataset.label}: ${fmt(i.raw, 1)} saat`,
        afterBody: (i) => { const r = ba[i[0].dataIndex]; const d = r.hours - r.before; return `Fərq: ${d >= 0 ? '+' : ''}${fmt(d, 1)} saat`; },
      } } },
    },
  });

  // Splits
  const split = (title, groups, colors) => {
    const tot = groups.reduce((s, g) => s + g[1], 0) || 1;
    return `<div class="split"><div class="split-title"><span>${esc(title)}</span><span class="num">${fmt(tot)} saat</span></div>
      <div class="split-bar">${groups.map((g, i) => `<div style="width:${g[1] / tot * 100}%;background:${colors[i]}" title="${esc(g[0])}: ${fmt(g[1])} saat"></div>`).join('')}</div>
      <div class="split-rows">${groups.map((g, i) => `<div><span><i style="background:${colors[i]}"></i>${esc(g[0])}</span><span class="num">${fmt(g[1])} saat · ${pct(g[1] / tot)}</span></div>`).join('')}</div></div>`;
  };
  const groupBy = (arr, keyFn) => { const m = {}; arr.forEach(t => { const k = keyFn(t) || '—'; m[k] = (m[k] || 0) + effHours(t, useOpt); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const coColor = { Birbank: '#E30613', Pashapay: '#2347A8' };
  const actColor = { [ACT_ADMIN]: '#3D4152', [ACT_PROJECT]: '#FF7A1A' };
  const byCo = groupBy(active, t => t.company), byAct = groupBy(active, t => activityOf(curOwner(t)));
  const byStatus = groupBy(active, statusOf);
  const statusColors = { 'Mövcud': '#2347A8', 'Transfer': '#FF7A1A', 'Yeni': '#1baf7a' };
  $('splits').innerHTML = split('Şirkət üzrə', byCo, byCo.map(g => coColor[g[0]] || '#A3A7B7'))
    + split('Fəaliyyət forması üzrə', byAct, byAct.map(g => actColor[g[0]] || '#A3A7B7'))
    + split('Status üzrə', byStatus, byStatus.map(g => statusColors[g[0]] || '#C1C7D0'));

  // Process & category
  const hbar = (id, entries) => chart(id, {
    type: 'bar',
    data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => +e[1].toFixed(1)), backgroundColor: '#F2501E', borderRadius: 4, barThickness: 14 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { beginAtZero: true, grid: { color: gridColor }, border: { display: false } }, y: { grid: { display: false }, border: { display: false }, ticks: { color: '#11131C' } } },
      plugins: { legend: { display: false }, tooltip: { ...baseTooltip, callbacks: { label: (i) => `${fmt(i.raw, 1)} saat · ${fmt(i.raw / norm, 2)} FTE` } } },
    },
  });
  hbar('processChart', groupBy(active, t => t.process).slice(0, 12));
  hbar('categoryChart', groupBy(active, t => t.category).slice(0, 12));

  // Capacity table
  const rows = loads.filter(r => r.hours > 0 || r.before > 0).sort((a, b) => b.load - a.load);
  $('capacityTable').innerHTML = `<table><thead><tr>
      <th>Əməkdaş</th><th>Şirkət</th><th>Fəaliyyət forması</th><th class="r">Ştat</th><th class="r">Tapşırıq</th>
      <th class="r">Əvvəl (saat)</th><th class="r">İndi (saat)</th><th class="r">Norma (saat)</th><th class="r">Boş tutum</th><th class="r">Yük</th><th>Vəziyyət</th></tr></thead><tbody>
    ${rows.map(r => { const l = r.isGroup ? null : level(r.load); return `<tr style="cursor:pointer" data-emp="${esc(r.name)}">
      <td class="task-title">${esc(r.name)}${r.isGroup ? ' <span class="tag">qrup</span>' : ''}</td>
      <td>${r.emp.company ? `<span class="tag co-${esc(r.emp.company)}">${esc(r.emp.company)}</span>` : ''}</td>
      <td>${r.emp.activity === ACT_PROJECT ? `<span class="tag act-p">${ACT_PROJECT}</span>` : `<span class="tag">${esc(r.emp.activity || ACT_ADMIN)}</span>`}</td>
      <td class="r num">${r.isGroup ? '—' : fmt(r.fte, 2)}</td><td class="r num">${r.tasks}</td>
      <td class="r num">${fmt(r.before, 1)}</td><td class="r num"><b>${fmt(r.hours, 1)}</b></td>
      <td class="r num">${r.isGroup ? '—' : fmt(r.cap)}</td><td class="r num">${r.isGroup ? '—' : fmt(r.free, 0)}</td>
      <td class="r num"><b>${r.isGroup ? '—' : pct(r.load)}</b></td>
      <td>${l ? `<span class="lvl lvl-${l.k}"><i class="fas ${l.icon}"></i>${l.txt}</span>` : '<span class="muted">Qrup — ştata daxil deyil</span>'}</td></tr>`; }).join('')}
    </tbody></table>`;
  $('capacityTable').querySelectorAll('tr[data-emp]').forEach(tr => tr.onclick = () => openDrawer(tr.dataset.emp));
}

/* ---------------- render: employees ---------------- */
function renderEmployees() {
  const q = $('eSearch').value.trim().toLowerCase(), company = $('eCompany').value, activity = $('eActivity').value, sort = $('eSort').value;
  const loads = Object.fromEntries(employeeLoads('all', 'all', false).map(r => [r.name, r]));
  let list = state.employees.filter(e => (!q || e.name.toLowerCase().includes(q)) && (company === 'all' || e.company === company) && (activity === 'all' || e.activity === activity));
  list = list.map(e => ({ e, r: loads[e.name] || { hours: 0, tasks: 0, load: 0, cap: state.settings.norm * (e.fte || 1) } }));
  list.sort((a, b) => sort === 'name' ? sortAz(a.e.name, b.e.name) : sort === 'tasks' ? b.r.tasks - a.r.tasks : (b.e.is_group - a.e.is_group) * -1 || b.r.load - a.r.load);
  if (!list.length) { $('empGrid').innerHTML = '<div class="empty">Uyğun əməkdaş tapılmadı.</div>'; return; }
  $('empGrid').innerHTML = list.map(({ e, r }) => {
    const l = level(r.load), w = Math.min(100, r.load * 100);
    const cap = state.settings.norm * (e.fte || 1);
    return `<div class="card emp-card ${!e.is_group && r.load > 1 ? 'over' : ''}" data-emp="${esc(e.name)}">
      <div class="emp-top">
        <div class="avatar ${e.is_group ? 'group' : r.load > 1 ? 'hot' : ''}">${e.is_group ? '<i class="fas fa-users"></i>' : esc(e.name.charAt(0))}</div>
        <div style="min-width:0"><div class="emp-name">${esc(e.name)}</div>
          <div class="emp-tags"><span class="tag co-${esc(e.company)}">${esc(e.company)}</span>
          <span class="tag ${e.activity === ACT_PROJECT ? 'act-p' : ''}">${esc(e.activity)}</span>${e.is_group ? '<span class="tag">qrup</span>' : ''}</div></div>
      </div>
      <div class="emp-stats">
        <div><b>${r.tasks}</b><span>Tapşırıq</span></div>
        <div><b>${fmt(r.hours)}</b><span>Saat/il</span></div>
        <div><b>${e.is_group ? '—' : fmt(e.fte, 2)}</b><span>Ştat</span></div>
      </div>
      ${e.is_group ? '<div class="hint">Qrup — fərdi norma hesablanmır</div>' : `
      <div class="load-row"><span class="lvl lvl-${l.k}"><i class="fas ${l.icon}"></i>${l.txt}</span><span class="num">${pct(r.load)} · ${fmt(r.hours)} / ${fmt(cap)}</span></div>
      <div class="load-track"><div class="load-fill" style="width:${w}%;background:${l.color}"></div></div>`}
    </div>`;
  }).join('');
  $('empGrid').querySelectorAll('.emp-card').forEach(c => c.onclick = () => openDrawer(c.dataset.emp));
}

/* ---------------- drawer (employee detail) ---------------- */
function openDrawer(name) {
  drawerEmp = name;
  renderDrawer(name);
  $('drawer').classList.add('open'); $('drawerOverlay').classList.add('open');
}
function closeDrawer() { drawerEmp = null; $('drawer').classList.remove('open'); $('drawerOverlay').classList.remove('open'); }

function renderDrawer(name) {
  const e = state.employees.find(x => x.name === name) || { name, company: '', activity: ACT_ADMIN, fte: 1, is_group: false };
  const r = employeeLoads('all', 'all', false).find(x => x.name === name) || { hours: 0, tasks: 0, load: 0, cap: state.settings.norm };
  const l = level(r.load);
  const current = state.tasks.filter(t => curOwner(t) === name);
  const outgoing = state.tasks.filter(t => t.owner_before === name && t.owner_after && t.owner_after !== name);
  $('drawerHead').innerHTML = `
    <div>
      <div style="display:flex;gap:12px;align-items:center"><div class="avatar ${e.is_group ? 'group' : ''}">${esc(name.charAt(0))}</div>
      <div><h2 style="margin:0;font-size:1.25rem">${esc(name)}</h2>
      <div class="emp-tags"><span class="tag co-${esc(e.company)}">${esc(e.company || '—')}</span><span class="tag ${e.activity === ACT_PROJECT ? 'act-p' : ''}">${esc(e.activity)}</span>
      ${e.is_group ? '<span class="tag">qrup</span>' : `<span class="lvl lvl-${l.k}" style="font-size:.8rem;font-weight:600"><i class="fas ${l.icon}"></i>${pct(r.load)} · ${fmt(r.hours, 1)} / ${fmt(r.cap)} saat</span>`}</div></div></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
      <button class="btn btn-outline btn-sm" id="dwTransferAll"><i class="fas fa-people-arrows"></i> Hamısını ötür</button>
      <button class="btn btn-outline btn-sm" id="dwEdit"><i class="fas fa-user-pen"></i> Profil</button>
      <button class="btn btn-outline btn-sm" id="dwAddTask"><i class="fas fa-plus"></i> Tapşırıq</button>
      <button class="btn btn-ghost icon-btn" id="dwClose"><i class="fas fa-xmark"></i></button>
    </div>`;
  const rowsHtml = (arr, mode) => arr.length ? `<table><thead><tr><th style="width:28px"><input type="checkbox" class="chk" data-all="${mode}"></th><th>Proses / Tapşırıq</th><th>Şirkət</th><th>${mode === 'out' ? 'Kimə ötürülüb' : 'Haradan'}</th><th class="c">Status</th><th class="r">Saat/il</th><th></th></tr></thead><tbody>
      ${arr.map(t => { const st = statusOf(t); return `<tr class="${t.is_cancelled ? 'is-cancelled' : ''}">
        <td><input type="checkbox" class="chk" data-sel="${esc(t.id)}" ${selected.has(t.id) ? 'checked' : ''}></td>
        <td><span class="task-title">${esc(t.task)}</span><span class="task-sub">${esc(t.process)} · ${esc(t.category)}</span></td>
        <td><span class="tag co-${esc(t.company)}">${esc(t.company)}</span></td>
        <td>${mode === 'out' ? esc(t.owner_after) : (t.owner_before && t.owner_before !== name ? esc(t.owner_before) : '<span class="muted">—</span>')}</td>
        <td class="c"><span class="badge st-${st}">${st}</span></td>
        <td class="r num">${fmt(t.hours, 1)}</td>
        <td>${taskActions(t)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty" style="padding:20px">Yoxdur</div>';
  $('drawerBody').innerHTML = `
    <h3 style="margin:0 0 8px">Cari tapşırıqlar <span class="muted" style="font-weight:500">(${current.length})</span></h3>
    <div class="table-wrap">${rowsHtml(current, 'cur')}</div>
    <h3 style="margin:24px 0 8px">Başqasına ötürülənlər <span class="muted" style="font-weight:500">(${outgoing.length})</span></h3>
    <div class="table-wrap">${rowsHtml(outgoing, 'out')}</div>`;
  $('dwClose').onclick = closeDrawer;
  $('dwEdit').onclick = () => openEmployeeModal(name);
  $('dwAddTask').onclick = () => openTaskModal(null, { owner_after: name, company: e.company || 'Birbank' });
  $('dwTransferAll').onclick = () => {
    const ids = current.filter(t => !t.is_cancelled).map(t => t.id);
    if (!ids.length) return toast('Ötürüləcək aktiv tapşırıq yoxdur.');
    openTransferModal(ids, `${name} — bütün aktiv tapşırıqlar`);
  };
  bindRowActions($('drawerBody'));
}

function taskActions(t) {
  return `<div class="row-actions">
    <button class="btn btn-outline btn-sm icon-btn" title="Ötür" data-act="transfer" data-id="${esc(t.id)}"><i class="fas fa-right-left"></i></button>
    ${t.is_cancelled
      ? `<button class="btn btn-success btn-sm icon-btn" title="Bərpa et" data-act="restore" data-id="${esc(t.id)}"><i class="fas fa-rotate"></i></button>`
      : `<button class="btn btn-danger btn-sm icon-btn" title="Ləğv et" data-act="cancel" data-id="${esc(t.id)}"><i class="fas fa-ban"></i></button>`}
    <button class="btn btn-outline btn-sm icon-btn" title="Redaktə" data-act="edit" data-id="${esc(t.id)}"><i class="fas fa-pen"></i></button>
  </div>`;
}
function bindRowActions(root) {
  root.querySelectorAll('[data-act]').forEach(b => b.onclick = (ev) => {
    ev.stopPropagation();
    const id = b.dataset.id, t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (b.dataset.act === 'transfer') openTransferModal([id], taskLabel(t));
    if (b.dataset.act === 'cancel') openCancelModal([id], true);
    if (b.dataset.act === 'restore') setCancelled([id], false, '');
    if (b.dataset.act === 'edit') openTaskModal(t);
  });
  root.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? selected.add(c.dataset.sel) : selected.delete(c.dataset.sel); updateBulk(); });
  root.querySelectorAll('[data-all]').forEach(c => c.onchange = () => {
    c.closest('table').querySelectorAll('[data-sel]').forEach(x => { x.checked = c.checked; c.checked ? selected.add(x.dataset.sel) : selected.delete(x.dataset.sel); });
    updateBulk();
  });
}
function updateBulk() {
  const ids = [...selected].filter(id => state.tasks.some(t => t.id === id));
  selected = new Set(ids);
  $('bulkBar').classList.toggle('hidden', !ids.length);
  const h = state.tasks.filter(t => selected.has(t.id)).reduce((s, t) => s + (Number(t.hours) || 0), 0);
  $('bulkCount').textContent = `${ids.length} seçildi · ${fmt(h, 1)} saat`;
}

/* ---------------- render: tasks ---------------- */
function taskFilters() {
  return { q: $('tSearch').value.trim().toLowerCase(), company: $('tCompany').value, process: $('tProcess').value, owner: $('tOwner').value, status: $('tStatus').value, activity: $('tActivity').value };
}
function renderTasks() {
  const f = taskFilters();
  let list = state.tasks.filter(t => {
    if (f.company !== 'all' && t.company !== f.company) return false;
    if (f.process !== 'all' && t.process !== f.process) return false;
    if (f.owner !== 'all' && curOwner(t) !== f.owner) return false;
    if (f.status !== 'all' && statusOf(t) !== f.status) return false;
    if (f.activity !== 'all' && activityOf(curOwner(t)) !== f.activity) return false;
    if (f.q && !`${t.task} ${t.process} ${t.category} ${t.description} ${t.owner_before} ${t.owner_after} ${t.id}`.toLowerCase().includes(f.q)) return false;
    return true;
  });
  const key = taskSort.key, dir = taskSort.dir;
  const val = (t) => key === 'owner' ? curOwner(t) : key === 'status' ? statusOf(t) : t[key];
  list.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'number' || typeof y === 'number' ? (x || 0) - (y || 0) : sortAz(x || '', y || '')) * dir; });
  const sumH = list.filter(t => !t.is_cancelled).reduce((s, t) => s + (Number(t.hours) || 0), 0);
  $('taskCount').textContent = `${list.length} tapşırıq göstərilir · aktiv olanların cəmi ${fmt(sumH)} saat (${fmt(sumH / state.settings.norm, 2)} FTE)`;
  const th = (k, label, cls = '') => `<th class="sortable ${cls}" data-sort="${k}">${label}${taskSort.key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  $('taskTable').innerHTML = list.length ? `<table><thead><tr>
      <th style="width:28px"><input type="checkbox" class="chk" data-all="tasks"></th>
      ${th('company', 'Şirkət')}${th('process', 'Proses / Tapşırıq')}${th('category', 'Kateqoriya')}${th('owner', 'Cari icraçı')}${th('owner_before', 'İlkin icraçı')}
      ${th('status', 'Status', 'c')}${th('annual_freq', 'Təkrar/il', 'r')}${th('hours', 'Saat/il', 'r')}${th('after_opt', 'Opt. sonra', 'r')}<th></th></tr></thead><tbody>
    ${list.map(t => { const st = statusOf(t), o = curOwner(t); return `<tr class="${t.is_cancelled ? 'is-cancelled' : ''}">
      <td><input type="checkbox" class="chk" data-sel="${esc(t.id)}" ${selected.has(t.id) ? 'checked' : ''}></td>
      <td><span class="tag co-${esc(t.company)}">${esc(t.company)}</span></td>
      <td style="min-width:260px"><span class="task-title">${esc(t.task)}</span><span class="task-sub">${esc(t.process)}${t.description ? ' · ' + esc(t.description) : ''}</span></td>
      <td>${esc(t.category)}</td>
      <td><a href="#" data-emp="${esc(o)}" style="color:inherit;font-weight:600">${esc(o)}</a><span class="task-sub">${esc(activityOf(o))}</span></td>
      <td>${esc(t.owner_before)}</td>
      <td class="c"><span class="badge st-${st}">${st}</span></td>
      <td class="r num">${t.annual_freq != null ? fmt(t.annual_freq) + ' ' + esc(t.unit || '') : ''}</td>
      <td class="r num"><b>${fmt(t.hours, 1)}</b></td>
      <td class="r num">${t.after_opt != null ? fmt(t.after_opt, 1) : ''}</td>
      <td>${taskActions(t)}</td></tr>`; }).join('')}
    </tbody></table>` : '<div class="empty">Filtrə uyğun tapşırıq yoxdur.</div>';
  $('taskTable').querySelectorAll('[data-sort]').forEach(h => h.onclick = () => { taskSort = { key: h.dataset.sort, dir: taskSort.key === h.dataset.sort ? -taskSort.dir : 1 }; renderTasks(); });
  $('taskTable').querySelectorAll('a[data-emp]').forEach(a => a.onclick = (e) => { e.preventDefault(); openDrawer(a.dataset.emp); });
  bindRowActions($('taskTable'));
  updateBulk();
}

/* ---------------- render: log ---------------- */
function renderLog() {
  const a = $('lAction').value, u = $('lUser').value, q = $('lSearch').value.trim().toLowerCase();
  const list = state.log.filter(l => (a === 'all' || l.action === a) && (u === 'all' || l.user === u) && (!q || `${l.task_label} ${l.from} ${l.to} ${l.comment} ${l.user}`.toLowerCase().includes(q))).slice().reverse();
  const icon = { 'Ötürmə': 'fa-right-left', 'Ləğv': 'fa-ban', 'Bərpa': 'fa-rotate', 'Silinmə': 'fa-trash', 'Yeni': 'fa-plus', 'Düzəliş': 'fa-pen', 'Import': 'fa-file-import', 'Əməkdaş': 'fa-user-pen', 'Geri alma': 'fa-rotate-left', 'Ayarlar': 'fa-sliders' };
  const when = (ts) => { const d = new Date(ts); return isNaN(d) ? esc(ts) : esc(d.toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })); };
  $('logList').innerHTML = list.length ? list.slice(0, 500).map(l => `<div class="log-item">
      <div class="muted num">${when(l.ts)}</div>
      <div><b><span class="log-ic"><i class="fas ${icon[l.action] || 'fa-circle'}"></i></span>${esc(l.action)}</b></div>
      <div>${esc(l.task_label)}${l.from || l.to ? `<div class="muted">${esc(l.from)}${l.to ? ' → ' + esc(l.to) : ''}</div>` : ''}${l.comment ? `<div class="hint">“${esc(l.comment)}”</div>` : ''}</div>
      <div class="muted" style="text-align:right"><i class="fas fa-user" style="font-size:.7rem"></i> ${esc(l.user || '—')}</div>
    </div>`).join('') + (list.length > 500 ? `<div class="hint" style="padding-top:10px">Son 500 qeyd göstərilir. Hamısı Excel export-da və Sheet-in “Log” vərəqindədir.</div>` : '')
    : '<div class="empty">Hələ əməliyyat yoxdur. Ötürmə, ləğv və düzəlişlər burada görünəcək.</div>';
}

/* ---------------- render: settings ---------------- */
function renderSettings() {
  $('sNorm').value = state.settings.norm; $('sWarn').value = state.settings.warn;
  $('dataInfo').innerHTML = `Sheet-də <b>${state.tasks.length}</b> tapşırıq, <b>${state.employees.length}</b> əməkdaş, <b>${state.log.length}</b> jurnal qeydi var.`;
}

/* ---------------- modals ---------------- */
function openModal(title, body, buttons) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = body;
  $('modalFoot').innerHTML = '';
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || 'btn-outline'); el.innerHTML = b.label;
    el.onclick = b.fn || closeModal;
    $('modalFoot').appendChild(el);
  });
  $('modal').classList.add('open');
  const first = $('modalBody').querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() { $('modal').classList.remove('open'); }

function ownerOptionsHtml(exclude) {
  const loads = Object.fromEntries(employeeLoads('all', 'all', false).map(r => [r.name, r]));
  return state.employees.filter(e => e.active !== false && !exclude.includes(e.name)).sort((a, b) => sortAz(a.name, b.name))
    .map(e => { const r = loads[e.name]; const ld = e.is_group ? 'qrup' : `${pct(r ? r.load : 0)} yük`; return `<option value="${esc(e.name)}">${esc(e.name)} — ${esc(e.company)}, ${ld}</option>`; }).join('');
}

function openTransferModal(ids, label) {
  const list = state.tasks.filter(t => ids.includes(t.id));
  const owners = [...new Set(list.map(curOwner))];
  const moveH = list.filter(t => !t.is_cancelled).reduce((s, t) => s + (Number(t.hours) || 0), 0);
  openModal(`Ötürmə`, `
    <p style="margin-top:0">${list.length === 1 ? `<b>${esc(label)}</b>` : `<b>${list.length}</b> tapşırıq (${esc(label)})`}<br><span class="muted">Hazırkı icraçı: ${esc(owners.join(', '))} · ${fmt(moveH, 1)} saat/il</span></p>
    <div class="form-grid">
      <div class="field full"><label>Kimə ötürülsün</label>
        <select class="select" id="trTo"><option value="">— Seçin —</option>${ownerOptionsHtml(owners.length === 1 ? owners : [])}<option value="__new">+ Yeni əməkdaş...</option></select></div>
      <div class="field full hidden" id="trNewWrap"><label>Yeni əməkdaşın adı</label><input class="input" id="trNew"></div>
      <div class="field full"><label>Şərh (istəyə bağlı)</label><input class="input" id="trComment" placeholder="Məs: məzuniyyət, rotasiya, yük balansı"></div>
    </div>
    <div class="impact" id="trImpact"><span class="muted">Əməkdaş seçin — yükə təsiri burada görünəcək.</span></div>`,
  [{ label: 'Bağla' }, { label: '<i class="fas fa-right-left"></i> Ötür', cls: 'btn-primary', fn: () => {
    let to = $('trTo').value; if (to === '__new') to = $('trNew').value.trim();
    if (!to) return toast('Əməkdaş seçin.');
    closeModal(); transferTasks(ids, to, $('trComment').value.trim());
  } }]);
  const loads = Object.fromEntries(employeeLoads('all', 'all', false).map(r => [r.name, r]));
  const impact = () => {
    let to = $('trTo').value;
    $('trNewWrap').classList.toggle('hidden', to !== '__new');
    if (to === '__new') to = $('trNew').value.trim();
    if (!to) { $('trImpact').innerHTML = '<span class="muted">Əməkdaş seçin — yükə təsiri burada görünəcək.</span>'; return; }
    const e = state.employees.find(x => x.name === to) || { fte: 1 };
    const cap = state.settings.norm * (e.fte || 1);
    const incoming = list.filter(t => !t.is_cancelled && curOwner(t) !== to).reduce((s, t) => s + (Number(t.hours) || 0), 0);
    const before = loads[to] ? loads[to].hours : 0, after = before + incoming;
    const lb = level(before / cap), la = level(after / cap);
    let html = `<div class="impact-row"><b>${esc(to)}</b><span></span></div>
      <div class="impact-row"><span>İndiki yük</span><span class="num lvl lvl-${lb.k}">${fmt(before, 1)} saat · ${pct(before / cap)}</span></div>
      <div class="impact-row"><span>Ötürmədən sonra</span><span class="num lvl lvl-${la.k}"><i class="fas ${la.icon}"></i> ${fmt(after, 1)} saat · ${pct(after / cap)}</span></div>`;
    owners.filter(o => o !== to).forEach(o => {
      const oe = state.employees.find(x => x.name === o) || { fte: 1 }; const oc = state.settings.norm * (oe.fte || 1);
      const ob = loads[o] ? loads[o].hours : 0;
      const out = list.filter(t => !t.is_cancelled && curOwner(t) === o).reduce((s, t) => s + (Number(t.hours) || 0), 0);
      html += `<div class="impact-row"><span>${esc(o)}: ${pct(ob / oc)} →</span><span class="num">${pct((ob - out) / oc)}</span></div>`;
    });
    if (after / cap > 1 && !e.is_group) html += `<div class="hint lvl-critical" style="margin-top:6px"><i class="fas fa-circle-exclamation"></i> ${esc(to)} normanı aşacaq.</div>`;
    $('trImpact').innerHTML = html;
  };
  $('trTo').onchange = impact; $('trNew').oninput = impact;
}

function openCancelModal(ids, value) {
  const list = state.tasks.filter(t => ids.includes(t.id));
  const h = list.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  openModal('Ləğv et', `<p style="margin-top:0">${list.length === 1 ? `<b>${esc(taskLabel(list[0]))}</b>` : `<b>${list.length}</b> tapşırıq`} ləğv ediləcək. İllik qənaət: <b>${fmt(h, 1)} saat</b> (${fmt(h / state.settings.norm, 2)} FTE).</p>
    <div class="field"><label>Səbəb (istəyə bağlı)</label><input class="input" id="cnComment" placeholder="Məs: avtomatlaşdırıldı, artıq tələb olunmur"></div>
    <p class="hint">Ləğv edilən iş silinmir: siyahıda qalır və istənilən vaxt bərpa edilə bilər.</p>`,
  [{ label: 'Bağla' }, { label: '<i class="fas fa-ban"></i> Ləğv et', cls: 'btn-primary', fn: () => { const c = $('cnComment').value.trim(); closeModal(); setCancelled(ids, value, c); } }]);
}

function openTaskModal(t, preset = {}) {
  const isNew = !t;
  const d = t ? t : { company: 'Birbank', unit: 'say', ...preset };
  const dl = (id, arr) => `<datalist id="${id}">${[...new Set(arr.filter(Boolean))].sort(sortAz).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  openModal(isNew ? 'Yeni tapşırıq' : 'Tapşırığa düzəliş', `
    <div class="form-grid">
      <div class="field"><label>Şirkət</label><input class="input" id="fCompany" list="dlCo" value="${esc(d.company)}">${dl('dlCo', companies().concat(['Birbank', 'Pashapay']))}</div>
      <div class="field"><label>Proses</label><input class="input" id="fProcess" list="dlPr" value="${esc(d.process)}">${dl('dlPr', state.tasks.map(x => x.process))}</div>
      <div class="field"><label>Kateqoriya</label><input class="input" id="fCategory" list="dlCa" value="${esc(d.category)}">${dl('dlCa', state.tasks.map(x => x.category))}</div>
      <div class="field"><label>Cari icraçı</label><input class="input" id="fOwner" list="dlOw" value="${esc(isNew ? (d.owner_after || '') : curOwner(d))}">${dl('dlOw', state.employees.map(e => e.name))}</div>
      <div class="field full"><label>Tapşırıq</label><input class="input" id="fTask" value="${esc(d.task)}"></div>
      <div class="field full"><label>Qeyd / təsvir</label><input class="input" id="fDesc" value="${esc(d.description)}"></div>
      <div class="field"><label>1 əməliyyata dəqiqə</label><input class="input" type="number" step="any" id="fMin" value="${d.min_per_key ?? ''}"></div>
      <div class="field"><label>İllik təkrarlanma</label><div style="display:flex;gap:6px"><input class="input" type="number" step="any" id="fFreq" value="${d.annual_freq ?? ''}" style="flex:1"><input class="input" id="fUnit" value="${esc(d.unit || 'say')}" style="width:80px"></div></div>
      <div class="field"><label>İllik saat</label><input class="input" type="number" step="any" id="fHours" value="${d.hours ?? ''}"><span class="hint" id="fCalc"></span></div>
      <div class="field"><label>Optimizasiyadan sonra (saat)</label><input class="input" type="number" step="any" id="fOpt" value="${d.after_opt ?? ''}"></div>
      ${isNew ? '' : `<div class="field full"><label class="toggle" style="width:max-content"><input type="checkbox" id="fCancelled" ${d.is_cancelled ? 'checked' : ''}> Ləğv edilib</label></div>`}
      ${!isNew && d.owner_before ? `<div class="full hint">İlkin icraçı: <b>${esc(d.owner_before)}</b>. İcraçını dəyişsəniz, bu "Ötürmə" kimi jurnala yazılır.</div>` : ''}
    </div>`,
  [
    ...(isNew ? [] : [{ label: '<i class="fas fa-trash"></i> Sil', cls: 'btn-danger', fn: () => { if (confirm('Tapşırıq tamamilə silinsin? (Ləğv etmək adətən daha yaxşıdır.)')) { closeModal(); deleteTasks([d.id]); } } }]),
    { label: 'Bağla' },
    { label: '<i class="fas fa-check"></i> Yadda saxla', cls: 'btn-primary', fn: () => saveTaskFromModal(t) },
  ]);
  const calc = () => { const m = num($('fMin').value), f = num($('fFreq').value); $('fCalc').textContent = m != null && f != null ? `Hesablanan: ${fmt(m * f / 60, 2)} saat` : ''; };
  const autoFill = () => { const m = num($('fMin').value), f = num($('fFreq').value); if (m != null && f != null) $('fHours').value = +(m * f / 60).toFixed(2); calc(); };
  $('fMin').oninput = autoFill; $('fFreq').oninput = autoFill; calc();
}

function saveTaskFromModal(t) {
  const owner = $('fOwner').value.trim();
  const v = {
    company: $('fCompany').value.trim() || 'Birbank', process: $('fProcess').value.trim(), category: $('fCategory').value.trim(),
    task: $('fTask').value.trim(), description: $('fDesc').value.trim(), min_per_key: num($('fMin').value), annual_freq: num($('fFreq').value),
    unit: $('fUnit').value.trim() || 'say', hours: num($('fHours').value) ?? 0, after_opt: num($('fOpt').value),
  };
  if (!v.task || !v.process) return toast('Proses və tapşırıq boş ola bilməz.');
  if (!owner) return toast('İcraçını yazın.');
  closeModal();
  if (!t) {
    const nt = normalizeTask({ ...v, id: uid(), owner_before: '', owner_after: owner, updated_at: nowIso() });
    commit('Yeni tapşırıq əlavə edildi', () => { ensureEmployee(owner, v.company); state.tasks.push(nt); }, [{ action: 'Yeni', task_id: nt.id, task_label: taskLabel(nt), to: owner }]);
    return;
  }
  const logs = [];
  const prevOwner = curOwner(t);
  const cancelled = $('fCancelled') ? $('fCancelled').checked : t.is_cancelled;
  const changed = Object.keys(v).some(k => (t[k] ?? null) !== (v[k] ?? null) && String(t[k] ?? '') !== String(v[k] ?? ''));
  if (changed) logs.push({ action: 'Düzəliş', task_id: t.id, task_label: `${v.process} — ${v.task}` });
  if (owner !== prevOwner) logs.push({ action: 'Ötürmə', task_id: t.id, task_label: `${v.process} — ${v.task}`, from: prevOwner, to: owner });
  if (cancelled !== t.is_cancelled) logs.push({ action: cancelled ? 'Ləğv' : 'Bərpa', task_id: t.id, task_label: `${v.process} — ${v.task}`, from: owner });
  if (!logs.length) return;
  commit('Tapşırıq yeniləndi', () => {
    const x = state.tasks.find(y => y.id === t.id);
    Object.assign(x, v, { is_cancelled: cancelled, updated_at: nowIso() });
    if (owner !== prevOwner) { ensureEmployee(owner, v.company); if (!x.owner_before) x.owner_before = prevOwner; x.owner_after = owner; }
  }, logs);
}

function openEmployeeModal(name) {
  const isNew = !name;
  const e = state.employees.find(x => x.name === name) || { name: '', company: 'Birbank', activity: ACT_ADMIN, fte: 1, is_group: false, active: true };
  const taskCount = name ? state.tasks.filter(t => t.owner_before === name || t.owner_after === name).length : 0;
  openModal(isNew ? 'Yeni əməkdaş' : `Profil: ${name}`, `
    <div class="form-grid">
      <div class="field full"><label>Ad</label><input class="input" id="emName" value="${esc(e.name)}"></div>
      <div class="field"><label>Şirkət</label><input class="input" id="emCompany" list="dlCo2" value="${esc(e.company)}"><datalist id="dlCo2">${companies().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label>Fəaliyyət forması</label><select class="select" id="emActivity"><option ${e.activity === ACT_ADMIN ? 'selected' : ''}>${ACT_ADMIN}</option><option ${e.activity === ACT_PROJECT ? 'selected' : ''}>${ACT_PROJECT}</option></select></div>
      <div class="field"><label>Ştat (FTE)</label><input class="input" type="number" step="0.05" min="0.05" id="emFte" value="${e.fte}"><span class="hint">1 = tam ştat, 0.5 = yarım ştat</span></div>
      <div class="field"><label>Növ</label><select class="select" id="emGroup"><option value="0" ${!e.is_group ? 'selected' : ''}>Fərdi əməkdaş</option><option value="1" ${e.is_group ? 'selected' : ''}>Qrup (məs. Şöbə əməkdaşları)</option></select></div>
      ${!isNew ? `<div class="full hint">Adı dəyişsəniz, ${taskCount} tapşırıqda da yenilənəcək. Mövcud başqa adı yazsanız, iki profil birləşdiriləcək (məs. "Kamilə" → "Kamila").</div>` : ''}
    </div>`,
  [
    ...(!isNew && taskCount === 0 ? [{ label: '<i class="fas fa-trash"></i> Sil', cls: 'btn-danger', fn: () => { closeModal(); commit(`${name} silindi`, () => { state.employees = state.employees.filter(x => x.name !== name); }, [{ action: 'Əməkdaş', task_label: `${name} silindi` }]); closeDrawer(); } }] : []),
    { label: 'Bağla' },
    { label: '<i class="fas fa-check"></i> Yadda saxla', cls: 'btn-primary', fn: () => {
      const nv = { name: $('emName').value.trim(), company: $('emCompany').value.trim() || 'Birbank', activity: $('emActivity').value, fte: num($('emFte').value) || 1, is_group: $('emGroup').value === '1', active: true };
      if (!nv.name) return toast('Ad boş ola bilməz.');
      if (isNew && state.employees.some(x => x.name === nv.name)) return toast('Bu adda əməkdaş artıq var.');
      closeModal();
      if (isNew) { commit(`${nv.name} əlavə edildi`, () => state.employees.push(nv), [{ action: 'Əməkdaş', task_label: `${nv.name} əlavə edildi` }]); return; }
      const merging = nv.name !== name && state.employees.some(x => x.name === nv.name);
      commit(merging ? `${name} → ${nv.name} birləşdirildi` : `${nv.name} yeniləndi`, () => {
        state.tasks.forEach(t => { if (t.owner_before === name) t.owner_before = nv.name; if (t.owner_after === name) t.owner_after = nv.name; });
        if (merging) { state.employees = state.employees.filter(x => x.name !== name); Object.assign(state.employees.find(x => x.name === nv.name), { activity: nv.activity, fte: nv.fte, company: nv.company, is_group: nv.is_group }); }
        else Object.assign(state.employees.find(x => x.name === name), nv);
      }, [{ action: 'Əməkdaş', task_label: merging ? `${name} profili ${nv.name} ilə birləşdirildi` : `${name} profili yeniləndi`, from: name, to: nv.name !== name ? nv.name : '' }]);
      if (drawerEmp === name) drawerEmp = nv.name;
      renderAll();
    } },
  ]);
}

/* ---------------- Excel ---------------- */
const TASK_COLS = [
  ['id', 'id'], ['company', 'Şirkət'], ['activity', 'Fəaliyyət forması'], ['process', 'Proses'], ['category', 'Kateqoriya'], ['task', 'Tapşırıq'],
  ['owner_before', 'İlkin icraçı'], ['owner_after', 'Yeni icraçı'], ['current', 'Cari icraçı'], ['status', 'Status'], ['is_cancelled', 'Ləğv edilib'],
  ['min_per_key', '1 əməliyyata dəqiqə'], ['annual_freq', 'İllik təkrarlanma'], ['unit', 'Vahid'], ['hours', 'İllik saat'], ['after_opt', 'Optimizasiyadan sonra (saat)'],
  ['description', 'Qeyd'], ['updated_at', 'Son dəyişiklik'], ['updated_by', 'Dəyişən'],
];
const EMP_COLS = [['name', 'Ad'], ['company', 'Şirkət'], ['activity', 'Fəaliyyət forması'], ['fte', 'Ştat'], ['is_group', 'Qrup'], ['active', 'Aktiv']];
const ALIASES = {
  id: ['id'], company: ['şirkət', 'company', 'şirkətlər'], process: ['proses', 'process'], category: ['kateqoriya', 'category'], task: ['tapşırıq', 'task'],
  description: ['qeyd', 'description', 'təsvir', 'açıqlama'],
  owner_before: ['ilkin icraçı', 'əvvəlki icraçı', 'owner_before', 'icraçı (əvvəl)'],
  owner_after: ['yeni icraçı', 'sonrakı icraçı', 'owner_after', 'icraçı (sonra)'],
  min_per_key: ['1 əməliyyata dəqiqə', '1 key üçün dəqiqə', '1 keys üçün dəqiqə sərfi', 'min_per_key'],
  annual_freq: ['illik təkrarlanma', 'illik təkrarlanma ı', 'annual_freq', 'frequency', 'tezlik'],
  unit: ['vahid', 'unit'],
  hours: ['illik saat', 'illik sərf olunan vaxt (saat)', 'illik sərf olunan vaxt', 'hours'],
  after_opt: ['optimizasiyadan sonra (saat)', 'optimizasiyadan sonra', 'after_opt'],
  is_cancelled: ['ləğv edilib', 'is_cancelled', 'ləğv'],
};
const normH = (h) => String(h || '').replace(/İ/g, 'i').toLowerCase().normalize('NFC').replace(/\u0307/g, '').replace(/\s+/g, ' ').trim();

async function exportExcel() {
  await pull({ silent: true }).catch(() => {});
  const wb = XLSX.utils.book_new();
  const tasks = state.tasks.map(t => {
    const o = curOwner(t);
    const row = { ...t, current: o, status: statusOf(t), activity: activityOf(o), is_cancelled: t.is_cancelled ? 'Bəli' : 'Xeyr' };
    return Object.fromEntries(TASK_COLS.map(([k, h]) => [h, row[k] ?? '']));
  });
  const ws1 = XLSX.utils.json_to_sheet(tasks, { header: TASK_COLS.map(c => c[1]) });
  ws1['!cols'] = TASK_COLS.map(([k]) => ({ wch: k === 'task' ? 50 : k === 'description' ? 36 : k === 'process' ? 22 : 14 }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Tapşırıqlar');
  const ws2 = XLSX.utils.json_to_sheet(state.employees.map(e => Object.fromEntries(EMP_COLS.map(([k, h]) => [h, typeof e[k] === 'boolean' ? (e[k] ? 'Bəli' : 'Xeyr') : e[k]]))), { header: EMP_COLS.map(c => c[1]) });
  XLSX.utils.book_append_sheet(wb, ws2, 'Əməkdaşlar');
  const loads = employeeLoads('all', 'all', false).sort((a, b) => b.load - a.load).map(r => ({
    'Əməkdaş': r.name, 'Şirkət': r.emp.company, 'Fəaliyyət forması': r.emp.activity, 'Ştat': r.isGroup ? '' : r.fte, 'Tapşırıq sayı': r.tasks,
    'Əvvəl (saat)': +r.before.toFixed(2), 'İndi (saat)': +r.hours.toFixed(2), 'Norma (saat)': r.isGroup ? '' : r.cap, 'Boş tutum (saat)': r.isGroup ? '' : +r.free.toFixed(2), 'Yük (%)': r.isGroup ? '' : +(r.load * 100).toFixed(1),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(loads), 'Yük analizi');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.log.map(l => ({ 'Tarix': l.ts, 'İstifadəçi': l.user || '', 'Əməliyyat': l.action, 'Tapşırıq': l.task_label, 'id': l.task_id, 'Kimdən': l.from, 'Kimə': l.to, 'Şərh': l.comment }))), 'Jurnal');
  XLSX.writeFile(wb, `workforce-planning-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
function exportTemplate() {
  const wb = XLSX.utils.book_new();
  const cols = TASK_COLS.filter(([k]) => !['activity', 'current', 'status', 'updated_at', 'updated_by'].includes(k)).map(c => c[1]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols]), 'Tapşırıqlar');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([EMP_COLS.map(c => c[1])]), 'Əməkdaşlar');
  XLSX.writeFile(wb, 'workforce-planning-sablon.xlsx');
}

function parseRows(rows) {
  if (!rows.length) return [];
  const map = {};
  Object.keys(rows[0]).forEach(h => {
    const n = normH(h);
    for (const [k, al] of Object.entries(ALIASES)) if (al.includes(n)) { map[h] = k; break; }
  });
  return rows.map(r => {
    const o = {};
    for (const [h, k] of Object.entries(map)) o[k] = r[h];
    // "24 say", "İldə 1 dəfə" kimi tezlik yazılışları
    if (o.annual_freq != null && typeof o.annual_freq === 'string') {
      const s = o.annual_freq.trim(); const m = s.match(/[\d.,]+/);
      if (m) { o.annual_freq = num(m[0]); if (!o.unit) o.unit = s.replace(m[0], '').replace(/^ildə\s*/i, '').trim() || 'say'; } else o.annual_freq = null;
    }
    return o;
  }).filter(o => o.task || o.process);
}

async function handleImport(file) {
  // Ən son vəziyyətlə müqayisə etmək üçün əvvəlcə Sheet-dən yenilə
  await pull({ silent: true }).catch(() => {});
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const tName = wb.SheetNames.find(n => /tap[şs]ır/i.test(n)) || wb.SheetNames[0];
  const tasks = parseRows(XLSX.utils.sheet_to_json(wb.Sheets[tName], { defval: '' }));
  const eName = wb.SheetNames.find(n => /əməkdaş|emekdas|employee/i.test(n));
  let emps = [];
  if (eName) {
    emps = XLSX.utils.sheet_to_json(wb.Sheets[eName], { defval: '' }).map(r => {
      const g = (...ks) => { for (const k of Object.keys(r)) if (ks.includes(normH(k))) return r[k]; return ''; };
      return normalizeEmployee({ name: g('ad', 'name'), company: g('şirkət', 'company'), activity: g('fəaliyyət forması', 'activity'), fte: g('ştat', 'fte'), is_group: g('qrup', 'is_group'), active: g('aktiv', 'active') });
    }).filter(e => e.name);
  }
  if (!tasks.length) return toast(`"${tName}" vərəqində tapşırıq tapılmadı. Sütun adlarını yoxlayın (şablonu yükləyə bilərsiniz).`);
  const withId = tasks.filter(t => t.id && state.tasks.some(x => x.id === String(t.id))).length;
  openModal('Excel import', `
    <p style="margin-top:0"><b>${esc(file.name)}</b>: “${esc(tName)}” vərəqində <b>${tasks.length}</b> tapşırıq${emps.length ? `, “${esc(eName)}” vərəqində <b>${emps.length}</b> əməkdaş` : ''} tapıldı.</p>
    <div class="field"><label>Necə yüklənsin?</label>
      <select class="select" id="imMode">
        <option value="merge">Yenilə və əlavə et — eyni id-li ${withId} tapşırıq yenilənir, qalanlar əlavə olunur</option>
        <option value="replace">Əvəz et — mövcud ${state.tasks.length} tapşırıq silinir, fayldakılar yazılır</option>
      </select></div>
    <div class="field" style="margin-top:12px"><label>Şirkət sütunu boş olanlar üçün</label><input class="input" id="imCompany" list="dlCo3" value="Birbank"><datalist id="dlCo3">${companies().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <p class="hint">Import “Geri al” ilə geri qaytarıla bilər. Əvvəlcə Excel export ilə ehtiyat nüsxə götürmək tövsiyə olunur.</p>`,
  [{ label: 'Bağla' }, { label: '<i class="fas fa-file-import"></i> Yüklə', cls: 'btn-primary', fn: () => {
    const mode = $('imMode').value, co = $('imCompany').value.trim() || 'Birbank';
    closeModal();
    commit(`Import: ${tasks.length} tapşırıq (${mode === 'replace' ? 'əvəz' : 'yenilə/əlavə'})`, () => {
      const incoming = tasks.map(t => normalizeTask({ ...t, company: t.company || co, id: t.id ? String(t.id) : uid(), updated_at: nowIso() }));
      if (mode === 'replace') state.tasks = incoming;
      else incoming.forEach(n => { const i = state.tasks.findIndex(x => x.id === n.id); if (i >= 0) state.tasks[i] = n; else state.tasks.push(n); });
      emps.forEach(e => { const i = state.employees.findIndex(x => x.name === e.name); if (i >= 0) state.employees[i] = e; else state.employees.push(e); });
      incoming.forEach(t => { ensureEmployee(t.owner_before, t.company); ensureEmployee(t.owner_after, t.company); });
    }, [{ action: 'Import', task_label: `${file.name}: ${tasks.length} tapşırıq, ${emps.length} əməkdaş (${mode === 'replace' ? 'əvəz' : 'yenilə/əlavə'})` }]);
  } }]);
}

/* ---------------- events ---------------- */
function bind() {
  $('tabs').querySelectorAll('.tab').forEach(t => t.onclick = () => {
    $('tabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    if ($('loading').classList.contains('hidden')) document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + t.dataset.view));
    $('pageTitle').textContent = t.dataset.title;
    renderAll(); window.scrollTo(0, 0);
  });
  ['dCompany', 'dActivity', 'dOpt'].forEach(id => $(id).onchange = renderDashboard);
  ['eCompany', 'eActivity', 'eSort'].forEach(id => $(id).onchange = renderEmployees); $('eSearch').oninput = renderEmployees;
  ['tCompany', 'tProcess', 'tOwner', 'tStatus', 'tActivity'].forEach(id => $(id).onchange = renderTasks); $('tSearch').oninput = renderTasks;
  $('tReset').onclick = () => { $('tSearch').value = ''; ['tCompany', 'tProcess', 'tOwner', 'tStatus', 'tActivity'].forEach(id => $(id).value = 'all'); renderTasks(); };
  $('lAction').onchange = renderLog; $('lUser').onchange = renderLog; $('lSearch').oninput = renderLog;
  $('addTaskBtn').onclick = () => openTaskModal(null);
  $('addEmpBtn').onclick = () => openEmployeeModal(null);
  $('undoBtn').onclick = undo;
  $('exportBtn').onclick = exportExcel;
  $('templateBtn').onclick = exportTemplate;
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) handleImport(f).catch(err => { console.error(err); toast('Fayl oxunmadı: ' + err.message); }); };
  $('drawerOverlay').onclick = closeDrawer;
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal') || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('modal').classList.contains('open')) closeModal(); else closeDrawer(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
  });
  // bulk
  const ids = () => [...selected];
  $('bulkTransfer').onclick = () => openTransferModal(ids(), 'seçilənlər');
  $('bulkCancel').onclick = () => openCancelModal(ids(), true);
  $('bulkRestore').onclick = () => setCancelled(ids(), false, '');
  $('bulkDelete').onclick = () => { if (confirm(`${selected.size} tapşırıq tamamilə silinsin?`)) { deleteTasks(ids()); selected.clear(); updateBulk(); } };
  $('bulkClear').onclick = () => { selected.clear(); renderAll(); updateBulk(); };
  // settings
  $('saveNormBtn').onclick = () => {
    const n = num($('sNorm').value), w = num($('sWarn').value);
    if (!n || n <= 0) return toast('Norma müsbət rəqəm olmalıdır.');
    const warn = w && w > 0 && w <= 100 ? w : 85;
    commit('Norma yeniləndi', () => { state.settings.norm = n; state.settings.warn = warn; }, [{ action: 'Ayarlar', task_label: `Norma: ${n} saat, yüksək yük həddi: ${warn}%` }]);
  };
  $('refreshBtn').onclick = () => { lastServerHash = ''; pull().then(() => toast('Sheet-dən yeniləndi.')).catch(e => { setSync('err', 'Xəta'); toast(e.message); }); };
  $('seedBtn').onclick = async () => {
    $('seedBtn').disabled = true;
    try { await api('/api/seed', { method: 'POST' }); lastServerHash = ''; await pull(); toast('İlkin məlumatlar Sheet-ə yazıldı.'); }
    catch (e) { toast(e.message); }
    $('seedBtn').disabled = false;
  };
  const logout = async () => { try { await api('/api/logout', { method: 'POST' }); } catch (e) {} localStorage.removeItem(CACHE_KEY); location.href = '/login.html'; };
  $('logoutBtn').onclick = logout; $('logoutBtn2').onclick = logout;
  // Başqalarının dəyişikliklərini avtomatik gətir
  setInterval(() => { if (document.visibilityState === 'visible' && !$('modal').classList.contains('open')) pull({ silent: true }).catch(() => {}); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull({ silent: true }).catch(() => {}); });
  window.addEventListener('beforeunload', (e) => { if (queue.length || sending) { e.preventDefault(); e.returnValue = ''; } });
}

/* ---------------- init ---------------- */
async function init() {
  state = emptyState();
  const cache = loadCache();
  bind();
  if (cache) { me = cache.me; state = cache.state; state.settings = { ...DEFAULT_SETTINGS, ...state.settings }; showApp(); renderAll(); }
  try { await pull({ silent: !!cache }); showApp(); }
  catch (e) {
    console.error(e); setSync('err', 'Bağlantı xətası');
    if (!cache) $('loading').innerHTML = `<div class="empty"><b>Sheet-ə qoşulmaq alınmadı</b><br>${esc(e.message)}</div>`;
    else toast('Sheet-ə qoşulmaq alınmadı, son yüklənmiş nüsxə göstərilir: ' + e.message);
  }
}
function showApp() {
  $('loading').classList.add('hidden');
  if (!document.querySelector('.view:not(.hidden)')) $('view-' + currentView()).classList.remove('hidden');
  $('userName').textContent = me || '—';
  $('userAv').textContent = (me || '·').charAt(0).toUpperCase();
}
document.addEventListener('DOMContentLoaded', init);
})();
