// Trend (SPEC §14, §7.10): gündəlik snapshot-lardan lazım olan vs mövcud ştat. İkinci y oxu YOXDUR (§12.2);
// normanı aşanların sayı tooltip və cədvəldə.
import { fmtFte } from '../../../shared/format';
import type { SnapshotData } from '../../lib/snapshots';
import { axisStyle, base, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export function trendOption(list: SnapshotData[], th: ChartTheme, t: T): ChartSpec {
  const first = list[0];
  const last = list[list.length - 1];
  const summary = last
    ? t('trend.summary', {
        n: list.length,
        from: first.date,
        to: last.date,
        need: fmtFte(last.total.fteNeed, 1),
        have: fmtFte(last.total.fteHave, 1),
        over: last.total.over,
      })
    : '';
  const need = '#F2501E';
  const have = th.cat[0];
  return {
    height: 280,
    summary,
    table: {
      columns: [t('rep.date'), t('kpi.need'), t('kpi.have'), t('kpi.over'), t('kpi.volume')],
      rows: list.map((s) => [
        s.date,
        fmtFte(s.total.fteNeed, 2),
        fmtFte(s.total.fteHave, 2),
        s.total.over,
        Math.round(s.total.hours),
      ]),
    },
    option: {
      ...base(th, summary),
      legend: { top: 0, right: 0, textStyle: { color: th.text2 }, itemWidth: 14, itemHeight: 3 },
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: list.map((s) => s.date.slice(5)),
        boundaryGap: false,
        ...axisStyle(th),
        axisLabel: { color: th.muted },
      },
      yAxis: { type: 'value', scale: true, ...axisStyle(th), axisLabel: { color: th.muted } },
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'axis',
        formatter: (ps: { dataIndex: number }[]) => {
          const s = list[ps[0]?.dataIndex ?? 0];
          return `<b>${s.date}</b><br/>${t('kpi.need')}: <b>${fmtFte(s.total.fteNeed, 2)}</b><br/>${t('kpi.have')}: <b>${fmtFte(s.total.fteHave, 2)}</b><br/>${t('kpi.over')}: ${s.total.over}`;
        },
      },
      series: [
        {
          name: t('kpi.need'),
          type: 'line',
          symbolSize: 5,
          lineStyle: { width: 2.5, color: need },
          itemStyle: { color: need },
          data: list.map((s) => s.total.fteNeed),
        },
        {
          name: t('kpi.have'),
          type: 'line',
          symbolSize: 5,
          lineStyle: { width: 2.5, color: have, type: 'dashed' },
          itemStyle: { color: have },
          data: list.map((s) => s.total.fteHave),
        },
      ],
    },
  };
}
