// 8. Ləğv və optimizasiya — Waterfall: Bütün işlər → − Ləğv → − Realizə olunmuş → = Cari → − Potensial → = Hədəf.
import { fmtFte, fmtHours } from '../../../shared/format';
import type { Step } from '../../../shared/dashboard';
import type { MessageKey } from '../../../shared/i18n/az';
import { axisStyle, base, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export function waterfallOption(steps: Step[], norm: number, th: ChartTheme, t: T): ChartSpec {
  const labels = steps.map((s) => t(`chart.wf.${s.key}` as MessageKey));
  let level = 0;
  const bases: number[] = [];
  const vals: number[] = [];
  for (const s of steps) {
    if (s.kind === 'total') {
      level = s.value;
      bases.push(0);
      vals.push(s.value);
    } else {
      level -= s.value;
      bases.push(level);
      vals.push(s.value);
    }
  }
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s.value]));
  const summary = t('chart.wf.summary', {
    all: fmtHours(byKey.all),
    cancelled: fmtHours(byKey.cancelled),
    current: fmtHours(byKey.current),
    target: fmtHours(byKey.target),
  });
  return {
    height: 340,
    summary,
    table: {
      columns: [t('chart.col.step'), t('unit.hours'), 'FTE'],
      rows: steps.map((s, i) => [labels[i], (s.kind === 'minus' ? '− ' : '') + fmtHours(s.value), fmtFte(s.value / norm, 2)]),
    },
    option: {
      ...base(th, summary),
      grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        ...axisStyle(th),
        splitLine: { show: false },
        axisLabel: {
          color: th.text2,
          fontSize: 10,
          interval: 0,
          lineHeight: 13,
          formatter: (v: string) => v.replace(/ /g, '\n'),
        },
      },
      // Bar qrafiki həmişə sıfırdan başlayır — kəsik ox fərqləri şişirdir (dataviz anti-pattern)
      yAxis: {
        type: 'value',
        min: 0,
        ...axisStyle(th),
        axisLabel: { color: th.muted, formatter: (v: number) => fmtHours(v) },
      },
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          const s = steps[i];
          return `<b>${labels[i]}</b><br/>${s.kind === 'minus' ? '− ' : ''}${fmtHours(s.value)} ${t('unit.hours')} · ${fmtFte(s.value / norm, 2)} FTE`;
        },
      },
      series: [
        { type: 'bar', stack: 'wf', silent: true, itemStyle: { color: 'transparent' }, data: bases, barWidth: '38%' },
        {
          type: 'bar',
          stack: 'wf',
          barWidth: '38%',
          data: vals.map((v, i) => ({
            value: v,
            itemStyle: {
              color: steps[i].kind === 'total' ? th.neutral : th.cat[1],
              borderRadius: 4,
              decal: steps[i].kind === 'minus' ? undefined : undefined,
            },
          })),
          label: {
            show: true,
            position: 'top',
            color: th.text,
            fontSize: 11,
            fontWeight: 700,
            formatter: (p: { dataIndex: number }) =>
              (steps[p.dataIndex].kind === 'minus' ? '− ' : '') + fmtHours(steps[p.dataIndex].value),
          },
        },
      ],
    },
  };
}
