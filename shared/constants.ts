// Sabitlər — Zod-suz (klient bundle-ına Zod düşməsin deyə schema.ts-dən ayrıdır).
export const ACT_ADMIN = 'Administrativ';
export const ACT_PROJECT = 'Project and AdHoc based';
export const DEFAULT_SETTINGS = { norm: 1922, warn: 85 } as const;
export const SETTINGS_KEYS = ['norm', 'warn'] as const;
export const MAX_TEXT = 2000;
export const MAX_OPS = 3000;
