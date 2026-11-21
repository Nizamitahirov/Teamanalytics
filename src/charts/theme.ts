// Qrafik temaları (SPEC §12.1–12.2): açıq və tünd AYRI-AYRI seçilib (avtomatik çevirmə yox).
// Kateqoriya palitraları dataviz validatorundan keçib (light #fcfcfb, dark #12141F — ALL PASS).
export type ChartTheme = {
  mode: 'light' | 'dark';
  text: string;
  text2: string;
  muted: string;
  grid: string;
  surface: string;
  cat: string[];
  good: string;
  warning: string;
  critical: string;
  idle: string;
  /** Ardıcıl (heatmap) — bir çalar, səthdən uzaqlaşdıqca tündləşir */
  seq: string[];
  company: Record<string, string>;
  activity: Record<string, string>;
  /** "Cəm" pillələri (waterfall) və neytral markerlər */
  neutral: string;
  tooltipBg: string;
  tooltipText: string;
};

export const lightTheme: ChartTheme = {
  mode: 'light',
  text: '#0F172A',
  text2: '#334155',
  muted: '#5B6577',
  grid: '#E6EBF2',
  surface: '#FFFFFF',
  cat: ['#2347A8', '#F2501E', '#12A39A', '#7B5CD6', '#C2378A', '#8A6A00'],
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  idle: '#C1C7D0',
  seq: ['#FFF1E8', '#FFC9A8', '#FF9A66', '#F2501E', '#A8300B'],
  company: { Birbank: '#E30613', Pashapay: '#2347A8', Birmarket: '#12A39A' },
  activity: { Administrativ: '#5B6478', 'Project and AdHoc based': '#F2501E' },
  neutral: '#5B6478',
  tooltipBg: '#0F172A',
  tooltipText: '#F8FAFC',
};

export const darkTheme: ChartTheme = {
  mode: 'dark',
  text: '#F4F4F5',
  text2: '#C7C7CF',
  muted: '#9A9AA5',
  grid: '#2A2A2F',
  surface: '#161618',
  cat: ['#4A7DE3', '#EC6430', '#1A9E92', '#8A73E3', '#CC4F94', '#A88312'],
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  idle: '#3A3A41',
  seq: ['#1E1E21', '#4A2618', '#8A3412', '#E0531F', '#FFA472'],
  company: { Birbank: '#FF4D57', Pashapay: '#4A7DE3', Birmarket: '#1A9E92' },
  activity: { Administrativ: '#8A93A8', 'Project and AdHoc based': '#EC6430' },
  neutral: '#8E8E99',
  tooltipBg: '#F4F4F5',
  tooltipText: '#111113',
};

export const companyColor = (th: ChartTheme, c: string, i = 0) => th.company[c] ?? th.cat[(i + 2) % th.cat.length];
export const statusColor = (th: ChartTheme, level: 'critical' | 'warning' | 'good' | 'idle') => th[level];

/** Bütün qrafiklər üçün ortaq əsas (şrift, mətn rəngi, tooltip, aria). */
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function base(th: ChartTheme, description: string) {
  return {
    backgroundColor: 'transparent',
    // Hərəkət azaldılıbsa animasiya yoxdur (SPEC §12.1); əks halda yalnız qısa ilk render
    animation: !reducedMotion(),
    animationDuration: 400,
    animationDurationUpdate: 250,
    textStyle: { fontFamily: "'Inter Variable', Inter, system-ui, sans-serif", color: th.text },
    aria: { enabled: true, label: { enabled: true, description } },
    tooltip: {
      backgroundColor: th.tooltipBg,
      borderWidth: 0,
      padding: [8, 12],
      textStyle: { color: th.tooltipText, fontSize: 12 },
      extraCssText: 'border-radius:8px;box-shadow:0 10px 30px -8px rgba(15,23,42,.35);line-height:1.55;',
      axisPointer: {
        type: 'shadow',
        shadowStyle: { color: th.mode === 'light' ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.05)' },
      },
    },
  };
}

/** Ox stili: zəif grid, ox xətləri yox, mətn mətn rəngində (SPEC §12.2). */
export const axisStyle = (th: ChartTheme) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: th.muted, fontSize: 11 },
  // Sakit, qırıq grid xətləri (Data-Dense üslubu)
  splitLine: { lineStyle: { color: th.grid, type: [3, 3] as number[] } },
});

export type TableView = { columns: string[]; rows: (string | number)[][] };
export type ChartSpec = { option: Record<string, unknown>; table: TableView; summary: string; height: number };

/** "#rrggbb" + şəffaflıq → rgba() (qradiyentlər üçün). */
export const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
/** Üfüqi qradiyent: solda solğun, sağda tam rəng (v2.2 "futuristik" barlar). */
export const hGrad = (hex: string, from = 0.35) => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 1,
  y2: 0,
  colorStops: [
    { offset: 0, color: hexA(hex, from) },
    { offset: 1, color: hex },
  ],
});
/** Şaquli qradiyent: yuxarıda tam rəng, aşağıda solğun. */
export const vGradA = (hex: string, to = 0.35) => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: hex },
    { offset: 1, color: hexA(hex, to) },
  ],
});
/** Tünd rejimdə yumşaq parıltı. */
export const glow = (th: ChartTheme, hex: string) => (th.mode === 'dark' ? { shadowBlur: 14, shadowColor: hexA(hex, 0.45) } : {});
