// Tarix/saat — Bakı vaxtı (UTC+4), format dd.MM.yyyy HH:mm (SPEC §12.4).
const parts = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), min: g('minute') };
};
export const formatDate = (iso: string) => {
  const p = parts(iso);
  return p ? `${p.d}.${p.m}.${p.y}` : '';
};
export const formatTime = (iso: string) => {
  const p = parts(iso);
  return p ? `${p.h}:${p.min}` : '';
};
export const formatDateTime = (iso: string) => {
  const p = parts(iso);
  return p ? `${p.d}.${p.m}.${p.y} ${p.h}:${p.min}` : '';
};
/** Bakı vaxtı ilə gün açarı (yyyy-mm-dd) — jurnalda günlərə görə qruplaşdırma üçün. */
export const dayKey = (iso: string) => {
  const p = parts(iso);
  return p ? `${p.y}-${p.m}-${p.d}` : '';
};
