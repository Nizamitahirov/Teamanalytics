import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { formatDateTime } from '../../lib/dates';
import { useCan } from '../../app/useCan';
import { Button } from '../../components/Button';
import { EChart } from '../../charts/EChart';
import type { ChartSpec } from '../../charts/theme';
import s from './Reports.module.css';

/**
 * Hesabat "kağızı" (SPEC §6.7): ekranda A4 üfüqi enində (1000 px) — çapda eyni görünür; tətbiq qabığı gizlənir.
 * `?print=1` → qrafiklər çəkildikdən sonra avtomatik `window.print()`.
 */
export function ReportFrame({
  title,
  subtitle,
  meta,
  children,
  toolbar,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  children: ReactNode;
  toolbar?: ReactNode;
}) {
  const { t } = useI18n();
  const { name } = useCan();
  const [params] = useSearchParams();
  const printed = useRef(false);
  const auto = params.get('print') === '1';
  useEffect(() => {
    if (!auto || printed.current) return;
    printed.current = true;
    const id = window.setTimeout(() => window.print(), 1200);
    return () => window.clearTimeout(id);
  }, [auto]);

  return (
    <>
      <div className={s.toolbar} data-print-hide>
        <Link to="/reports" className={s.back}>
          <ArrowLeft size={16} aria-hidden="true" /> {t('rep.back')}
        </Link>
        <span className={s.spacer} />
        {toolbar}
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" /> {t('rep.print')}
        </Button>
      </div>
      <p className={s.printHint} data-print-hide>
        {t('rep.printHint')}
      </p>
      <div className={s.scroller}>
        <article className={s.paper} data-testid="report">
          <header className={s.head} data-print-block>
            <div>
              <p className={s.kicker}>Workforce Planning · {t('app.dept')}</p>
              <h1>{title}</h1>
              {subtitle && <p className={s.sub}>{subtitle}</p>}
            </div>
            <dl className={s.meta}>
              <div>
                <dt>{t('rep.date')}</dt>
                <dd>{formatDateTime(new Date().toISOString())}</dd>
              </div>
              <div>
                <dt>{t('rep.preparedBy')}</dt>
                <dd>{name}</dd>
              </div>
              {meta}
            </dl>
          </header>
          {children}
        </article>
      </div>
    </>
  );
}

/** Hesabatda qrafik: alətlər yoxdur, çapda kəsilmir; cədvəl/xülasə ekran oxuyucu üçün. */
export function ReportChart({ title, spec, height }: { title: string; spec: ChartSpec; height?: number }) {
  return (
    <figure className={s.chart} data-print-block>
      <figcaption>{title}</figcaption>
      <EChart option={spec.option} height={height ?? spec.height} label={spec.summary} />
    </figure>
  );
}

export function Section({ title, children, page }: { title: string; children: ReactNode; page?: boolean }) {
  return (
    <section className={s.section} data-print-page={page || undefined}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
