// 7. Yük xəritəsi — əməkdaş × proses; ardıcıl bir-rəngli şkala; tək icraçılı proseslər "1" nişanı ilə (bus factor).
import { fmtHours } from '../../../shared/format';
import type { loadHeatmap } from '../../../shared/dashboard';
import { axisStyle, base, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export function heatmapOption(h: ReturnType<typeof loadHeatmap>, th: ChartTheme, t: T): ChartSpec {
  const rows = [...h.rows].reverse();
  const rIdx = (r: number) => h.rows.length - 1 - r;
  const data = h.cells.map(([c, r, v]) => [c, rIdx(r), +v.toFixed(1)]);
  const singles = [...h.single];
  const summary = t('chart.heat.summary', {
    rows: h.rows.length,
    cols: h.cols.length,
    single: singles.length,
    list: singles.slice(0, 5).join(', ') || '—',
  });
  return {
    height: Math.max(360, rows.length * 24 + 140),
    summary,
    table: {
      columns: [t('field.name'), ...h.cols],
      rows: h.rows.map((name, r) => [
        name,
        ...h.cols.map((_, c) => fmtHours(h.cells.find((x) => x[0] === c && x[1] === r)?.[2] ?? 0)),
      ]),
    },
    option: {
      ...base(th, summary),
      grid: { left: 8, right: 16, top: 8, bottom: 90, containLabel: true },
      xAxis: {
        type: 'category',
        data: h.cols,
        ...axisStyle(th),
        splitLine: { show: false },
        axisLabel: { color: th.text2, fontSize: 11, rotate: 40, width: 120, overflow: 'truncate', interval: 0 },
      },
      yAxis: {
        type: 'category',
        data: rows,
        ...axisStyle(th),
        splitLine: { show: false },
        axisLabel: { color: th.text2, fontSize: 12 },
      },
      visualMap: {
        min: 0,
        max: Math.max(1, Math.ceil(h.max)),
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 160,
        text: [fmtHours(h.max), '0'],
        textStyle: { color: th.muted, fontSize: 11 },
        inRange: { color: th.seq },
        outOfRange: { color: th.surface },
      },
      tooltip: {
        ...base(th, '').tooltip,
        formatter: (p: { value: [number, number, number] }) => {
          const [c, r, v] = p.value;
          const col = h.cols[c];
          return `<b>${rows[r]}</b> · ${col}<br/>${fmtHours(v)} ${t('unit.hours')}${h.single.has(col) ? `<br/>${t('chart.heat.single')}` : ''}`;
        },
      },
      series: [
        {
          type: 'heatmap',
          data: data.map((d) => ({
            value: d,
            itemStyle: d[2] === 0 ? { color: th.mode === 'light' ? '#F8F8FA' : '#181B28' } : undefined,
          })),
          itemStyle: { borderColor: th.surface, borderWidth: 2, borderRadius: 3 },
          label: {
            show: true,
            fontSize: 10,
            fontWeight: 700,
            color: th.mode === 'light' ? '#11131C' : '#FFFFFF',
            formatter: (p: { value: [number, number, number] }) =>
              p.value[2] > 0 && h.single.has(h.cols[p.value[0]]) ? '1' : '',
          },
          emphasis: { itemStyle: { borderColor: th.text, borderWidth: 1 } },
        },
      ],
    },
  };
}
