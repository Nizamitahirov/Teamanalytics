// Sabitlər — Zod-suz (klient bundle-ına Zod düşməsin deyə schema.ts-dən ayrıdır).
export const ACT_ADMIN = 'Administrativ';
export const ACT_PROJECT = 'Project and AdHoc based';
// approval: təsdiq axını (SPEC §2, S1 — default söndürülü: 0/1), approval_hours: ötürmə həddi (saat)
export const DEFAULT_SETTINGS = { norm: 1922, warn: 85, approval: 0, approval_hours: 40 } as const;
export const SETTINGS_KEYS = ['norm', 'warn', 'approval', 'approval_hours'] as const;
export const MAX_TEXT = 2000;
export const MAX_OPS = 3000;
