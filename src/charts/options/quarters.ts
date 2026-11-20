// Optimizasiya: rüblər üzrə plan vs fakt (SPEC §6.6). Plan — boz, fakt — narıncı (CLAUDE.md §8 "Əvvəl/İndi" rəngləri).
import { fmtHours } from '../../../shared/format';
import { axisStyle, base, type ChartSpec, type ChartTheme } from '../theme';
import { AFTER_COLOR, BEFORE_COLOR } from './loadCompare';
import type { T } from './types';

export function quartersOption(rows: { quarter: string; plan: number; fact: number }[], th: ChartTheme, t: T): ChartSpec {
  const plan = rows.reduce((s, r) => s + r.plan, 0);
  const fact = rows.reduce((s, r) => s + r.fact, 0);
  const summary = t('opt.chart.summary', { n: rows.length, plan: fmtHours(plan), fact: fmtHours(fact) });
  return {
    height: 260,
    summary,
    table: {
      columns: [t('opt.quarter'), t('opt.plan'), t('opt.fact')],
      rows: rows.map((r) => [r.quarter, fmtHours(r.plan), fmtHours(r.fact)]),
    },
    option: {
      ...base(th, summary),
      legend: { top: 0, right: 0, textStyle: { color: th.text2 }, itemWidth: 12, itemHeight: 12 },
      grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: rows.map((r) => r.quarter), ...axisStyle(th), axisLabel: { color: th.text2 } },
      yAxis: { type: 'value', ...axisStyle(th), axisLabel: { color: th.muted } },
      tooltip: { ...base(th, '').tooltip, trigger: 'axis', valueFormatter: (v: number) => `${fmtHours(v)} ${t('unit.hours')}` },
      series: [
        {
          name: t('opt.plan'),
          type: 'bar',
          barMaxWidth: 28,
          itemStyle: { color: BEFORE_COLOR, borderRadius: [4, 4, 0, 0] },
          data: rows.map((r) => +r.plan.toFixed(1)),
        },
        {
          name: t('opt.fact'),
          type: 'bar',
          barMaxWidth: 28,
          itemStyle: { color: AFTER_COLOR, borderRadius: [4, 4, 0, 0] },
          data: rows.map((r) => +r.fact.toFixed(1)),
        },
      ],
    },
  };
}
