// 4. Əməkdaşların yüklənməsi — üfüqi bar, sıralı; 85–100% zona, 100% xətti; rəng + mətn etiketi/▲ (rəng tək daşıyıcı deyil).
import { fmtFte, fmtHours, fmtPct } from '../../../shared/format';
import type { EmployeeLoad } from '../../../shared/metrics';
import { axisStyle, base, glow, hGrad, statusColor, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export function loadOption(bars: EmployeeLoad[], warn: number, th: ChartTheme, t: T): ChartSpec {
  const rows = [...bars].reverse(); // ECharts category oxu aşağıdan yuxarı — ən yüklü yuxarıda
  const over = bars.filter((b) => b.load > 1);
  const summary = t('chart.load.summary', {
    n: bars.length,
    over: over.length,
    names: over.map((o) => `${o.name} ${fmtPct(o.load)}`).join(', ') || '—',
  });
  const max = Math.max(1.2, ...bars.map((b) => (Number.isFinite(b.load) ? b.load : 1.5))) * 100;
  return {
    height: Math.max(220, rows.length * 26 + 70),
    summary,
    table: {
      columns: [t('field.name'), t('emp.load'), t('unit.hours'), t('emp.capacity'), t('emp.tasks'), t('field.activity')],
      rows: bars.map((b) => [b.name, fmtPct(b.load), fmtHours(b.hours), fmtHours(b.cap), b.tasks, b.activity]),
    },
    option: {
      ...base(th, summary),
      grid: { left: 8, right: 56, top: 16, bottom: 24, containLabel: true },
      xAxis: {
        type: 'value',
        max: Math.ceil(max / 10) * 10,
        ...axisStyle(th),
        axisLabel: { color: th.muted, formatter: '{value}%' },
      },
      yAxis: { type: 'category', data: rows.map((r) => r.name), ...axisStyle(th), axisLabel: { color: th.text2, fontSize: 12 } },
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const b = rows[p.dataIndex];
          return `<b>${b.name}</b><br/>${t('emp.load')}: <b>${fmtPct(b.load)}</b> · ${t(`level.${b.level}`)}<br/>${fmtHours(b.hours)} / ${fmtHours(b.cap)} ${t('unit.hours')} · ${fmtFte(b.fte, 2)} ${t('field.fte')}<br/>${b.tasks} ${t('emp.tasks')} · ${b.activity}`;
        },
      },
      series: [
        {
          type: 'bar',
          barWidth: 12,
          showBackground: true,
          backgroundStyle: { color: th.mode === 'light' ? 'rgba(15,23,42,0.035)' : 'rgba(255,255,255,0.04)', borderRadius: 6 },
          data: rows.map((b) => ({
            value: Number.isFinite(b.load) ? +(b.load * 100).toFixed(1) : max,
            itemStyle: { color: hGrad(statusColor(th, b.level)), borderRadius: 8, ...glow(th, statusColor(th, b.level)) },
          })),
          label: {
            show: true,
            position: 'right',
            color: th.text,
            fontSize: 11,
            fontWeight: 600,
            formatter: (p: { dataIndex: number }) => {
              const b = rows[p.dataIndex];
              return b.level === 'critical'
                ? `${fmtPct(b.load)} ▲`
                : b.level === 'warning'
                  ? `${fmtPct(b.load)} △`
                  : fmtPct(b.load);
            },
          },
          markArea: {
            silent: true,
            itemStyle: { color: th.mode === 'light' ? 'rgba(250,178,25,0.10)' : 'rgba(250,178,25,0.08)' },
            data: [[{ xAxis: warn }, { xAxis: 100 }]],
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: th.critical, type: 'dashed', width: 1.5 },
            label: { color: th.text2, formatter: t('chart.load.norm'), position: 'end' },
            data: [{ xAxis: 100 }],
          },
        },
      ],
    },
  };
}
