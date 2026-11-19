// Axtarış normallaşdırması (SPEC §5): ə/e, ı/i, ö/o, ü/u, ş/s, ç/c, ğ/g bərabər; böyük/kiçik hərf fərqi yoxdur.
const MAP: Record<string, string> = { ə: 'e', ı: 'i', i̇: 'i', ö: 'o', ü: 'u', ş: 's', ç: 'c', ğ: 'g' };

export function fold(s: unknown): string {
  return String(s ?? '')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[əıöüşçğ]/g, (c) => MAP[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sorğunun hər sözü mətndə varmı (sıradan asılı olmayaraq). */
export function matches(haystack: string, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const h = fold(haystack);
  return q.split(' ').every((w) => h.includes(w));
}

/** Komanda paleti üçün sadə xal: söz başlanğıcında uyğunluq yüksək, ardıcıl hərflər (fuzzy) aşağı; 0 = uyğun deyil. */
export function score(text: string, query: string): number {
  const q = fold(query);
  if (!q) return 1;
  const h = fold(text);
  if (h === q) return 100;
  if (h.startsWith(q)) return 80;
  if (new RegExp(`(^|[\\s—\\-·/])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(h)) return 60;
  if (h.includes(q)) return 40;
  if (q.split(' ').every((w) => h.includes(w))) return 30;
  // fuzzy: hərflər ardıcıllıqla
  let i = 0;
  for (const c of h) if (c === q[i]) i++;
  return i === q.length ? 10 : 0;
}
