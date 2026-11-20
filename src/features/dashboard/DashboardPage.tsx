import { lazy, Suspense, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertCircle, Ban, Flame, Inbox, Repeat, Zap } from 'lucide-react';
import { ACT_ADMIN, ACT_PROJECT } from '../../../shared/constants';
import type { Filters } from '../../../shared/metrics';
// Qrafiklər (ECharts) ayrıca chunk-da: hero və KPI-lar dərhal görünür, qrafiklər arxasınca (SPEC §11 — LCP)
const DashboardWidgets = lazy(() => import('./DashboardWidgets').then((m) => ({ default: m.DashboardWidgets })));
import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';
import { computeMetrics, type View } from '../../../shared/metrics';
import { fmtFte, fmtHours, fmtPct, formatNumber } from '../../../shared/format';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { BalanceButton } from '../scenarios/BalanceButton';
import s from './DashboardPage.module.css';

/**
 * Panel (SPEC §6.2): görünüş (Cari / Optimizasiyadan sonra) və qlobal filtrlər (şirkət, fəaliyyət forması) URL-də;
 * hero + KPI-lar + qrafiklər. Bütün rəqəmlər shared/metrics.ts və shared/dashboard.ts-dən.
 */
export function DashboardPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'opt' ? 'opt' : 'current';
  const company = params.get('company') ?? '';
  const activity = params.get('activity') ?? '';
  const filters: Filters = useMemo(() => ({ company: company || null, activity: activity || null }), [company, activity]);
  const setParam = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  const setView = (v: View) => setParam('view', v === 'opt' ? 'opt' : '');
  const ready = useData((st) => st.ready);
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const m = useMemo(
    () => computeMetrics({ tasks, employees, settings }, { view, filters }),
    [tasks, employees, settings, view, filters],
  );
  const companies = useMemo(() => [...new Set(tasks.map((x) => x.company))].sort((a, b) => a.localeCompare(b, 'az')), [tasks]);

  if (!ready)
    return (
      <div aria-busy="true" aria-label={t('state.loading')}>
        <Skeleton height={150} radius={22} />
        <div style={{ height: 16 }} />
        <Skeleton height={88} radius={16} />
      </div>
    );
  if (!tasks.length)
    return (
      <EmptyState icon={<Inbox size={26} />} title={t('dash.emptyTitle')}>
        {t('dash.emptyBody')}
      </EmptyState>
    );

  const N = m.norm;
  const gap = m.gap;
  const unitH = t('unit.hours');
  const unitF = t('unit.fte');

  return (
    <>
      <div className={s.head}>
        <div className={s.seg} role="group" aria-label={t('dash.view')}>
          {(['current', 'opt'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'current' ? t('dash.viewCurrent') : t('dash.viewOpt')}
            </button>
          ))}
        </div>
        <div className={s.seg} role="group" aria-label={t('field.company')}>
          {['', ...companies].map((c) => (
            <button key={c || 'all'} type="button" aria-pressed={company === c} onClick={() => setParam('company', c)}>
              {c || t('dash.allCompanies')}
            </button>
          ))}
        </div>
        <div className={s.seg} role="group" aria-label={t('field.activity')}>
          {['', ACT_ADMIN, ACT_PROJECT].map((a) => (
            <button key={a || 'all'} type="button" aria-pressed={activity === a} onClick={() => setParam('activity', a)}>
              {a === ACT_PROJECT ? t('dash.project') : a || t('dash.allActivities')}
            </button>
          ))}
        </div>
      </div>

      <section className={s.hero} aria-label={t('page.dashboard')}>
        <div className={s.stat}>
          <div className={s.label}>{t('kpi.volume')}</div>
          <div className={s.value} data-testid="kpi-volume">
            {fmtHours(m.totalHours)}
            <small>{unitH}</small>
          </div>
          <div className={s.foot}>{t('kpi.volumeFoot', { n: formatNumber(m.activeTasks) })}</div>
        </div>
        <div className={s.stat}>
          <div className={s.label}>{t('kpi.need')}</div>
          <div className={s.value} data-testid="kpi-need">
            {fmtFte(m.fteNeed)}
            <small>{unitF}</small>
          </div>
          <div className={s.foot}>{t('kpi.needFoot', { h: fmtHours(m.totalHours), norm: formatNumber(N) })}</div>
        </div>
        <div className={s.stat}>
          <div className={s.label}>{t('kpi.have')}</div>
          <div className={s.value} data-testid="kpi-have">
            {fmtFte(m.fteHave)}
            <small>{unitF}</small>
          </div>
          <div className={s.foot}>{t('kpi.haveFoot', { n: m.people.length })}</div>
        </div>
        <div className={s.stat}>
          <div className={s.label}>{gap >= 0 ? t('kpi.reserve') : t('kpi.shortage')}</div>
          <div className={s.value} data-testid="kpi-gap">
            <span className={`${s.chip} ${gap < 0 ? s.chipBad : ''}`}>
              {gap < 0 && <AlertCircle size={18} aria-hidden="true" />}
              {gap >= 0 ? '+' : '−'}
              {fmtFte(Math.abs(gap))}
            </span>
            <small>{unitF}</small>
          </div>
          <div className={s.foot}>
            {gap >= 0 ? t('kpi.gapFree', { h: fmtHours(gap * N) }) : t('kpi.gapExtra', { h: fmtHours(-gap * N) })}
          </div>
        </div>
      </section>

      <section className={s.kpis}>
        <Link to="/employees?level=critical" className={s.kpiLink}>
          <Kpi
            icon={<Flame size={20} />}
            label={t('kpi.over')}
            testId="kpi-over"
            value={String(m.over.length)}
            unit={t('unit.people')}
            foot={t('kpi.overFoot')}
          />
        </Link>
        <Kpi
          icon={<Ban size={20} />}
          label={t('kpi.cancelled')}
          testId="kpi-cancelled"
          value={fmtHours(m.cancelled.hours)}
          unit={unitH}
          foot={t('kpi.cancelledFoot', { n: m.cancelled.count, fte: fmtFte(m.cancelled.hours / N, 2) })}
        />
        <Kpi
          icon={<Repeat size={20} />}
          label={t('kpi.transfers')}
          testId="kpi-transfers"
          value={formatNumber(m.transfers.count)}
          foot={t('kpi.transfersFoot', { h: fmtHours(m.transfers.hours) })}
        />
        <Kpi
          icon={<Zap size={20} />}
          label={t('kpi.opt')}
          testId="kpi-opt"
          value={fmtHours(m.optPotential)}
          unit={unitH}
          foot={view === 'opt' ? t('kpi.optApplied') : t('kpi.optFoot', { fte: fmtFte(m.optPotential / N, 2) })}
        />
      </section>

      {m.over.length > 0 && (
        <div className={s.over}>
          <strong>{t('dash.overList')}:</strong>
          {m.over.map((o) => (
            <span key={o.name} className={s.person}>
              <AlertCircle size={14} aria-hidden="true" />
              {o.name} · {fmtPct(o.load)}
            </span>
          ))}
          <span style={{ marginLeft: 'auto' }}>
            <BalanceButton size="sm" />
          </span>
        </div>
      )}
      <Suspense
        fallback={
          <div style={{ marginTop: 16, display: 'grid', gap: 16 }} aria-busy="true" aria-label={t('state.loading')}>
            <Skeleton height={170} radius={16} />
            <Skeleton height={520} radius={16} />
          </div>
        }
      >
        <DashboardWidgets view={view} filters={filters} m={m} />
      </Suspense>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  unit,
  foot,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  foot: string;
  testId: string;
}) {
  return (
    <div className={s.card}>
      <div className={s.ic} aria-hidden="true">
        {icon}
      </div>
      <div>
        <div className={s.kl}>{label}</div>
        <div className={s.kv} data-testid={testId}>
          {value}
          {unit && <small>{unit}</small>}
        </div>
        <div className={s.kf}>{foot}</div>
      </div>
    </div>
  );
}
