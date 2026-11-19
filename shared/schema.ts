// Məlumat sxemləri (Zod) — həm server, həm klient üçün tək mənbə (SPEC §4.1, §4.5, §10).
// Mövcud v1 sahələri dəyişmir; v1 klientinin göndərdiyi hər sorğu bu sxemlərdən keçməlidir.
import { z } from 'zod';

import { MAX_OPS, MAX_TEXT, SETTINGS_KEYS } from './constants.js';
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
});
export type Task = z.infer<typeof TaskSchema>;

export const EmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  company: text,
  activity: text,
  fte: z.number().finite().min(0),
  is_group: z.boolean(),
  active: z.boolean(),
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
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const SettingsSchema = z.object({
  norm: z.number().positive(),
  warn: z.number().min(0).max(1000),
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
});

export const UsersBodySchema = z.object({
  action: z.enum(['add', 'password', 'remove']),
  name: z.string().trim().min(1, 'Ad boş ola bilməz').max(100),
  password: z.string().max(200).optional(),
});

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
  settings: Settings;
  flags: Record<string, boolean>;
};
