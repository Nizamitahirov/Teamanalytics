// Data sağlamlığı (SPEC §6.8): avtomatik yoxlamalar — saf funksiya, klientdə hər data dəyişikliyində işləyir.
// Tapıntı açarı sabitdir; "Fərqlidir/Saxla" açarı sənədin `health_ignore` sahəsinə yazır (sinxronlaşır, geri alınır).
import { curOwner, type EmployeeDoc, type TaskDoc } from './model.js';
import { fold } from './search.js';

export const HEALTH_KINDS = ['name_dup', 'task_dup', 'hours_mismatch', 'bad_id', 'orphan', 'departed', 'no_capacity'] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];

export type Finding = {
  key: string;
  kind: HealthKind;
  tasks: string[];
  employees: string[];
  /** Göstəriş üçün dəyərlər (kind-ə görə) */
  data: Record<string, string | number>;
};

/** Saat uyğunsuzluğu həddi: |hours − m×f/60| / hours > 5% */
export const HOURS_TOLERANCE = 0.05;

/** Ad müqayisəsi: §5 hərf bərabərliyi + kiçik hərf + boşluqsuz */
export const nameKey = (s: string) => fold(s).replace(/\s+/g, '');
/** Latın/ingilis yazılışında "ə" çox vaxt "a" yazılır (Fəridə → Farida) — ikinci açar */
export const nameKeyA = (s: string) => fold(String(s).replace(/[əƏ]/g, 'a')).replace(/\s+/g, '');
const similar = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 4 && levenshtein(x, y) <= 1);

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export const calcHours = (t: Pick<TaskDoc, 'min_per_key' | 'annual_freq'>) =>
  t.min_per_key != null && t.annual_freq != null ? (t.min_per_key * t.annual_freq) / 60 : null;

const ignored = (doc: { health_ignore?: string } | undefined, key: string) =>
  !!doc?.health_ignore && doc.health_ignore.split(',').includes(key);
export const addIgnore = (cur: string | undefined, key: string) =>
  [...new Set([...(cur ? cur.split(',') : []), key])].filter(Boolean).join(',');

const BAD_ID = /^[A-Za-z]+-x/i;
const GOOD_ID = /^[A-Za-z]+-[A-Za-z0-9]+$/;

export function checkHealth(state: { tasks: readonly TaskDoc[]; employees: readonly EmployeeDoc[] }): Finding[] {
  const out: Finding[] = [];
  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  const emps = new Map(state.employees.map((e) => [e.name, e]));
  const activeOf = (name: string) => state.tasks.filter((t) => !t.is_cancelled && curOwner(t) === name);
  const push = (f: Finding, docs: ({ health_ignore?: string } | undefined)[]) => {
    if (!docs.some((d) => ignored(d, f.key))) out.push(f);
  };

  // 1. Ad dublikatı ehtimalı
  const people = state.employees.filter((e) => !e.is_group);
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const [a, b] = [people[i], people[j]].sort((x, y) => x.name.localeCompare(y.name, 'az'));
      if (!similar(nameKey(a.name), nameKey(b.name)) && !similar(nameKeyA(a.name), nameKeyA(b.name))) continue;
      push(
        {
          key: `name_dup:${a.name}|${b.name}`,
          kind: 'name_dup',
          tasks: [],
          employees: [a.name, b.name],
          data: { a: a.name, b: b.name, aTasks: activeOf(a.name).length, bTasks: activeOf(b.name).length },
        },
        [a, b],
      );
    }

  // 2. Təkrar tapşırıq: eyni company+process+category+task+owner_before+hours
  const groups = new Map<string, TaskDoc[]>();
  for (const t of state.tasks) {
    const k = [t.company, t.process, t.category, t.task, t.owner_before, t.hours].map((v) => fold(v)).join('\u0001');
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // Saxlanılan: aktiv olan, sonra qısa (ilkin cədvəl) id
    const sorted = [...list].sort(
      (x, y) => Number(x.is_cancelled) - Number(y.is_cancelled) || x.id.length - y.id.length || x.id.localeCompare(y.id),
    );
    const ids = sorted.map((t) => t.id);
    push(
      {
        key: `task_dup:${[...ids].sort().join('|')}`,
        kind: 'task_dup',
        tasks: ids,
        employees: [],
        data: { keep: ids[0], extra: ids.slice(1).join(', '), task: sorted[0].task, hours: sorted[0].hours },
      },
      sorted,
    );
  }

  for (const t of state.tasks) {
    // 3. Saat uyğunsuzluğu
    const calc = calcHours(t);
    if (!t.is_cancelled && calc != null && t.hours > 0 && Math.abs(t.hours - calc) / t.hours > HOURS_TOLERANCE)
      push(
        {
          key: `hours_mismatch:${t.id}`,
          kind: 'hours_mismatch',
          tasks: [t.id],
          employees: [],
          data: {
            task: t.task,
            hours: t.hours,
            calc: Math.round(calc * 100) / 100,
            min: t.min_per_key ?? 0,
            freq: t.annual_freq ?? 0,
          },
        },
        [t],
      );
    // 4. ID problemi / boş sahələr
    const badId = BAD_ID.test(t.id) || !GOOD_ID.test(t.id);
    const empty = !t.process.trim() || !t.task.trim();
    if (badId || empty) {
      const twin = state.tasks.find(
        (x) => x.id !== t.id && x.company === t.company && fold(x.process) === fold(t.process) && fold(x.task) === fold(t.task),
      );
      const fixed = t.id.replace(/-x/i, '-');
      push(
        {
          key: `bad_id:${t.id}`,
          kind: 'bad_id',
          tasks: twin ? [t.id, twin.id] : [t.id],
          employees: [],
          data: {
            id: t.id,
            task: t.task || '—',
            reason: badId ? 'id' : 'empty',
            twin: twin?.id ?? '',
            suggest: badId && GOOD_ID.test(fixed) && !tasks.has(fixed) ? fixed : '',
          },
        },
        [t],
      );
    }
  }

  // 5. Sahibsiz iş (icraçı siyahıda yoxdur və ya boşdur) / 7. Ayrılmış (aktiv deyil) əməkdaşda iş
  const byOwner = new Map<string, TaskDoc[]>();
  for (const t of state.tasks) if (!t.is_cancelled) byOwner.set(curOwner(t), [...(byOwner.get(curOwner(t)) ?? []), t]);
  for (const [owner, list] of byOwner) {
    const e = emps.get(owner);
    const hours = list.reduce((s, t) => s + (t.hours || 0), 0);
    if (!owner || !e)
      push(
        {
          key: `orphan:${owner}`,
          kind: 'orphan',
          tasks: list.map((t) => t.id),
          employees: [],
          data: { owner: owner || '—', n: list.length, hours },
        },
        list,
      );
    else if (!e.active)
      push(
        {
          key: `departed:${owner}`,
          kind: 'departed',
          tasks: list.map((t) => t.id),
          employees: [owner],
          data: { owner, n: list.length, hours },
        },
        [e],
      );
    // 6. Tutumsuz əməkdaş
    else if (!e.is_group && !(e.fte > 0))
      push(
        {
          key: `no_capacity:${owner}`,
          kind: 'no_capacity',
          tasks: list.map((t) => t.id),
          employees: [owner],
          data: { owner, n: list.length, hours },
        },
        [e],
      );
  }
  return out.sort((a, b) => HEALTH_KINDS.indexOf(a.kind) - HEALTH_KINDS.indexOf(b.kind) || a.key.localeCompare(b.key));
}
