// 3. Tutum balansı — v2.2: Kinetic nümunəsi kimi şaquli "pill" sütunlar (lazım olan, optimizasiyadan sonra lazım,
// mövcud). Mövcud ştat brend qradiyenti ilə vurğulanır, digərləri sakit boz; dəyər hər sütunun üstündə iri yazılır.
// Yuxarıdakı zona göstəricisi (A1c nümunəsi) DashboardWidgets-də HTML kimi çəkilir (CapacityGauge).
import { fmtFte } from '../../../shared/format';
import type { capacityBalance } from '../../../shared/dashboard';
import { base, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

/** Şaquli qradiyent (yuxarı → aşağı) — ECharts LinearGradient obyekt forması. */
export const vGrad = (top: string, bottom: string) => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: top },
    { offset: 1, color: bottom },
  ],
});

export function capacityOption(b: ReturnType<typeof capacityBalance>, th: ChartTheme, t: T): ChartSpec {
  const have = t('chart.cap.have');
  const need = t('chart.cap.need');
  const needOpt = t('chart.cap.needOpt');
  const summary = t('chart.cap.summary', { have: fmtFte(b.have), need: fmtFte(b.need), opt: fmtFte(b.needOpt) });
  const dark = th.mode === 'dark';
  const muted = dark ? vGrad('#3a3a41', '#2a2a2f') : vGrad('#d5d9e0', '#c3c8d1');
  const accent = vGrad('#ff9524', '#e30613');
  const cols = [
    { name: need, value: b.need, color: muted, hi: false },
    { name: needOpt, value: b.needOpt, color: muted, hi: false },
    { name: have, value: b.have, color: accent, hi: true },
  ];
  return {
    height: 250,
    summary,
    table: {
      columns: [t('chart.col.metric'), 'FTE'],
      rows: [
        [have, fmtFte(b.have, 2)],
        [need, fmtFte(b.need, 2)],
        [needOpt, fmtFte(b.needOpt, 2)],
      ],
    },
    option: {
      ...base(th, summary),
      grid: { left: 8, right: 8, top: 36, bottom: 28, containLabel: false },
      xAxis: {
        type: 'category',
        data: cols.map((c) => c.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: th.muted, fontSize: 12, interval: 0 },
      },
      yAxis: { type: 'value', show: false, min: 0, max: Math.ceil(b.max * 1.18) },
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'item',
        formatter: (p: { name: string; value: number }) => `${p.name}: <b>${fmtFte(p.value, 2)}</b> FTE`,
      },
      series: [
        {
          type: 'bar',
          barWidth: '42%',
          showBackground: true,
          backgroundStyle: { color: dark ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.035)', borderRadius: 18 },
          data: cols.map((c) => ({
            value: +c.value.toFixed(2),
            itemStyle: {
              color: c.color,
              borderRadius: 18,
              ...(c.hi && dark ? { shadowBlur: 24, shadowColor: 'rgba(242,80,30,0.45)' } : {}),
            },
            label: { color: c.hi ? th.text : th.text2 },
          })),
          label: {
            show: true,
            position: 'top',
            distance: 8,
            fontSize: 20,
            fontWeight: 700,
            formatter: (p: { value: number }) => fmtFte(p.value),
          },
        },
      ],
    },
  };
}
