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
  text: '#11131C',
  text2: '#3D4152',
  muted: '#696D80',
  grid: '#E6E6EC',
  surface: '#FFFFFF',
  cat: ['#2347A8', '#F2501E', '#12A39A', '#7B5CD6', '#C2378A', '#8A6A00'],
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  idle: '#C1C7D0',
  seq: ['#FFF1E8', '#FFC9A8', '#FF9A66', '#F2501E', '#A8300B'],
  company: { Birbank: '#E30613', Pashapay: '#2347A8' },
  activity: { Administrativ: '#5B6478', 'Project and AdHoc based': '#F2501E' },
  neutral: '#5B6478',
  tooltipBg: '#090A13',
  tooltipText: '#FFFFFF',
};

export const darkTheme: ChartTheme = {
  mode: 'dark',
  text: '#EDEEF3',
  text2: '#B9BCCB',
  muted: '#8A8EA0',
  grid: '#262A3A',
  surface: '#12141F',
  cat: ['#4A7DE3', '#EC6430', '#1A9E92', '#8A73E3', '#CC4F94', '#A88312'],
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  idle: '#3A3F52',
  seq: ['#22202A', '#4A2618', '#8A3412', '#E0531F', '#FFA472'],
  company: { Birbank: '#FF4D57', Pashapay: '#4A7DE3' },
  activity: { Administrativ: '#8A93A8', 'Project and AdHoc based': '#EC6430' },
  neutral: '#8A93A8',
  tooltipBg: '#EDEEF3',
  tooltipText: '#11131C',
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
      extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);',
    },
  };
}

/** Ox stili: zəif grid, ox xətləri yox, mətn mətn rəngində (SPEC §12.2). */
export const axisStyle = (th: ChartTheme) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: th.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: th.grid } },
});

export type TableView = { columns: string[]; rows: (string | number)[][] };
export type ChartSpec = { option: Record<string, unknown>; table: TableView; summary: string; height: number };
