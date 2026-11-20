// 6. İş həcminin strukturu — Treemap (drill-down) / Sunburst; sahə = saat; rəng = şirkət (varlığa bağlı).
import { fmtHours, fmtPct } from '../../../shared/format';
import type { TreeNode } from '../../../shared/dashboard';
import { base, companyColor, type ChartSpec, type ChartTheme } from '../theme';
import type { T } from './types';

export function treemapOption(tree: TreeNode[], mode: 'treemap' | 'sunburst', th: ChartTheme, t: T): ChartSpec {
  const total = tree.reduce((a, x) => a + x.value, 0) || 1;
  const colored = tree.map((c, i) => ({ ...c, itemStyle: { color: companyColor(th, c.name, i) } }));
  const procs = tree
    .flatMap((c) => (c.children ?? []).map((p) => ({ company: c.name, process: p.name, value: p.value })))
    .sort((a, b) => b.value - a.value);
  const summary = t('chart.tree.summary', {
    parts: tree.map((c) => `${c.name} ${fmtHours(c.value)} (${fmtPct(c.value / total)})`).join(', '),
    top: procs
      .slice(0, 3)
      .map((p) => p.process)
      .join(', '),
  });
  const tooltip = {
    ...base(th, '').tooltip,
    formatter: (p: { treePathInfo?: { name: string }[]; value: number; name: string }) => {
      const path =
        (p.treePathInfo ?? [])
          .map((x) => x.name)
          .filter(Boolean)
          .join(' › ') || p.name;
      return `${path}<br/><b>${fmtHours(p.value)}</b> ${t('unit.hours')} · ${fmtPct(p.value / total)}`;
    },
  };
  const series =
    mode === 'treemap'
      ? {
          type: 'treemap',
          data: colored,
          roam: false,
          leafDepth: 2,
          top: 8,
          left: 4,
          right: 4,
          bottom: 36,
          visibleMin: 40,
          breadcrumb: {
            show: true,
            bottom: 4,
            itemStyle: { color: th.surface, borderColor: th.grid, textStyle: { color: th.text } },
          },
          label: {
            show: true,
            color: '#fff',
            fontSize: 12,
            overflow: 'truncate',
            formatter: (p: { name: string; value: number }) => `${p.name}\n${fmtHours(p.value)}`,
          },
          upperLabel: { show: true, height: 22, color: '#fff', fontWeight: 700 },
          itemStyle: { borderColor: th.surface, borderWidth: 2, gapWidth: 2 },
          levels: [
            { itemStyle: { borderWidth: 0, gapWidth: 3 } },
            { colorSaturation: [0.35, 0.6], itemStyle: { gapWidth: 2, borderColorSaturation: 0.6 } },
            { colorSaturation: [0.3, 0.55], itemStyle: { gapWidth: 1 } },
          ],
        }
      : {
          type: 'sunburst',
          data: colored,
          radius: ['12%', '92%'],
          sort: undefined,
          itemStyle: { borderColor: th.surface, borderWidth: 2 },
          label: { color: '#fff', fontSize: 11, minAngle: 8, rotate: 'radial' },
          levels: [
            {},
            { label: { rotate: 0, fontWeight: 700 } },
            { r0: '35%', r: '65%' },
            { r0: '65%', r: '78%', label: { minAngle: 14 } },
            { r0: '78%', r: '92%', label: { show: false } },
          ],
        };
  return {
    height: 420,
    summary,
    table: {
      columns: [t('field.company'), t('field.process'), t('unit.hours'), '%'],
      rows: procs.map((p) => [p.company, p.process, fmtHours(p.value), fmtPct(p.value / total)]),
    },
    option: { ...base(th, summary), tooltip, series: [series] },
  };
}
