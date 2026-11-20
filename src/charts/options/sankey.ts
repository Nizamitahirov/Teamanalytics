// 5. Ötürmə axını — Sankey: sol ilkin sahib, sağ cari sahib; eni = saat; axın rəngi qəbul edənin yük statusu ilə.
import { fmtHours } from '../../../shared/format';
import type { Flow } from '../../../shared/dashboard';
import type { LoadLevel } from '../../../shared/metrics';
import { base, statusColor, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export const L = '← '; // sol tərəf nişanı (eyni ad hər iki tərəfdə ola bilər)
export const stripSide = (n: string) => n.replace(/^(← |→ )/, '');

export function sankeyOption(flows: Flow[], levelOf: (name: string) => LoadLevel, th: ChartTheme, t: T): ChartSpec {
  const total = flows.reduce((a, f) => a + f.hours, 0);
  const left = [...new Set(flows.map((f) => f.from))];
  const right = [...new Set(flows.map((f) => f.to))];
  const top = flows
    .slice(0, 3)
    .map((f) => `${f.from} → ${f.to} (${fmtHours(f.hours)})`)
    .join('; ');
  const summary = t('chart.sankey.summary', { n: flows.reduce((a, f) => a + f.count, 0), h: fmtHours(total), top: top || '—' });
  return {
    height: Math.max(340, Math.max(left.length, right.length) * 34 + 40),
    summary,
    table: {
      columns: [t('chart.sankey.from'), t('chart.sankey.to'), t('emp.tasks'), t('unit.hours')],
      rows: flows.map((f) => [f.from, f.to, f.count, fmtHours(f.hours)]),
    },
    option: {
      ...base(th, summary),
      tooltip: {
        ...base(th, '').tooltip,
        trigger: 'item',
        formatter: (p: {
          dataType: string;
          data: { source?: string; target?: string; value: number; count?: number; name?: string };
        }) =>
          p.dataType === 'edge'
            ? `${stripSide(p.data.source!)} → <b>${stripSide(p.data.target!)}</b><br/>${p.data.count} ${t('emp.tasks')} · <b>${fmtHours(p.data.value)}</b> ${t('unit.hours')}`
            : `<b>${stripSide(p.data.name!)}</b>: ${fmtHours(p.data.value)} ${t('unit.hours')}`,
      },
      series: [
        {
          type: 'sankey',
          left: 8,
          right: 120,
          top: 8,
          bottom: 8,
          nodeWidth: 12,
          nodeGap: 12,
          nodeAlign: 'justify',
          draggable: false,
          label: { color: th.text, fontSize: 12, fontWeight: 500, formatter: (p: { name: string }) => stripSide(p.name) },
          itemStyle: { color: th.neutral, borderWidth: 0, borderRadius: 3 },
          // ECharts default opacity 0.2 çox solğundur; qəbul edənin yük statusu rəngi 0.35 ilə
          lineStyle: { curveness: 0.5, opacity: th.mode === 'light' ? 0.32 : 0.4 },
          emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.65 } },
          data: [...left.map((n) => ({ name: L + n })), ...right.map((n) => ({ name: '→ ' + n }))],
          links: flows.map((f) => ({
            source: L + f.from,
            target: '→ ' + f.to,
            value: f.hours,
            count: f.count,
            lineStyle: { color: statusColor(th, levelOf(f.to)) },
          })),
        },
      ],
    },
  };
}
