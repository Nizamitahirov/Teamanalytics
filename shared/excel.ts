// Excel v2 (SPEC §9) — saf hissə: export vərəqləri (2D massiv), sütun xəritəsi, validasiya, import diff.
// SheetJS-dən asılı deyil (brauzerdə src/lib/excel.ts çevirir) — node testlərində yoxlanılır.
// Import HEÇ VAXT kolleksiyanı əvəz etmir: nəticə yeni vəziyyətdir, yazma diffOps ilə gedir (CLAUDE.md §6).
import { ACT_ADMIN } from './constants.js';
import { fmtFte } from './format.js';
import type { Metrics } from './metrics.js';
import { curOwner, normalizeEmployee, normalizeTask, statusOf, type EmployeeDoc, type TaskDoc } from './model.js';
import type { Snapshot } from './apply.js';
import type { LogEntry, Scenario } from './schema.js';
import type { StaffRow } from './dashboard.js';

/* ---------- sütunlar (v1 ilə eyni başlıqlar — köhnə fayllar və şablon uyğun qalır) ---------- */
export const TASK_COLS = [
  ['id', 'id'],
  ['company', 'Şirkət'],
  ['activity', 'Fəaliyyət forması'],
  ['process', 'Proses'],
  ['category', 'Kateqoriya'],
  ['task', 'Tapşırıq'],
  ['owner_before', 'İlkin icraçı'],
  ['owner_after', 'Yeni icraçı'],
  ['current', 'Cari icraçı'],
  ['status', 'Status'],
  ['is_cancelled', 'Ləğv edilib'],
  ['min_per_key', '1 əməliyyata dəqiqə'],
  ['annual_freq', 'İllik təkrarlanma'],
  ['unit', 'Vahid'],
  ['hours', 'İllik saat'],
  ['after_opt', 'Optimizasiyadan sonra (saat)'],
  ['description', 'Qeyd'],
  ['automation', 'Optimizasiya statusu'],
  ['due_quarter', 'Hədəf rüb'],
  ['updated_at', 'Son dəyişiklik'],
  ['updated_by', 'Dəyişən'],
] as const;
export const EMP_COLS = [
  ['name', 'Ad'],
  ['company', 'Şirkət'],
  ['activity', 'Fəaliyyət forması'],
  ['fte', 'Ştat'],
  ['is_group', 'Qrup'],
  ['active', 'Aktiv'],
] as const;

/** Import edilə bilən tapşırıq sahələri (hesablanmış sütunlar — cari icraçı, status, fəaliyyət — import olunmur). */
export const IMPORT_FIELDS = [
  'id',
  'company',
  'process',
  'category',
  'task',
  'description',
  'owner_before',
  'owner_after',
  'min_per_key',
  'annual_freq',
  'unit',
  'hours',
  'after_opt',
  'is_cancelled',
  'automation',
  'due_quarter',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** v1 alias-ları + docs/CONTEXT.md §2 mənbə cədvəllərinin başlıqları. */
export const ALIASES: Record<ImportField, string[]> = {
  id: ['id', 'ид', '№'],
  company: ['şirkət', 'company', 'şirkətlər'],
  process: ['proses', 'process'],
  category: ['kateqoriya', 'category'],
  task: ['tapşırıq', 'task', 'tapşırıqlar'],
  description: ['qeyd', 'description', 'təsvir', 'açıqlama'],
  owner_before: ['ilkin icraçı', 'əvvəlki icraçı', 'owner_before', 'icraçı (əvvəl)', 'icraçı'],
  owner_after: ['yeni icraçı', 'sonrakı icraçı', 'owner_after', 'icraçı (sonra)'],
  min_per_key: ['1 əməliyyata dəqiqə', '1 key üçün dəqiqə', '1 keys üçün dəqiqə sərfi', '1 keys üçün dəqiqə', 'min_per_key'],
  annual_freq: ['illik təkrarlanma', 'illik təkrarlanma ı', 'annual_freq', 'frequency', 'tezlik'],
  unit: ['vahid', 'unit'],
  hours: ['illik saat', 'illik sərf olunan vaxt (saat)', 'illik sərf olunan vaxt', 'hours', 'saat/il'],
  after_opt: ['optimizasiyadan sonra (saat)', 'optimizasiyadan sonra', 'after_opt', 'opt. sonra'],
  is_cancelled: ['ləğv edilib', 'is_cancelled', 'ləğv'],
  automation: ['optimizasiya statusu', 'automation'],
  due_quarter: ['hədəf rüb', 'due_quarter'],
};

/**
 * Başlıq normallaşdırması. "İ" → "i" ƏVVƏLCƏ: JS-də "İ".toLowerCase() = "i̇" (i + U+0307) olur və
 * "İllik saat" tanınmırdı (v1-də tapılmış bug — reqressiya testi tests/unit/excel.test.ts).
 */
export const headerKey = (h: unknown) =>
  String(h ?? '')
    .replace(/İ/g, 'i') // İ
    .toLowerCase()
    .normalize('NFC')
    .replace(/̇/g, '') // birləşən nöqtə
    // "İCRAÇI".toLowerCase() = "icraçi" (ı yox) — hər iki tərəfdə ı → i (böyük/kiçik hərfdən asılı olmasın)
    .replace(/ı/g, 'i')
    .replace(/[:*]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export type Mapping = (ImportField | '')[];
const ALIAS_KEYS = Object.fromEntries(Object.entries(ALIASES).map(([k, v]) => [k, v.map((a) => headerKey(a))])) as Record<
  ImportField,
  string[]
>;

/** Başlıqlardan avtomatik sütun xəritəsi: başlıq indeksi → sahə ('' = nəzərə alınmır). Hər sahə bir dəfə. */
export function detectMapping(headers: readonly unknown[]): Mapping {
  const used = new Set<string>();
  return headers.map((h) => {
    const k = headerKey(h);
    const f = (Object.keys(ALIASES) as ImportField[]).find((x) => ALIAS_KEYS[x].includes(k) && !used.has(x));
    if (!f) return '';
    used.add(f);
    return f;
  });
}

/** Saxlanan xəritənin açarı — eyni başlıqlı fayl gələndə istifadəçinin əl düzəlişi təkrar tətbiq olunur. */
export const mappingSignature = (headers: readonly unknown[]) => headers.map(headerKey).join('|');

/* ---------- validasiya ---------- */
/** Xəta mətnlərində sahənin istifadəçiyə tanış adı (export başlığı) */
const LABEL: Record<string, string> = Object.fromEntries(TASK_COLS.map(([k, h]) => [k, h]));
export type ParsedRow = { row: number; data: Partial<Record<ImportField, string | number | boolean | null>>; errors: string[] };

const toNum = (v: unknown): number | null | 'bad' => {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 'bad';
  const n = Number(
    String(v)
      .trim()
      .replace(/[\s\u202F]/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? n : 'bad';
};
const toBool = (v: unknown): boolean | 'bad' => {
  if (v === '' || v == null) return false;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (/^(bəli|beli|true|1|yes|hə|x|✓)$/.test(s)) return true;
  if (/^(xeyr|false|0|no|yox|-)$/.test(s)) return false;
  return 'bad';
};
const AUTOMATION_LABELS: Record<string, string> = {
  none: 'none',
  namizəd: 'candidate',
  candidate: 'candidate',
  icrada: 'in_progress',
  in_progress: 'in_progress',
  tamamlandı: 'done',
  done: 'done',
  'rədd edildi': 'rejected',
  rejected: 'rejected',
  'portfeldə deyil': 'none',
};

/**
 * Vərəqi (ilk sətir başlıq) sətirlərə çevirir və yoxlayır. `row` — Excel sətir nömrəsi (başlıq = 1).
 * Boş sətirlər atılır. Rəqəm sahələri "1 234,5" kimi yazılışı da qəbul edir; tezlik "24 say", "İldə 1 dəfə" (v1 kimi).
 */
export function parseSheet(aoa: readonly (readonly unknown[])[], mapping: Mapping): ParsedRow[] {
  const out: ParsedRow[] = [];
  const seenIds = new Map<string, number>();
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (!r.some((c) => String(c ?? '').trim() !== '')) continue;
    const data: ParsedRow['data'] = {};
    const errors: string[] = [];
    mapping.forEach((f, j) => {
      if (!f) return;
      const v = r[j];
      switch (f) {
        case 'min_per_key':
        case 'hours':
        case 'after_opt': {
          const n = toNum(v);
          if (n === 'bad') errors.push(`"${String(v)}" rəqəm deyil (${LABEL[f]})`);
          else if (n != null && n < 0) errors.push(`Mənfi dəyər (${LABEL[f]})`);
          else data[f] = n;
          break;
        }
        case 'annual_freq': {
          const s = String(v ?? '').trim();
          const m = typeof v === 'number' ? null : s.match(/[\d.,]+/);
          const n = typeof v === 'number' ? v : m ? toNum(m[0]) : s ? 'bad' : null;
          if (n === 'bad') errors.push(`"${s}" tezlik deyil`);
          else data.annual_freq = n;
          if (m && !data.unit) {
            const unit = s
              .replace(m[0], '')
              .replace(/^ildə\s*/i, '')
              .trim();
            if (unit) data.unit = unit;
          }
          break;
        }
        case 'is_cancelled': {
          if (v === '' || v == null) break; // boş = dəyişmə
          const b = toBool(v);
          if (b === 'bad') errors.push(`"${String(v)}" — "Bəli" və ya "Xeyr" olmalıdır (ləğv)`);
          else data.is_cancelled = b;
          break;
        }
        case 'automation': {
          const s = String(v ?? '')
            .trim()
            .toLowerCase();
          if (s && !AUTOMATION_LABELS[s]) errors.push(`"${String(v)}" — naməlum optimizasiya statusu`);
          else if (s) data.automation = AUTOMATION_LABELS[s];
          break;
        }
        case 'due_quarter': {
          const s = String(v ?? '')
            .trim()
            .toUpperCase();
          if (s && !/^\d{4}-Q[1-4]$/.test(s)) errors.push(`"${s}" — rüb "2027-Q1" formatında olmalıdır`);
          else data.due_quarter = s;
          break;
        }
        default:
          data[f] = String(v ?? '').trim();
      }
    });
    const id = String(data.id ?? '').trim();
    if (id) {
      if (id.includes('/')) errors.push('ID-də "/" ola bilməz');
      if (seenIds.has(id)) errors.push(`ID ${id} faylda təkrarlanır (sətir ${seenIds.get(id)})`);
      else seenIds.set(id, i + 1);
    }
    out.push({ row: i + 1, data, errors });
  }
  return out;
}

/* ---------- import diff (önizləmə) ---------- */
export type FieldChange = { field: string; from: unknown; to: unknown };
export type ImportPlan = {
  created: TaskDoc[];
  changed: { id: string; label: string; fields: FieldChange[] }[];
  unchanged: number;
  deleted: TaskDoc[];
  errors: { row: number; errors: string[] }[];
  newEmployees: string[];
  /** Tətbiqdən sonrakı vəziyyət (yazma bundan diffOps ilə yaranır) */
  next: Snapshot;
};
export type ImportMode = 'merge' | 'replace';

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a ?? '') === String(b ?? '');

/**
 * Faylın sətirlərini cari vəziyyətlə müqayisə edir.
 * - id mövcuddursa → yalnız fayldakı (xəritədəki) DOLU xanalar yenilənir; boş xana və xəritədə olmayan sütun = dəyişmə;
 * - id yoxdursa / tapılmırsa → yeni tapşırıq (id verilməyibsə `T-…`);
 * - `replace` (yalnız admin): faylda olmayan tapşırıqlar SİLİNİR (yumşaq, geri alınır);
 * - xətalı sətirlər heç vaxt tətbiq olunmur.
 */
export function importPlan(
  live: Snapshot,
  rows: readonly ParsedRow[],
  { mode = 'merge', defaultCompany = 'Birbank', newId }: { mode?: ImportMode; defaultCompany?: string; newId: () => string },
): ImportPlan {
  const byId = new Map(live.tasks.map((t) => [t.id, t]));
  const tasks = new Map(live.tasks.map((t) => [t.id, t]));
  const plan: ImportPlan = { created: [], changed: [], unchanged: 0, deleted: [], errors: [], newEmployees: [], next: live };
  const now = new Date().toISOString();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.errors.length) {
      plan.errors.push({ row: r.row, errors: r.errors });
      continue;
    }
    const d = { ...r.data };
    // Saat boşdursa dəqiqə × tezlik / 60
    if (d.hours == null && typeof d.min_per_key === 'number' && typeof d.annual_freq === 'number')
      d.hours = Math.round(((d.min_per_key * d.annual_freq) / 60) * 100) / 100;
    // Boş xana = "dəyişmə" (mövcud tapşırıqda); null sahələr yazılmır
    if (d.hours == null) delete d.hours;
    const id = String(d.id ?? '').trim();
    const cur = id ? byId.get(id) : undefined;
    if (!cur) {
      // Yeni sətir üçün məcburi sahələr (mövcud tapşırığı yeniləmək üçün id + dəyişən sütun kifayətdir)
      const errs: string[] = [];
      if (!String(d.task ?? '').trim() && !String(d.process ?? '').trim()) errs.push('Tapşırıq və proses boşdur');
      if (d.hours == null) errs.push('Saat boşdur (və dəqiqə × tezlik ilə hesablana bilmir)');
      if (errs.length) {
        plan.errors.push({ row: r.row, errors: errs });
        continue;
      }
    }
    if (cur) {
      seen.add(id);
      const fields: FieldChange[] = [];
      for (const [f, v] of Object.entries(d)) {
        // Boş xana = "dəyişmə" (heç nə itmir — SPEC §1.3); dəyəri silmək üçün tapşırıq panelindən istifadə olunur
        if (f === 'id' || v === null || v === '') continue;
        const val = v;
        if (!same((cur as Record<string, unknown>)[f], val))
          fields.push({ field: f, from: (cur as Record<string, unknown>)[f], to: val });
      }
      if (!fields.length) {
        plan.unchanged++;
        continue;
      }
      const next = {
        ...normalizeTask({ ...cur, ...Object.fromEntries(fields.map((x) => [x.field, x.to])), updated_at: now }),
        _v: cur._v,
      };
      tasks.set(id, next);
      plan.changed.push({ id, label: `${next.process} — ${next.task}`, fields });
      continue;
    }
    const nid = id || newId();
    const t = { ...normalizeTask({ ...d, id: nid, company: d.company || defaultCompany, updated_at: now }), _v: 0 };
    tasks.set(nid, t);
    seen.add(nid);
    plan.created.push(t);
  }
  if (mode === 'replace')
    for (const t of live.tasks)
      if (!seen.has(t.id)) {
        tasks.delete(t.id);
        plan.deleted.push(t);
      }
  // İcraçılar əməkdaş siyahısında yoxdursa — yaradılır (v1 davranışı)
  const emps: EmployeeDoc[] = [...live.employees];
  const names = new Set(emps.map((e) => e.name));
  for (const t of [...plan.created, ...plan.changed.map((c) => tasks.get(c.id)!)])
    for (const n of [t.owner_before, t.owner_after])
      if (n && !names.has(n)) {
        names.add(n);
        plan.newEmployees.push(n);
        emps.push({ ...normalizeEmployee({ name: n, company: t.company, activity: ACT_ADMIN }), _v: 0 });
      }
  plan.next = { ...live, tasks: [...tasks.values()], employees: emps };
  return plan;
}

/* ---------- export (SPEC §9) ---------- */
export type SheetSpec = {
  name: string;
  rows: (string | number | null)[][];
  /** Sütun enləri (simvol) */
  widths: number[];
  /** Rəqəm formatı tətbiq olunan sütunlar → format */
  numFmt?: Record<number, string>;
};
const H = '#,##0.0';
const P = '0.0%';

export function exportSheets({
  state,
  m,
  staff,
  log,
  user,
  filtersLabel,
  activityOf,
  scenario,
  now = new Date(),
}: {
  state: Snapshot;
  m: Metrics;
  staff: StaffRow[];
  log: readonly LogEntry[];
  user: string;
  filtersLabel: string;
  activityOf: (name: string) => string;
  scenario?: { sc: Scenario; next: Metrics } | null;
  now?: Date;
}): SheetSpec[] {
  const yn = (b: boolean) => (b ? 'Bəli' : 'Xeyr');
  const taskRow = (t: TaskDoc) => {
    const o = curOwner(t);
    const row: Record<string, unknown> = {
      ...t,
      current: o,
      status: statusOf(t),
      activity: activityOf(o),
      is_cancelled: yn(t.is_cancelled),
    };
    return TASK_COLS.map(([k]) => {
      const v = row[k];
      return typeof v === 'number' ? v : v == null ? '' : String(v);
    });
  };
  const sheets: SheetSpec[] = [
    {
      name: 'Hesabat',
      widths: [38, 22, 60],
      rows: [
        ['Workforce Planning — Əmək Münasibətləri', '', ''],
        ['Tarix', now.toISOString().slice(0, 16).replace('T', ' '), ''],
        ['Hazırlayan', user, ''],
        ['Filtrlər', filtersLabel, ''],
        ['', '', ''],
        ['Göstərici', 'Dəyər', 'İzah'],
        ['İllik norma (saat/ştat)', m.normGross, ''],
        ['Məzuniyyət (saat)', m.vacationHours, `${m.vacationDays} təqvim günü × 8 saat`],
        ['Effektiv norma (saat/ştat)', m.norm, 'Yük və ştat ehtiyacı bununla hesablanır'],
        ['İllik iş həcmi (saat)', round(m.totalHours), `${m.activeTasks} aktiv tapşırıq`],
        ['Lazım olan ştat (FTE)', round(m.fteNeed, 2), 'iş həcmi ÷ effektiv norma'],
        ['Mövcud ştat (FTE)', round(m.fteHave, 2), `${m.people.length} nəfər tapşırıq icra edir`],
        [m.gap >= 0 ? 'Ehtiyat (FTE)' : 'Çatışmazlıq (FTE)', round(m.gap, 2), ''],
        ['Normanı aşan (nəfər)', m.over.length, m.over.map((o) => `${o.name} ${Math.round(o.load * 100)}%`).join(', ')],
        ['Ləğvdən qənaət (saat)', round(m.cancelled.hours), `${m.cancelled.count} iş`],
        ['Ötürülmüş işlər', m.transfers.count, `${round(m.transfers.hours)} saat`],
        ['Optimizasiya potensialı (saat)', round(m.optPotential), `${fmtFte(m.optPotential / m.norm, 2)} FTE`],
        ['Realizə olunmuş qənaət (saat)', round(m.optRealized), ''],
      ],
      numFmt: { 1: '#,##0.##' },
    },
    {
      name: 'Tapşırıqlar',
      widths: TASK_COLS.map(([k]) => (k === 'task' ? 50 : k === 'description' ? 36 : k === 'process' ? 22 : 14)),
      rows: [TASK_COLS.map(([, h]) => h), ...state.tasks.map(taskRow)],
      numFmt: Object.fromEntries(
        TASK_COLS.flatMap(([k], i) => (k === 'hours' || k === 'after_opt' || k === 'min_per_key' ? [[i, H]] : [])),
      ),
    },
    {
      name: 'Əməkdaşlar',
      widths: [24, 12, 26, 8, 8, 8],
      rows: [
        EMP_COLS.map(([, h]) => h),
        ...state.employees.map((e) =>
          EMP_COLS.map(([k]) => (typeof e[k] === 'boolean' ? yn(e[k] as boolean) : (e[k] as string | number))),
        ),
      ],
    },
    {
      name: 'Yük analizi',
      widths: [24, 12, 26, 8, 12, 12, 18, 14, 10],
      rows: [
        [
          'Əməkdaş',
          'Şirkət',
          'Fəaliyyət forması',
          'Ştat',
          'Tapşırıq sayı',
          'İndi (saat)',
          'Effektiv norma (saat)',
          'Boş tutum (saat)',
          'Yük',
        ],
        ...staff.map((r) => [
          r.name,
          r.company,
          r.activity,
          r.isGroup ? '' : r.fte,
          r.tasks,
          round(r.hours, 2),
          r.isGroup ? '' : round(r.cap, 2),
          r.isGroup ? '' : round(r.free, 2),
          r.isGroup || !Number.isFinite(r.load) ? '' : round(r.load, 4),
        ]),
      ],
      numFmt: { 5: H, 6: H, 7: H, 8: P },
    },
    {
      name: 'Jurnal',
      widths: [20, 14, 16, 50, 16, 16, 16, 30],
      rows: [
        ['Tarix', 'İstifadəçi', 'Əməliyyat', 'Tapşırıq', 'id', 'Kimdən', 'Kimə', 'Şərh'],
        ...[...log]
          .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
          .map((l) => [
            l.ts,
            l.user ?? '',
            l.action,
            l.task_label ?? '',
            l.task_id ?? '',
            l.from ?? '',
            l.to ?? '',
            l.comment ?? '',
          ]),
      ],
    },
  ];
  if (scenario) {
    const { sc, next } = scenario;
    sheets.push({
      name: 'Ssenari',
      widths: [40, 16, 16, 12],
      rows: [
        ['Ssenari', sc.name, '', ''],
        ['Status', sc.status, '', ''],
        ['', '', '', ''],
        ['Göstərici', 'Cari', 'Ssenari', 'Δ'],
        ...(
          [
            ['İllik iş həcmi (saat)', m.totalHours, next.totalHours],
            ['Lazım olan ştat (FTE)', m.fteNeed, next.fteNeed],
            ['Mövcud ştat (FTE)', m.fteHave, next.fteHave],
            ['Ehtiyat (FTE)', m.gap, next.gap],
            ['Normanı aşan (nəfər)', m.over.length, next.over.length],
          ] as [string, number, number][]
        ).map(([k, a, b]) => [k, round(a, 2), round(b, 2), round(b - a, 2)]),
        ['', '', '', ''],
        ['Dəyişikliklər', '', '', ''],
        ...sc.changes.map((c, i) => [`${i + 1}. ${c.label}`, c.kind, '', '']),
      ],
    });
  }
  return sheets;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** CSV (UTF-8 BOM, ";" ayırıcı — Excel-in az/ru lokalı vergülü onluq ayırıcı kimi işlədir). */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  const cell = (v: unknown) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
