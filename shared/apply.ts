// Op-ların tətbiqi — server və klient EYNİ kod (SPEC §6.5): ssenari datası = baza (cari) + op-ların lokal tətbiqi.
// Burada həm də versiya ziddiyyətinin həlli (resolveVersions, SPEC §4.3) var: server /api/ops tranzaksiyasında,
// klient isə ssenarini tətbiq etməzdən əvvəl "ssenari yaradılandan sonra dəyişmiş sənədləri" eyni qayda ilə tapır.
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from './constants.js';
import {
  EMP_FIELDS,
  META_FIELDS,
  normalizeEmployee,
  normalizeTask,
  TASK_FIELDS,
  type DataState,
  type EmployeeDoc,
  type TaskDoc,
} from './model.js';
import type { Conflict, Op, Settings } from './schema.js';

export type Scalar = string | number | boolean | null;
/** Serverdəki sənəd (sahələr + sistem sahələri `_id`, `_v`, `_deleted`). */
export type Doc = Record<string, Scalar> & { _id: string };
export type Snapshot = Omit<DataState, 'log'>;
type VersionedOp = Extract<Op, { table: 'Tasks' | 'Employees' }>;

/** Sənədə aid op-un açarı (log və Settings üçün `null`). */
export const opKey = (op: Op): string | null => {
  if (op.t === 'log' || op.table === 'Settings') return null;
  return String(op.t === 'delete' ? op.key : op.table === 'Tasks' ? op.row.id : op.row.name).trim();
};
export const opDocId = (op: Op): string | null => {
  const k = opKey(op);
  return k == null ? null : `${(op as VersionedOp).table}/${k}`;
};

/**
 * Op-ları lokal vəziyyətə tətbiq edir (saf funksiya; giriş dəyişmir).
 * - upsert: yalnız göndərilən sahələr dəyişir (server `updateMask` ilə eyni semantika).
 * - Sənəd ssenari yazılanda VAR idi (`v > 0`), indi isə silinibsə — op atılır (yarımçıq sənəd yaranmasın).
 * - log op-ları vəziyyətə təsir etmir.
 */
export function applyOpsLocal(state: Snapshot, ops: readonly Op[]): Snapshot {
  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  const emps = new Map(state.employees.map((e) => [e.name, e]));
  let settings: Settings = state.settings;
  for (const op of ops) {
    if (op.t === 'log') continue;
    if (op.table === 'Settings') {
      if (op.t !== 'upsert') continue;
      const n = Number(op.row.value);
      if (Number.isFinite(n) && (SETTINGS_KEYS as readonly string[]).includes(op.row.key))
        settings = { ...settings, [op.row.key]: n };
      continue;
    }
    const key = opKey(op) as string;
    const map = (op.table === 'Tasks' ? tasks : emps) as Map<string, TaskDoc | EmployeeDoc>;
    if (op.t === 'delete') {
      map.delete(key);
      continue;
    }
    const cur = map.get(key);
    if (!cur && (op.v ?? 0) > 0) continue;
    const merged = { ...(cur ?? {}), ...op.row } as Record<string, unknown>;
    map.set(
      key,
      op.table === 'Tasks' ? { ...normalizeTask(merged), _v: cur?._v ?? 0 } : { ...normalizeEmployee(merged), _v: cur?._v ?? 0 },
    );
  }
  return { tasks: [...tasks.values()], employees: [...emps.values()], settings: { ...DEFAULT_SETTINGS, ...settings } };
}

/**
 * Bir neçə dəyişikliyin op-larını sənəd üzrə birləşdirir (ssenari tətbiqi üçün bir partiya):
 * eyni sənədin upsert-ləri bir sətrə yığılır, `v` — ilk op-unku (ssenarinin gördüyü versiya),
 * `base` — hər sahənin İLK köhnə dəyəri. Sonra silinən sənəd → yalnız delete. Yaradılıb silinən → heç nə.
 */
export function compileOps(ops: readonly Op[]): Op[] {
  type Acc = { op: VersionedOp; created: boolean };
  const docs = new Map<string, Acc>();
  const order: string[] = [];
  const rest: Op[] = [];
  let settings: Record<string, Op> = {};
  for (const op of ops) {
    if (op.t === 'log') {
      rest.push(op);
      continue;
    }
    if (op.table === 'Settings') {
      if (op.t === 'upsert') settings = { ...settings, [op.row.key]: op };
      continue;
    }
    const id = opDocId(op) as string;
    const prev = docs.get(id);
    if (!prev) {
      order.push(id);
      docs.set(id, {
        op: structuredClone(op) as VersionedOp,
        created: op.t === 'upsert' && (op.v ?? 0) === 0 && !Object.keys(op.base ?? {}).length,
      });
      continue;
    }
    if (op.t === 'delete') {
      docs.set(id, { op: { t: 'delete', table: op.table, key: op.key, v: prev.op.v }, created: prev.created });
      continue;
    }
    if (prev.op.t === 'delete') {
      // Silinib yenidən yaradılıb — son vəziyyət tam sətirdir
      docs.set(id, { op: { ...structuredClone(op), v: prev.op.v } as VersionedOp, created: prev.created });
      continue;
    }
    const base = { ...(op.base ?? {}), ...(prev.op.base ?? {}) };
    docs.set(id, {
      op: {
        ...prev.op,
        row: { ...prev.op.row, ...op.row },
        ...(Object.keys(base).length ? { base } : {}),
      } as VersionedOp,
      created: prev.created,
    });
  }
  const out: Op[] = [];
  for (const id of order) {
    const { op, created } = docs.get(id)!;
    if (created && op.t === 'delete') continue;
    out.push(op);
  }
  return [...out, ...Object.values(settings), ...rest];
}

// Müqayisədə '' və null eynidir (Firestore '' → null saxlayır)
const norm = (v: unknown) => (v === '' || v === undefined ? null : v);

/**
 * Versiyalı op-ları cari sənədlərlə müqayisə edir (saf funksiya, server və klient).
 * - `v` cari `_v`-yə bərabərdir → qəbul.
 * - Fərqlidir, amma upsert-in dəyişdirdiyi sahələrin hamısı hələ `base` dəyərindədir
 *   (yəni başqası FƏRQLİ sahələri dəyişib) → səssiz birləşdirmə, qəbul.
 * - Əks halda → ziddiyyət; həmin sənədin yazısı və ona aid jurnal qeydləri atılır.
 * `v` olmayan op-lar (v1 klienti) yoxlanmadan qəbul olunur.
 */
export function resolveVersions(
  ops: Op[],
  current: Map<string, Doc | null>,
): { accepted: Op[]; conflicts: Conflict[]; versions: Record<string, number> } {
  const conflicts: Conflict[] = [];
  const versions: Record<string, number> = {};
  const rejected = new Set<string>();
  const state = new Map(current);
  const kept: Op[] = [];
  for (const op of ops) {
    if (op.t === 'log' || op.table === 'Settings' || !('v' in op) || op.v === undefined) {
      kept.push(op);
      continue;
    }
    const key = opKey(op) as string;
    const id = `${op.table}/${key}`;
    const cur = state.get(id) ?? null;
    const curV = Number(cur?._v) || 0;
    const alive = cur && !cur._deleted;
    let ok = op.v === curV;
    if (!ok && op.t === 'upsert' && op.base && alive) ok = Object.entries(op.base).every(([f, b]) => norm(cur[f]) === norm(b));
    // İdempotentlik: eyni partiya təkrar gəlibsə, sənəd artıq istənilən vəziyyətdədir → ziddiyyət deyil, yazmadan keç
    if (!ok) {
      const applied =
        op.t === 'delete'
          ? !alive
          : !!alive && Object.entries(op.row).every(([f, val]) => META_FIELDS.has(f) || norm(cur[f]) === norm(val));
      if (applied) {
        versions[id] = curV;
        continue;
      }
    }
    if (!ok) {
      rejected.add(id);
      const theirs = alive
        ? (Object.fromEntries(Object.entries(cur).filter(([k]) => !k.startsWith('_'))) as Record<string, Scalar>)
        : null;
      conflicts.push({ table: op.table, key, v: curV, theirs, by: (cur?.updated_by as string) || null });
      continue;
    }
    versions[id] = curV + 1;
    const next: Doc =
      op.t === 'delete'
        ? { ...(cur ?? { _id: key }), _deleted: true, _v: curV + 1 }
        : { ...(cur ?? { _id: key }), ...op.row, _deleted: false, _v: curV + 1 };
    state.set(id, next);
    kept.push(op);
  }
  // Rədd edilmiş tapşırıqlara aid jurnal qeydləri yazılmır (baş verməyən əməliyyat jurnala düşməsin)
  const accepted = kept.filter((op) => !(op.t === 'log' && op.row.task_id && rejected.has(`Tasks/${String(op.row.task_id)}`)));
  return { accepted, conflicts, versions };
}

/** Lokal vəziyyətdən `resolveVersions` üçün cari sənəd xəritəsi (yalnız op-ların toxunduğu sənədlər). */
export function currentDocs(state: Snapshot, ops: readonly Op[]): Map<string, Doc | null> {
  const t = new Map(state.tasks.map((x) => [x.id, x]));
  const e = new Map(state.employees.map((x) => [x.name, x]));
  const out = new Map<string, Doc | null>();
  for (const op of ops) {
    const id = opDocId(op);
    if (!id) continue;
    const key = opKey(op) as string;
    const d = (op as VersionedOp).table === 'Tasks' ? t.get(key) : e.get(key);
    out.set(id, d ? ({ ...(d as unknown as Record<string, Scalar>), _id: key } as Doc) : null);
  }
  return out;
}

/**
 * Tətbiqin əksi: `before` vəziyyətindən op-ların toxunduğu sahələrin köhnə dəyərləri (geri alma üçün).
 * Yaradılan sənəd → delete; silinən → tam sətir; dəyişən → yalnız dəyişən sahələr.
 * `base` = tətbiqdən SONRAKI dəyərlər — geri alma anında onlar dəyişibsə ziddiyyət kimi göstərilir.
 */
export function invertOps(before: Snapshot, ops: readonly Op[]): Op[] {
  const after = applyOpsLocal(before, ops);
  const out: Op[] = [];
  const settingsKeys = new Set<string>();
  const seen = new Set<string>();
  const tB = new Map(before.tasks.map((x) => [x.id, x]));
  const tA = new Map(after.tasks.map((x) => [x.id, x]));
  const eB = new Map(before.employees.map((x) => [x.name, x]));
  const eA = new Map(after.employees.map((x) => [x.name, x]));
  for (const op of ops) {
    if (op.t === 'log') continue;
    if (op.table === 'Settings') {
      if (op.t === 'upsert') settingsKeys.add(op.row.key);
      continue;
    }
    const id = opDocId(op) as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const key = opKey(op) as string;
    const isTask = op.table === 'Tasks';
    const fields: readonly string[] = isTask ? TASK_FIELDS : EMP_FIELDS;
    const keyField = isTask ? 'id' : 'name';
    const b = (isTask ? tB.get(key) : eB.get(key)) as Record<string, unknown> | undefined;
    const a = (isTask ? tA.get(key) : eA.get(key)) as Record<string, unknown> | undefined;
    if (!b && !a) continue;
    if (!b) {
      out.push({ t: 'delete', table: op.table, key });
      continue;
    }
    const row: Record<string, Scalar> = { [keyField]: key };
    const base: Record<string, Scalar> = {};
    for (const f of fields) {
      if (f === keyField || META_FIELDS.has(f)) continue;
      if (!a || norm(a[f]) !== norm(b[f])) {
        row[f] = (b[f] ?? null) as Scalar;
        if (a) base[f] = (a[f] ?? null) as Scalar;
      }
    }
    if (Object.keys(row).length === 1) continue;
    out.push(
      isTask
        ? { t: 'upsert', table: 'Tasks', row, ...(a ? { base } : {}) }
        : { t: 'upsert', table: 'Employees', row, ...(a ? { base } : {}) },
    );
  }
  for (const k of settingsKeys) {
    const v = before.settings[k as keyof Settings];
    if (v != null && v !== after.settings[k as keyof Settings])
      out.push({ t: 'upsert', table: 'Settings', row: { key: k as (typeof SETTINGS_KEYS)[number], value: v } });
  }
  return out;
}

/**
 * Geri alma op-larının yoxlanması (versiyasız): sahələr hələ də tətbiqdən sonrakı dəyərdədirmi?
 * Dəyişibsə — həmin sənəd "sonradan dəyişib" siyahısına düşür.
 */
export function staleDocs(state: Snapshot, ops: readonly Op[]): string[] {
  const cur = currentDocs(state, ops);
  const out: string[] = [];
  for (const op of ops) {
    const id = opDocId(op);
    if (!id || op.t === 'log' || op.table === 'Settings') continue;
    const d = cur.get(id);
    if (op.t === 'delete') continue; // yaradılmış sənəd: silinməsi həmişə mümkündür
    if (!op.base) {
      if (d) out.push(id); // silinmiş sənəd bərpa olunacaq, amma artıq yenisi var
      continue;
    }
    if (!d || Object.entries(op.base).some(([f, v]) => norm(d[f]) !== norm(v))) out.push(id);
  }
  return out;
}
