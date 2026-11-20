// 9. Pareto — proseslər saata görə azalan; üstdə ayrıca nazik kumulyativ % zolağı (ikinci y oxu YOXDUR — SPEC §12.2).
import { fmtHours, fmtPct } from '../../../shared/format';
import type { pareto } from '../../../shared/dashboard';
import { axisStyle, base, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export function paretoOption(p: ReturnType<typeof pareto>, th: ChartTheme, t: T): ChartSpec {
  const names = p.items.map((x) => x.process);
  const summary = t('chart.pareto.summary', { n: p.n80, total: p.items.length });
  const cut = p.n80 - 1;
  return {
    height: 380,
    summary,
    table: {
      columns: ['#', t('field.process'), t('unit.hours'), t('chart.pareto.cum')],
      rows: p.items.map((x, i) => [i + 1, x.process, fmtHours(x.hours), fmtPct(x.cumPct)]),
    },
    option: {
      ...base(th, summary),
      title: {
        text: t('chart.pareto.note', { n: p.n80, total: p.items.length }),
        left: 8,
        top: 0,
        textStyle: { color: th.text2, fontSize: 12, fontWeight: 600 },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 56, right: 16, top: 30, height: 56 },
        { left: 56, right: 16, top: 104, bottom: 92 },
      ],
      xAxis: [
        { type: 'category', data: names, gridIndex: 0, show: false },
        {
          type: 'category',
          data: names,
          gridIndex: 1,
          ...axisStyle(th),
          splitLine: { show: false },
          // Çox proses olanda adlar üst-üstə düşməsin: yalnız sığanlar göstərilir (hamısı tooltip və cədvəldə)
          axisLabel: {
            color: th.text2,
            fontSize: 10,
            rotate: 50,
            width: 110,
            overflow: 'truncate',
            interval: names.length > 15 ? 'auto' : 0,
            hideOverlap: true,
          },
        },
      ],
      yAxis: [
        {
          type: 'value',
          gridIndex: 0,
          min: 0,
          max: 1,
          interval: 0.5,
          ...axisStyle(th),
          axisLabel: { color: th.muted, fontSize: 10, formatter: (v: number) => fmtPct(v) },
        },
        { type: 'value', gridIndex: 1, ...axisStyle(th), axisLabel: { color: th.muted, formatter: (v: number) => fmtHours(v) } },
      ],
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'axis',
        formatter: (ps: { dataIndex: number }[]) => {
          const x = p.items[ps[0].dataIndex];
          return `<b>${x.process}</b><br/>${fmtHours(x.hours)} ${t('unit.hours')}<br/>${t('chart.pareto.cum')}: ${fmtPct(x.cumPct)}`;
        },
      },
      series: [
        {
          name: t('chart.pareto.cum'),
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: p.items.map((x) => +x.cumPct.toFixed(4)),
          lineStyle: { color: th.text2, width: 2 },
          itemStyle: { color: th.text2 },
          symbol: 'none',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: th.critical, type: 'dashed' },
            label: { color: th.text2, formatter: '80%', position: 'insideEndTop' },
            data: [{ yAxis: 0.8 }],
          },
        },
        {
          name: t('unit.hours'),
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          barMaxWidth: 18,
          data: p.items.map((x, i) => ({
            value: +x.hours.toFixed(1),
            itemStyle: { color: i <= cut ? th.cat[1] : th.idle, borderRadius: [5, 5, 0, 0] },
          })),
        },
      ],
    },
  };
}
