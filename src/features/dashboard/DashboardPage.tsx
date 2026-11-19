import { useMemo, useState } from 'react';
import { AlertCircle, Ban, Flame, Inbox, Repeat, Zap } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';
import { computeMetrics, type View } from '../../../shared/metrics';
import { fmtFte, fmtHours, fmtPct, formatNumber } from '../../../shared/format';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import s from './DashboardPage.module.css';

/**
 * Panel — Mərhələ 2 versiyası: hero + ikinci sıra KPI-lar, rəqəmlər shared/metrics.ts-dən (SPEC §6.2 bənd 1–2).
 * Qrafiklər, filtr çipləri, sparkline-lar — Mərhələ 4.
 */
export function DashboardPage() {
  const { t } = useI18n();
  const [view, setView] = useState<View>('current');
  const ready = useData((st) => st.ready);
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const m = useMemo(() => computeMetrics({ tasks, employees, settings }, { view }), [tasks, employees, settings, view]);

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
        <Kpi
          icon={<Flame size={20} />}
          label={t('kpi.over')}
          testId="kpi-over"
          value={String(m.over.length)}
          unit={t('unit.people')}
          foot={t('kpi.overFoot')}
        />
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
        </div>
      )}
      <p className={s.note}>{t('dash.more')}</p>
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
