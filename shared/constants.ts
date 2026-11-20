// Sabitlər — Zod-suz (klient bundle-ına Zod düşməsin deyə schema.ts-dən ayrıdır).
export const ACT_ADMIN = 'Administrativ';
export const ACT_PROJECT = 'Project and AdHoc based';
/**
 * Ayarlar (meta/main). `vacation_days` — normadan çıxılan illik məzuniyyət (gün, default 30);
 * effektiv norma = norm − vacation_days × 8 (shared/metrics.ts → effectiveNorm). `approval` — təsdiq axını (0 söndürülü / 1 açıq, SPEC §2, default söndürülü);
 * `approval_hours` — editor-un bu saatdan böyük ötürməsi təsdiqə gedir (default 40).
 */
export const DEFAULT_SETTINGS = { norm: 1922, warn: 85, approval: 0, approval_hours: 40, vacation_days: 30 } as const;
export const SETTINGS_KEYS = ['norm', 'warn', 'approval', 'approval_hours', 'vacation_days'] as const;
/** Məzuniyyət günü = 8 iş saatı (sahibin qaydası: 30 təqvim günü × 8 = 240 saat) */
export const HOURS_PER_DAY = 8;
export const MAX_TEXT = 2000;
export const MAX_OPS = 3000;
/** Ssenari (SPEC §6.5): bir ssenaridə ən çox dəyişiklik və JSON ölçüsü (Firestore sənədi ≤ 1 MiB). */
export const MAX_SCENARIO_CHANGES = 1000;
export const MAX_SCENARIO_BYTES = 800_000;
