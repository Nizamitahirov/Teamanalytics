// Rəqəm formatı (SPEC §7.12): minlik ayırıcı — dar boşluq (U+202F), onluq ayırıcı — vergül.
// Qərar (ADR-002): Intl 'az-AZ' brauzerdən asılı olaraq "27.850" / "27,850" verir — rəhbərliyə gedən
// rəqəmlər hər yerdə eyni görünsün deyə həmişə bu deterministik formatlayıcı işlədilir.
export const NNBSP = ' ';

export function formatNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : n < 0 ? '−∞' : '—';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  const s = frac ? `${grouped},${frac}` : grouped;
  return neg && Number(fixed) !== 0 ? `−${s}` : s;
}

/** Saat: 0 onluq; < 100 və kəsr varsa 1 onluq. */
export const fmtHours = (n: number) => formatNumber(n, Math.abs(n) < 100 && n % 1 !== 0 ? 1 : 0);
/** FTE: KPI-da 1, cədvəldə 2 onluq. */
export const fmtFte = (n: number, decimals: 1 | 2 = 1) => formatNumber(n, decimals);
/** Faiz (0..1 → "113%"). */
export const fmtPct = (ratio: number) => `${formatNumber(ratio * 100, 0)}%`;
/** İşarəli fərq: "+3,5" / "−2,1". */
export const fmtSigned = (n: number, decimals = 1) => (n > 0 ? '+' : '') + formatNumber(n, decimals);
