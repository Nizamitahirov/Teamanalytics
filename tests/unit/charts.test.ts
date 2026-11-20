// Qrafik option funksiyaları (SPEC §6, §13.1): saf, deterministik; cədvəl görünüşü qrafiklə eyni rəqəmləri verir;
// heç bir qrafikdə eyni grid-də ikinci y oxu yoxdur (SPEC §12.2); tünd və açıq tema ayrı.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeEmployee, normalizeTask } from '../../shared/model.js';
import { computeMetrics } from '../../shared/metrics.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import { az } from '../../shared/i18n/az.js';
import * as D from '../../shared/dashboard.js';
import { darkTheme, lightTheme, type ChartSpec } from '../../src/charts/theme.js';
import { capacityOption } from '../../src/charts/options/capacity.js';
import { loadOption } from '../../src/charts/options/load.js';
import { sankeyOption } from '../../src/charts/options/sankey.js';
import { treemapOption } from '../../src/charts/options/treemap.js';
import { heatmapOption } from '../../src/charts/options/heatmap.js';
import { waterfallOption } from '../../src/charts/options/waterfall.js';
import { paretoOption } from '../../src/charts/options/pareto.js';
import { histogramOption } from '../../src/charts/options/histogram.js';
import type { MessageKey } from '../../shared/i18n/az.js';

const raw = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const input = {
  tasks: raw.tasks.map(normalizeTask),
  employees: raw.employees.map(normalizeEmployee),
  // Köhnə qayda (məzuniyyətsiz, 1922) — v1 formulası ilə uyğunluq yoxlanır; 30 günlük qayda: seed-vacation.test.ts
  settings: { ...DEFAULT_SETTINGS, vacation_days: 0 },
  year: 2026,
};
const m = computeMetrics(input);
const t = (k: MessageKey, v?: Record<string, string | number>) =>
  az[k].replace(/\{(\w+)\}/g, (x, n) => (v && n in v ? String(v[n]) : x));

function build(th: typeof lightTheme): Record<string, ChartSpec> {
  const levels = new Map(m.loads.map((l) => [l.name, l.level]));
  return {
    capacity: capacityOption(D.capacityBalance(input), th, t),
    load: loadOption(D.loadBars(m), 85, th, t),
    sankey: sankeyOption(D.transferFlows(input), (n) => levels.get(n) ?? 'idle', th, t),
    treemap: treemapOption(D.workTree(input), 'treemap', th, t),
    sunburst: treemapOption(D.workTree(input), 'sunburst', th, t),
    heatmap: heatmapOption(D.loadHeatmap(input, m), th, t),
    waterfall: waterfallOption(D.waterfall(input), 1922, th, t),
    pareto: paretoOption(D.pareto(m, input), th, t),
    histogram: histogramOption(D.loadHistogram(m), th, t),
  };
}
const light = build(lightTheme);
const dark = build(darkTheme);
const yAxes = (o: Record<string, unknown>) => {
  const y = o.yAxis;
  return (Array.isArray(y) ? y : y ? [y] : []) as { gridIndex?: number }[];
};

describe('qrafik option-ları', () => {
  for (const [name, spec] of Object.entries(light))
    it(`${name}: aria, xülasə (yer tutansız), cədvəl, hündürlük`, () => {
      expect((spec.option.aria as { enabled: boolean }).enabled).toBe(true);
      expect(spec.summary.length).toBeGreaterThan(10);
      expect(spec.summary).not.toMatch(/\{\w+\}/);
      expect(spec.table.rows.length).toBeGreaterThan(0);
      expect(spec.table.rows.every((r) => r.length === spec.table.columns.length)).toBe(true);
      expect(spec.height).toBeGreaterThanOrEqual(150);
      // Bir grid — bir y oxu
      const grids = yAxes(spec.option).map((y) => y.gridIndex ?? 0);
      expect(new Set(grids).size).toBe(grids.length);
      // JSON-a çevrilə bilir (funksiyalardan başqa) və deterministikdir
      expect(JSON.stringify(spec.option)).toBe(JSON.stringify(build(lightTheme)[name].option));
    });

  it('tünd tema ayrıca seçilib (rənglər fərqlidir), cədvəl eynidir', () => {
    expect(JSON.stringify(dark.load.option)).not.toBe(JSON.stringify(light.load.option));
    for (const k of Object.keys(light)) expect(dark[k].table).toEqual(light[k].table);
  });

  it('waterfall cədvəli qızıl rəqəmlər', () => {
    expect(light.waterfall.table.rows.map((r) => r[1])).toEqual(['28 782', '− 933', '− 0', '27 850', '− 55', '27 795']);
  });

  it('yük qrafiki: normanı aşanlar mətn işarəsi ilə (▲ — rəng tək daşıyıcı deyil)', () => {
    const ser = (
      light.load.option.series as { data: unknown[]; label: { formatter: (p: { dataIndex: number }) => string } }[]
    )[0];
    const labels = ser.data.map((_, i) => ser.label.formatter({ dataIndex: i }));
    expect(labels.filter((l) => l.endsWith('▲')).length).toBe(m.over.length);
    expect(labels.some((l) => l.endsWith('△'))).toBe(true);
  });

  it('Sankey: sol və sağ düyünlər ayrılır, axınların cəmi transfer saatıdır', () => {
    const s = (light.sankey.option.series as { data: { name: string }[]; links: { value: number }[] }[])[0];
    const sum = s.links.reduce((a, l) => a + l.value, 0);
    expect(Math.round(sum)).toBe(Math.round(m.transfers.hours));
    expect(new Set(s.data.map((d) => d.name)).size).toBe(s.data.length);
  });

  it('şirkət rəngi varlığa bağlıdır, sıraya yox (filtrdən sonra Pashapay eyni rəngdə)', () => {
    const all = (
      treemapOption(D.workTree(input), 'treemap', lightTheme, t).option.series as {
        data: { name: string; itemStyle: { color: string } }[];
      }[]
    )[0].data;
    const only = (
      treemapOption(D.workTree(input, { filters: { company: 'Pashapay' } }), 'treemap', lightTheme, t).option.series as {
        data: { name: string; itemStyle: { color: string } }[];
      }[]
    )[0].data;
    expect(only[0].itemStyle.color).toBe(all.find((d) => d.name === 'Pashapay')!.itemStyle.color);
  });
});

describe('trend (Mərhələ 9)', () => {
  it('iki xətt (lazım / mövcud), ikinci y oxu yoxdur, cədvəl və xülasə', async () => {
    const { trendOption } = await import('../../src/charts/options/trend.js');
    const { buildSnapshot } = await import('../../shared/snapshot.js');
    const { lightTheme } = await import('../../src/charts/theme.js');
    const a = buildSnapshot({ ...input, settings: { ...DEFAULT_SETTINGS } }, '2026-11-19');
    const b = buildSnapshot({ ...input, settings: { ...DEFAULT_SETTINGS } }, '2026-11-20');
    const spec = trendOption(
      [a, b],
      lightTheme,
      (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`,
    );
    const o = spec.option as { series: { type: string }[]; yAxis: unknown };
    expect(o.series.map((x) => x.type)).toEqual(['line', 'line']);
    expect(Array.isArray(o.yAxis)).toBe(false);
    expect(spec.table.rows).toHaveLength(2);
    expect(spec.summary).toContain('"over":7');
  });
});
