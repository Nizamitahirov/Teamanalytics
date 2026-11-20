import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Download, LineChart } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';
import { Button } from '../../components/Button';
import { LoadChip } from '../../components/Badges';
import { ChartFrame } from '../../charts/ChartFrame';
import { useChartTheme } from '../../charts/useChartTheme';
import { companyColor } from '../../charts/theme';
import { capacityOption } from '../../charts/options/capacity';
import { loadOption } from '../../charts/options/load';
import { sankeyOption, stripSide } from '../../charts/options/sankey';
import { treemapOption } from '../../charts/options/treemap';
import { heatmapOption } from '../../charts/options/heatmap';
import { waterfallOption } from '../../charts/options/waterfall';
import { paretoOption } from '../../charts/options/pareto';
import { histogramOption } from '../../charts/options/histogram';
import {
  OTHER,
  capacityBalance,
  companyActivityMatrix,
  loadBars,
  loadHeatmap,
  loadHistogram,
  pareto,
  staffTable,
  transferFlows,
  waterfall,
  workTree,
} from '../../../shared/dashboard';
import { effectiveNorm, levelOf, type Filters, type Metrics, type View } from '../../../shared/metrics';
import { fmtFte, fmtHours, formatNumber } from '../../../shared/format';
import { ACT_PROJECT } from '../../../shared/constants';
import s from './DashboardWidgets.module.css';

/** Panelin qrafik hissəsi (SPEC §6.2 bəndlər 3–13). Bütün vidjetlər görünüşə və qlobal filtrlərə tabedir. */
export function DashboardWidgets({ view, filters, m }: { view: View; filters: Filters; m: Metrics }) {
  const { t } = useI18n();
  const th = useChartTheme();
  const navigate = useNavigate();
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const log = useData((st) => st.data.log);
  const [groups, setGroups] = useState(false);
  const [treeMode, setTreeMode] = useState<'treemap' | 'sunburst'>('treemap');
  const input = useMemo(() => ({ tasks, employees, settings }), [tasks, employees, settings]);
  const opts = useMemo(() => ({ view, filters }), [view, filters]);
  const levels = useMemo(() => new Map(m.loads.map((l) => [l.name, l.level])), [m]);
  const bg = th.surface;

  const specs = useMemo(
    () => ({
      cap: capacityOption(capacityBalance(input, filters), th, t),
      load: loadOption(loadBars(m, { groups }), settings.warn, th, t),
      sankey: sankeyOption(transferFlows(input, opts), (n) => levels.get(n) ?? 'idle', th, t),
      tree: treemapOption(workTree(input, opts), treeMode, th, t),
      heat: heatmapOption(loadHeatmap(input, m, opts), th, t),
      wf: waterfallOption(waterfall(input, filters), effectiveNorm(settings), th, t),
      pareto: paretoOption(pareto(m, input, opts), th, t),
      hist: histogramOption(loadHistogram(m), th, t),
    }),
    [input, filters, opts, m, groups, treeMode, settings, levels, th, t],
  );
  const matrix = useMemo(() => companyActivityMatrix(input, opts), [input, opts]);
  const staff = useMemo(() => staffTable(input, m, log, { filters }), [input, m, log, filters]);
  const hasFlows = specs.sankey.table.rows.length > 0;

  const exportCsv = () => {
    const head = [
      t('field.name'),
      t('field.company'),
      t('field.activity'),
      t('field.fte'),
      t('emp.tasks'),
      t('unit.hours'),
      t('emp.capacity'),
      t('emp.free'),
      t('emp.load'),
      t('dash.staff.single'),
      t('dash.staff.recv'),
      t('dash.staff.gave'),
    ];
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = staff.map((r) => [
      r.name,
      r.company,
      r.activity,
      r.isGroup ? '' : r.fte,
      r.tasks,
      r.hours.toFixed(2),
      r.isGroup ? '' : r.cap.toFixed(0),
      r.isGroup ? '' : r.free.toFixed(2),
      r.isGroup ? '' : (r.load * 100).toFixed(1),
      r.singleProcesses,
      r.received30.toFixed(2),
      r.given30.toFixed(2),
    ]);
    const csv = '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stat-cedveli.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className={s.grid}>
      <ChartFrame
        className={s.s12}
        testId="w-capacity"
        title={t('dash.w.capacity')}
        info={t('dash.i.capacity')}
        spec={specs.cap}
        background={bg}
      />

      <ChartFrame
        className={s.s8}
        testId="w-load"
        title={t('dash.w.load')}
        subtitle={t('dash.s.load', { warn: settings.warn })}
        info={t('dash.i.load')}
        spec={specs.load}
        background={bg}
        onClick={(p) => {
          const name = loadBars(m, { groups }).slice().reverse()[p.dataIndex]?.name;
          if (name) navigate(`/employees/${encodeURIComponent(name)}`);
        }}
        extra={
          <label className={s.check}>
            <input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} /> {t('dash.showGroups')}
          </label>
        }
      />

      <section className={`${s.s4}`} aria-labelledby="mx-h" data-testid="w-matrix">
        <div
          className={s.cell}
          style={{
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-1)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--sp-4) var(--sp-5)',
            height: '100%',
          }}
        >
          <h2 id="mx-h" style={{ margin: '0 0 var(--sp-3)', fontSize: 'var(--fs-16)', fontWeight: 800 }}>
            {t('dash.w.matrix')}
          </h2>
          <div className={s.matrix}>
            {matrix.map((c, i) => (
              <div key={`${c.company}-${c.activity}`} className={s.cell}>
                <h3>
                  <i style={{ background: companyColor(th, c.company, i) }} aria-hidden="true" />
                  {c.company} · {c.activity === ACT_PROJECT ? t('dash.project') : c.activity}
                </h3>
                <dl>
                  <dt>{t('unit.hours')}</dt>
                  <dd>{fmtHours(c.hours)}</dd>
                  <dt>{t('kpi.need')}</dt>
                  <dd>{fmtFte(c.fte, 2)}</dd>
                  <dt>{t('unit.people')}</dt>
                  <dd>{c.people}</dd>
                  <dt>{t('nav.tasks')}</dt>
                  <dd>{c.tasks}</dd>
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      {hasFlows ? (
        <ChartFrame
          className={s.s12}
          testId="w-sankey"
          title={t('dash.w.sankey')}
          subtitle={t('dash.s.sankey')}
          info={t('dash.i.sankey')}
          spec={specs.sankey}
          background={bg}
          onClick={(p) => {
            const d = p.data as { source?: string; target?: string; name?: string };
            if (p.dataType === 'edge' && d.target)
              navigate(`/tasks?quick=transfers&owner=${encodeURIComponent(stripSide(d.target))}`);
            else if (d.name) navigate(`/employees/${encodeURIComponent(stripSide(d.name))}`);
          }}
        />
      ) : (
        <section className={`${s.s12} ${s.cell}`} data-testid="w-sankey">
          <h2 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>{t('dash.w.sankey')}</h2>
          <p className={s.empty}>{t('dash.e.sankey')}</p>
        </section>
      )}

      <ChartFrame
        className={s.s7}
        testId="w-tree"
        title={t('dash.w.tree')}
        subtitle={t('dash.s.tree')}
        info={t('dash.i.tree')}
        spec={specs.tree}
        background={bg}
        onClick={(p) => {
          const d = p.data as { id?: string } | undefined;
          if (d?.id) navigate(`/tasks?task=${encodeURIComponent(d.id)}`);
        }}
        extra={
          <div className={s.seg} role="group" aria-label={t('dash.treeMode')}>
            <button type="button" aria-pressed={treeMode === 'treemap'} onClick={() => setTreeMode('treemap')}>
              Treemap
            </button>
            <button type="button" aria-pressed={treeMode === 'sunburst'} onClick={() => setTreeMode('sunburst')}>
              Sunburst
            </button>
          </div>
        }
      />

      <ChartFrame
        className={s.s5}
        testId="w-waterfall"
        title={t('dash.w.waterfall')}
        info={t('dash.i.waterfall')}
        spec={specs.wf}
        background={bg}
      />

      <ChartFrame
        className={s.s12}
        testId="w-heatmap"
        title={t('dash.w.heatmap')}
        subtitle={t('dash.s.heatmap')}
        info={t('dash.i.heatmap')}
        spec={specs.heat}
        background={bg}
        onClick={(p) => {
          const v = (p.data as { value?: [number, number, number] })?.value;
          if (!v) return;
          const h = loadHeatmap(input, m, opts);
          const owner = [...h.rows].reverse()[v[1]];
          const proc = h.cols[v[0]];
          navigate(`/tasks?owner=${encodeURIComponent(owner)}${proc !== OTHER ? `&process=${encodeURIComponent(proc)}` : ''}`);
        }}
      />

      <ChartFrame
        className={s.s6}
        testId="w-pareto"
        title={t('dash.w.pareto')}
        info={t('dash.i.pareto')}
        spec={specs.pareto}
        background={bg}
        onClick={(p) => p.name && navigate(`/tasks?process=${encodeURIComponent(p.name)}`)}
      />

      <ChartFrame
        className={s.s6}
        testId="w-hist"
        title={t('dash.w.hist')}
        info={t('dash.i.hist')}
        spec={specs.hist}
        background={bg}
      />

      <section
        className={`${s.s12} ${s.cell}`}
        style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4) var(--sp-5)' }}
        data-testid="w-trend"
      >
        <h2 style={{ margin: 0, fontSize: 'var(--fs-16)', fontWeight: 800 }}>{t('dash.w.trend')}</h2>
        <div className={s.empty}>
          <LineChart size={28} aria-hidden="true" />
          <p>{t('dash.e.trend')}</p>
        </div>
      </section>

      <section
        className={`${s.s12} ${s.cell}`}
        style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4) var(--sp-5)' }}
        aria-labelledby="staff-h"
        data-testid="w-staff"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--sp-3)' }}>
          <h2 id="staff-h" style={{ margin: 0, flex: 1, fontSize: 'var(--fs-16)', fontWeight: 800 }}>
            {t('dash.w.staff')}
          </h2>
          <Button size="sm" onClick={exportCsv}>
            <Download size={14} aria-hidden="true" /> CSV
          </Button>
        </div>
        <div className={s.staffWrap}>
          <table className={s.staff}>
            <thead>
              <tr>
                <th scope="col">{t('field.name')}</th>
                <th scope="col">{t('field.fte')}</th>
                <th scope="col">{t('emp.tasks')}</th>
                <th scope="col">{t('unit.hours')}</th>
                <th scope="col">{t('emp.capacity')}</th>
                <th scope="col">{t('emp.free')}</th>
                <th scope="col">{t('emp.load')}</th>
                <th scope="col">{t('dash.staff.single')}</th>
                <th scope="col">{t('dash.staff.recv')}</th>
                <th scope="col">{t('dash.staff.gave')}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((r) => (
                <tr key={r.name}>
                  <td>
                    <Link className={s.link} to={`/employees/${encodeURIComponent(r.name)}`}>
                      {r.name}
                    </Link>
                    {r.isGroup && <span style={{ color: 'var(--muted)' }}> · {t('emp.group')}</span>}
                  </td>
                  <td>{r.isGroup ? '—' : fmtFte(r.fte, 2)}</td>
                  <td>{r.tasks}</td>
                  <td>{fmtHours(r.hours)}</td>
                  <td>{r.isGroup ? '—' : fmtHours(r.cap)}</td>
                  <td>{r.isGroup ? '—' : fmtHours(r.free)}</td>
                  <td>{r.isGroup ? '—' : <LoadChip load={r.load} level={levelOf(r.load, settings.warn)} />}</td>
                  <td>{r.singleProcesses || ''}</td>
                  <td>{r.received30 ? `+${fmtHours(r.received30)}` : ''}</td>
                  <td>{r.given30 ? `−${fmtHours(r.given30)}` : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('dash.staff.total')}</td>
                <td>{fmtFte(m.fteHave, 2)}</td>
                <td>{formatNumber(m.activeTasks)}</td>
                <td>{fmtHours(m.totalHours)}</td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
