// 3. Tutum balansı — bullet: mövcud FTE (zolaq) vs lazım olan (tünd marker) vs optimizasiyadan sonra lazım (boz marker).
import { fmtFte } from '../../../shared/format';
import type { capacityBalance } from '../../../shared/dashboard';
import { axisStyle, base, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export function capacityOption(b: ReturnType<typeof capacityBalance>, th: ChartTheme, t: T): ChartSpec {
  const have = t('chart.cap.have');
  const need = t('chart.cap.need');
  const needOpt = t('chart.cap.needOpt');
  const summary = t('chart.cap.summary', { have: fmtFte(b.have), need: fmtFte(b.need), opt: fmtFte(b.needOpt) });
  const marker = (name: string, value: number, color: string, h: number, pos: 'top' | 'bottom') => ({
    name,
    type: 'scatter',
    data: [[value, 0]],
    symbol: 'rect',
    symbolSize: [5, h],
    itemStyle: { color, borderColor: th.surface, borderWidth: 2 },
    label: { show: true, position: pos, color: th.text, fontWeight: 700, formatter: () => `${name}: ${fmtFte(value)}` },
    z: 5,
  });
  return {
    height: 170,
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
      legend: { bottom: 0, textStyle: { color: th.text2 }, itemWidth: 12, itemHeight: 12 },
      grid: { left: 8, right: 24, top: 36, bottom: 56, containLabel: true },
      xAxis: {
        type: 'value',
        min: 0,
        max: Math.ceil(b.max * 1.15),
        ...axisStyle(th),
        axisLabel: { color: th.muted, formatter: (v: number) => fmtFte(v, 1) },
      },
      yAxis: { type: 'category', data: ['FTE'], show: false },
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'item',
        formatter: (p: { seriesName: string; value: number | number[] }) =>
          `${p.seriesName}: <b>${fmtFte(Array.isArray(p.value) ? p.value[0] : p.value, 2)}</b> FTE`,
      },
      series: [
        {
          name: have,
          type: 'bar',
          data: [b.have],
          barWidth: 26,
          itemStyle: { color: th.cat[0], borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'insideRight', color: '#fff', fontWeight: 700, formatter: () => fmtFte(b.have) },
        },
        marker(need, b.need, th.text, 44, 'top'),
        marker(needOpt, b.needOpt, th.muted, 34, 'bottom'),
      ],
    },
  };
}
