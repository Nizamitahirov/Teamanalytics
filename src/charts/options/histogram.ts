// 10. Yük paylanması — 10% addımlı histogram; median və norma (100%) xətləri.
import { fmtPct } from '../../../shared/format';
import type { loadHistogram } from '../../../shared/dashboard';
import { axisStyle, base, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export function histogramOption(h: ReturnType<typeof loadHistogram>, th: ChartTheme, t: T): ChartSpec {
  const label = (b: { from: number; to: number }) =>
    Number.isFinite(b.to) ? `${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%` : `≥${Math.round(b.from * 100)}%`;
  const cats = h.bins.map(label);
  const binOf = (x: number) => Math.min(h.bins.length - 1, Math.floor((x + 1e-9) / h.step));
  const summary = t('chart.hist.summary', {
    median: fmtPct(h.median),
    over: h.bins.filter((b) => b.from >= 1 - 1e-9).reduce((a, b) => a + b.names.length, 0),
  });
  return {
    height: 300,
    summary,
    table: {
      columns: [t('chart.hist.bin'), t('unit.people'), t('field.name')],
      rows: h.bins.filter((b) => b.names.length).map((b) => [label(b), b.names.length, b.names.join(', ')]),
    },
    option: {
      ...base(th, summary),
      // Xətlərin izahı başlıqda (etiketlər barların üstünə düşməsin)
      title: {
        text: `┈ ${t('chart.hist.median', { v: fmtPct(h.median) })}    ╌ ${t('chart.load.norm')}`,
        left: 8,
        top: 0,
        textStyle: { color: th.text2, fontSize: 12, fontWeight: 600 },
      },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: cats,
        ...axisStyle(th),
        splitLine: { show: false },
        axisLabel: { color: th.text2, fontSize: 10, interval: 0, rotate: 40 },
      },
      yAxis: { type: 'value', minInterval: 1, ...axisStyle(th) },
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const b = h.bins[p.dataIndex];
          return `<b>${cats[p.dataIndex]}</b>: ${b.names.length} ${t('unit.people')}<br/>${b.names.join(', ')}`;
        },
      },
      series: [
        {
          type: 'bar',
          barCategoryGap: '12%',
          data: h.bins.map((b) => ({
            value: b.names.length,
            itemStyle: { color: b.from >= 1 - 1e-9 ? th.critical : th.cat[0], borderRadius: [4, 4, 0, 0] },
          })),
          label: {
            show: true,
            position: 'top',
            color: th.text,
            fontSize: 11,
            formatter: (p: { value: number }) => (p.value ? String(p.value) : ''),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { color: th.text2, fontSize: 11 },
            data: [
              {
                xAxis: binOf(h.median),
                lineStyle: { color: th.text2, type: 'dotted', width: 1.5 },
                label: { show: false },
              },
              {
                xAxis: binOf(1),
                lineStyle: { color: th.critical, type: 'dashed', width: 1.5 },
                label: { show: false },
              },
            ],
          },
        },
      ],
    },
  };
}
