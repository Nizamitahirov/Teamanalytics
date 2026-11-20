// Ssenari müqayisəsi (SPEC §6.5): yük barları qoşa — boz "Cari", narıncı "Ssenari"; 100% xətti.
// Rəng qaydası (CLAUDE.md §8): "Əvvəl" boz #A3A7B7, "İndi"/ssenari #F2501E.
import { fmtPct } from '../../../shared/format';
import type { Metrics } from '../../../shared/metrics';
import { axisStyle, base, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export const BEFORE_COLOR = '#A3A7B7';
export const AFTER_COLOR = '#F2501E';

export function loadCompareOption(cur: Metrics, next: Metrics, th: ChartTheme, t: T): ChartSpec {
  const a = new Map(cur.people.map((p) => [p.name, p.load]));
  const b = new Map(next.people.map((p) => [p.name, p.load]));
  const names = [...new Set([...a.keys(), ...b.keys()])].sort(
    (x, y) => (b.get(y) ?? 0) - (b.get(x) ?? 0) || x.localeCompare(y, 'az'),
  );
  const rows = [...names].reverse();
  const pct = (v: number | undefined) => (v == null || !Number.isFinite(v) ? 0 : +(v * 100).toFixed(1));
  const max = Math.max(120, ...names.flatMap((n) => [pct(a.get(n)), pct(b.get(n))]));
  const changed = names.filter((n) => Math.abs((a.get(n) ?? 0) - (b.get(n) ?? 0)) > 1e-9);
  const summary = t('scn.chart.summary', {
    n: names.length,
    changed: changed.length,
    overBefore: cur.over.length,
    overAfter: next.over.length,
  });
  return {
    height: Math.max(220, rows.length * 30 + 80),
    summary,
    table: {
      columns: [t('field.name'), t('scn.current'), t('scn.scenario')],
      rows: names.map((n) => [n, fmtPct(a.get(n) ?? 0), fmtPct(b.get(n) ?? 0)]),
    },
    option: {
      ...base(th, summary),
      legend: { top: 0, right: 0, textStyle: { color: th.text2 }, itemWidth: 12, itemHeight: 12 },
      grid: { left: 8, right: 48, top: 32, bottom: 24, containLabel: true },
      xAxis: {
        type: 'value',
        max: Math.ceil(max / 10) * 10,
        ...axisStyle(th),
        axisLabel: { color: th.muted, formatter: '{value}%' },
      },
      yAxis: { type: 'category', data: rows, ...axisStyle(th), axisLabel: { color: th.text2, fontSize: 12 } },
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (v: number) => `${v}%`,
      },
      series: [
        {
          name: t('scn.current'),
          type: 'bar',
          barWidth: 8,
          barGap: '20%',
          itemStyle: { color: BEFORE_COLOR, borderRadius: [0, 3, 3, 0] },
          data: rows.map((n) => pct(a.get(n))),
        },
        {
          name: t('scn.scenario'),
          type: 'bar',
          barWidth: 8,
          itemStyle: { color: AFTER_COLOR, borderRadius: [0, 3, 3, 0] },
          data: rows.map((n) => pct(b.get(n))),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: th.critical, type: 'dashed' },
            label: { color: th.critical, formatter: '100%' },
            data: [{ xAxis: 100 }],
          },
        },
      ],
    },
  };
}
