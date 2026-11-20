// Məlumat sxemləri (Zod) — həm server, həm klient üçün tək mənbə (SPEC §4.1, §4.5, §10).
// Mövcud v1 sahələri dəyişmir; v1 klientinin göndərdiyi hər sorğu bu sxemlərdən keçməlidir.
import { z } from 'zod';

import { MAX_OPS, MAX_SCENARIO_CHANGES, MAX_TEXT, SETTINGS_KEYS } from './constants.js';
export * from './constants.js';

/* ---------- əsas obyektlər ---------- */
const text = z.string().max(MAX_TEXT);
const optNum = z.number().finite().nullable();

export const TaskSchema = z.object({
  id: z.string().min(1).max(200),
  company: text,
  process: text,
  category: text,
  task: text,
  description: text,
  owner_before: text,
  owner_after: text,
  min_per_key: optNum,
  annual_freq: optNum,
  unit: text,
  hours: z.number().finite(),
  after_opt: optNum,
  is_cancelled: z.boolean(),
  updated_at: text.optional(),
  updated_by: text.optional(),
  /** v2 (SPEC §4.5, §6.6, §6.8) — isteğe bağlı */
  automation: z.enum(['none', 'candidate', 'in_progress', 'done', 'rejected']).optional(),
  automation_note: text.optional(),
  due_quarter: text.optional(),
  /** "Tamamlandı" edilərkən saat after_opt ilə əvəz olunubsa — köhnə saat (realizə olunmuş qənaət üçün) */
  opt_before: optNum.optional(),
  opt_done_at: text.optional(),
  /** Data sağlamlığında "Fərqlidir/Saxla" ilə susdurulan tapıntı açarları (vergüllə) */
  health_ignore: text.optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const EmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  company: text,
  activity: text,
  fte: z.number().finite().min(0),
  is_group: z.boolean(),
  active: z.boolean(),
  health_ignore: text.optional(),
});
export type Employee = z.infer<typeof EmployeeSchema>;

export const LogEntrySchema = z.object({
  id: z.string().optional(),
  ts: text,
  user: text.optional(),
  action: text,
  task_id: text.optional(),
  task_label: text.optional(),
  from: text.optional(),
  to: text.optional(),
  comment: text.optional(),
  /** Qrup (məs. ssenari id-si) — toplu əməliyyatın qeydləri bir başlıq altında (SPEC §6.5, §6.9) */
  group: text.optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const SettingsSchema = z.object({
  norm: z.number().positive(),
  warn: z.number().min(0).max(1000),
  /** Təsdiq axını: 0 söndürülü, 1 açıq (SPEC §2) */
  approval: z.number().min(0).max(1).optional(),
  /** Bu saatdan (≥) böyük ötürmə təsdiqə gedir */
  approval_hours: z.number().min(0).optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const RoleSchema = z.enum(['admin', 'editor', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

/* ---------- POST /api/ops ---------- */
// v1 klienti sətirləri tam göndərir, amma Excel importu sətir/rəqəm qarışığı gətirə bilər —
// ona görə sətir dəyəri skalyar ola bilər; ciddi tiplər (yuxarıdakı sxemlər) klientdə normallaşdırmadan sonra keçərlidir.
const Scalar = z.union([z.string().max(MAX_TEXT), z.number().finite(), z.boolean(), z.null()]);
// Sahə adları: kiçik hərf, rəqəm, alt xətt; "_" ilə başlayan sistem sahələri (_ts, _deleted, _v) klientdən qəbul olunmur
const FieldName = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'Yanlış sahə adı');
const Row = z.record(FieldName, Scalar);
const DocKey = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((s) => !s.includes('/'), 'Açarda "/" ola bilməz');

const keyed = (field: string) =>
  Row.refine((r) => DocKey.safeParse(r[field]).success, { message: `"${field}" boş və ya yanlışdır` });

// v2 klienti hər upsert/delete-də gördüyü versiyanı (`v`) və dəyişən sahələrin köhnə dəyərlərini (`base`) göndərir.
// v1 klienti bunları göndərmir → versiya yoxlaması olmadan yazılır (keçid dövrü, SPEC §15.2).
const Version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Base = z.record(FieldName, Scalar);

export const OpSchema = z.union([
  z.object({ t: z.literal('upsert'), table: z.literal('Tasks'), row: keyed('id'), v: Version.optional(), base: Base.optional() }),
  z.object({
    t: z.literal('upsert'),
    table: z.literal('Employees'),
    row: keyed('name'),
    v: Version.optional(),
    base: Base.optional(),
  }),
  z.object({
    t: z.literal('upsert'),
    table: z.literal('Settings'),
    row: z.object({ key: z.enum(SETTINGS_KEYS), value: z.union([z.number().finite(), z.string().max(32)]) }),
  }),
  z.object({ t: z.literal('delete'), table: z.enum(['Tasks', 'Employees']), key: DocKey, v: Version.optional() }),
  z.object({ t: z.literal('log'), row: Row }),
]);
export type Op = z.infer<typeof OpSchema>;

export const OpsBodySchema = z.object({
  ops: z.array(OpSchema).max(MAX_OPS, 'Bir dəfədə çox sayda dəyişiklik'),
});

/* ---------- auth / users ---------- */
export const LoginBodySchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional(),
});

const UserName = z.string().trim().min(1, 'Ad boş ola bilməz').max(100);
const Password = z.string().max(200);
/** İstifadəçi idarəsi (SPEC §6.10). v1 klienti add/password/remove göndərir — uyğundur. */
export const UsersBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), name: UserName, password: Password, role: RoleSchema.optional() }),
  z.object({ action: z.literal('password'), name: UserName, password: Password }),
  z.object({ action: z.literal('remove'), name: UserName }),
  z.object({ action: z.literal('role'), name: UserName, role: RoleSchema }),
  z.object({ action: z.literal('revoke'), name: UserName }),
  z.object({ action: z.literal('unlock'), name: UserName }),
  z.object({ action: z.literal('change-own'), current: Password, password: Password }),
]);
export type UsersBody = z.infer<typeof UsersBodySchema>;

export type UserRow = {
  id: string;
  name: string;
  active: boolean;
  created_by: string;
  role: Role;
  last_login: string | null;
  locked_until: string | null;
  must_change_password: boolean;
};

/* ---------- ssenarilər (SPEC §6.5) ---------- */
export const SCENARIO_STATUSES = ['draft', 'pending', 'applied', 'archived'] as const;
export const ScenarioStatusSchema = z.enum(SCENARIO_STATUSES);
export type ScenarioStatus = z.infer<typeof ScenarioStatusSchema>;

export const CHANGE_KINDS = [
  'transfer',
  'cancel',
  'restore',
  'hours',
  'new_task',
  'add_employee',
  'remove_employee',
  'fte',
  'norm',
  'automate',
  'rebalance',
] as const;
export const ChangeKindSchema = z.enum(CHANGE_KINDS);
export type ChangeKind = z.infer<typeof ChangeKindSchema>;

/** Ssenari daxilində bir dəyişiklik: insan üçün etiket + `Op[]` (baza datası üzərinə lokal tətbiq olunur). */
export const ScenarioChangeSchema = z.object({
  id: z.string().min(1).max(64),
  kind: ChangeKindSchema,
  label: text,
  ops: z.array(OpSchema).max(MAX_OPS),
});
export type ScenarioChange = z.infer<typeof ScenarioChangeSchema>;

const ScenarioId = z.string().regex(/^S-[a-z0-9-]{4,40}$/, 'Yanlış ssenari id-si');
const ScenarioName = z.string().trim().min(1, 'Ad boş ola bilməz').max(120);
const Changes = z.array(ScenarioChangeSchema).max(MAX_SCENARIO_CHANGES, 'Ssenaridə çox sayda dəyişiklik');
/** Ssenari təsirinin xülasəsi (siyahıda göstərilir — hər dəfə hesablamamaq üçün) */
export const ScenarioSummarySchema = z.object({
  changes: z.number().int().min(0),
  dFteNeed: z.number().finite(),
  dOver: z.number().int(),
  dHours: z.number().finite(),
});
export type ScenarioSummary = z.infer<typeof ScenarioSummarySchema>;

/** POST /api/scenarios (SPEC §4.4) */
export const ScenariosBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    id: ScenarioId,
    name: ScenarioName,
    description: text.optional(),
    base_ts: text.optional(),
    changes: Changes,
    summary: ScenarioSummarySchema.optional(),
    /** Yaradılan kimi təsdiqə göndər (məs. 40+ saatlıq ötürmə) */
    submit: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('update'),
    id: ScenarioId,
    name: ScenarioName.optional(),
    description: text.optional(),
    changes: Changes.optional(),
    summary: ScenarioSummarySchema.optional(),
  }),
  z.object({ action: z.literal('delete'), id: ScenarioId }),
  z.object({ action: z.literal('submit'), id: ScenarioId }),
  z.object({ action: z.literal('reject'), id: ScenarioId, comment: text.optional() }),
  z.object({ action: z.literal('archive'), id: ScenarioId }),
  z.object({ action: z.literal('restore'), id: ScenarioId }),
  /** Klient ssenarinin op-larını /api/ops ilə yazdıqdan sonra statusu qeyd edir (+ geri alma op-ları) */
  z.object({ action: z.literal('applied'), id: ScenarioId, revert: z.array(OpSchema).max(MAX_OPS) }),
  z.object({ action: z.literal('reverted'), id: ScenarioId }),
]);
export type ScenariosBody = z.infer<typeof ScenariosBodySchema>;

/** Ssenari (klientə gedən forma; Firestore-da `changes`, `summary`, `revert` JSON sətri kimi saxlanır). */
export type Scenario = {
  id: string;
  name: string;
  description: string;
  base_ts: string;
  status: ScenarioStatus;
  changes: ScenarioChange[];
  summary: ScenarioSummary | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  submitted_by: string;
  submitted_at: string;
  decided_by: string;
  decided_at: string;
  decision_comment: string;
  applied_by: string;
  applied_at: string;
  reverted_by: string;
  reverted_at: string;
  /** Tətbiqdən əvvəlki dəyərlər — "Geri al" bu op-ları yazır */
  revert: Op[];
};

/* ---------- bildirişlər (SPEC §2 təsdiq axını) ---------- */
export const NOTIFICATION_KINDS = ['approval_request', 'approved', 'rejected'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type Notification = {
  id: string;
  to: string;
  kind: NotificationKind;
  text: string;
  link: string;
  read: boolean;
  ts: string;
};
export const NotificationsBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read'), ids: z.array(z.string().min(1).max(80)).min(1).max(200) }),
  z.object({ action: z.literal('read-all') }),
]);

/* ---------- API cavabları ---------- */
export type ApiError = { error: string; code: string };

/** Versiya ziddiyyəti: başqa istifadəçi sənədi bizdən əvvəl dəyişib (SPEC §4.3). */
export type Conflict = {
  table: 'Tasks' | 'Employees';
  key: string;
  /** Serverdəki cari versiya */
  v: number;
  /** Serverdəki cari sənəd (silinibsə null) */
  theirs: Record<string, string | number | boolean | null> | null;
  /** Son dəyişən istifadəçi (məlumdursa) */
  by: string | null;
};
export type OpsResponse = {
  ok: true;
  /** Uğurla yazılan sənədlərin yeni versiyaları: "Tasks/B-1" → 4 */
  versions: Record<string, number>;
  conflicts: Conflict[];
};
export type MeResponse = {
  user: { name: string; role: Role };
  /** İlkin və ya admin tərəfindən sıfırlanmış parol — dəyişmək məcburidir (SPEC §10) */
  mustChange: boolean;
  settings: Settings;
  flags: Record<string, boolean>;
};
