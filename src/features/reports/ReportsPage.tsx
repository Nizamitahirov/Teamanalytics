import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarChart3, CalendarRange, FileSpreadsheet, FileText, History, Layers, Upload, UserRound } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { useData } from '../../store';
import { useCan } from '../../app/useCan';
import { Button } from '../../components/Button';
import { ACT_ADMIN, ACT_PROJECT } from '../../../shared/constants';
import { exportCsv, exportExcel, exportTemplate } from './exportExcel';
import f from '../../components/Form.module.css';
import s from './Reports.module.css';

const enc = encodeURIComponent;

/** Hesabatlar (SPEC §6.7, §9): rəhbərlik hesabatı, əməkdaş kartı, proses, jurnal, Excel/CSV export və import. */
export function ReportsPage() {
  const { t } = useI18n();
  const { canEdit, name } = useCan();
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const scenarios = useData((st) => st.scenarios);
  const companies = useMemo(() => [...new Set(tasks.map((x) => x.company))].sort(), [tasks]);
  const processes = useMemo(
    () => [...new Set(tasks.map((x) => x.process).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az')),
    [tasks],
  );
  const people = useMemo(
    () =>
      employees
        .filter((e) => !e.is_group)
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'az')),
    [employees],
  );
  const [company, setCompany] = useState('');
  const [activity, setActivity] = useState('');
  const [emp, setEmp] = useState('');
  const [proc, setProc] = useState('');
  const [scn, setScn] = useState('');
  const [busy, setBusy] = useState(false);

  const execUrl = `/reports/executive?${new URLSearchParams({ ...(company ? { company } : {}), ...(activity ? { activity } : {}) })}`;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      toast(t('rep.exported'));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.hub}>
      <section className={s.card} aria-labelledby="r-exec">
        <h2 id="r-exec">
          <BarChart3 size={20} aria-hidden="true" /> {t('rep.exec.title')}
        </h2>
        <p>{t('rep.exec.desc')}</p>
        <div className={s.filters}>
          <select
            className={f.input}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label={t('field.company')}
          >
            <option value="">{t('rep.allCompanies')}</option>
            {companies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            className={f.input}
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            aria-label={t('field.activity')}
          >
            <option value="">{t('rep.allActivities')}</option>
            <option>{ACT_ADMIN}</option>
            <option>{ACT_PROJECT}</option>
          </select>
        </div>
        <div className={s.actions}>
          <Link className={`${s.linkBtn} ${s.linkPrimary}`} to={execUrl}>
            {t('rep.open')}
          </Link>
          <Link className={s.linkBtn} to={`${execUrl}${execUrl.endsWith('?') ? '' : '&'}print=1`} target="_blank">
            {t('rep.pdf')}
          </Link>
        </div>
      </section>

      <section className={s.card} aria-labelledby="r-emp">
        <h2 id="r-emp">
          <UserRound size={20} aria-hidden="true" /> {t('rep.emp.card')}
        </h2>
        <p>{t('rep.emp.desc')}</p>
        <select className={f.input} value={emp} onChange={(e) => setEmp(e.target.value)} aria-label={t('field.name')}>
          <option value="">—</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <div className={s.actions}>
          {emp ? (
            <Link className={`${s.linkBtn} ${s.linkPrimary}`} to={`/reports/employee/${enc(emp)}`}>
              {t('rep.open')}
            </Link>
          ) : (
            <span className={`${s.linkBtn} ${s.disabled}`} aria-disabled="true">
              {t('rep.open')}
            </span>
          )}
        </div>
      </section>

      <section className={s.card} aria-labelledby="r-proc">
        <h2 id="r-proc">
          <Layers size={20} aria-hidden="true" /> {t('rep.proc.card')}
        </h2>
        <p>{t('rep.proc.desc')}</p>
        <select className={f.input} value={proc} onChange={(e) => setProc(e.target.value)} aria-label={t('field.process')}>
          <option value="">—</option>
          {processes.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <div className={s.actions}>
          {proc ? (
            <Link className={`${s.linkBtn} ${s.linkPrimary}`} to={`/reports/process/${enc(proc)}`}>
              {t('rep.open')}
            </Link>
          ) : (
            <span className={`${s.linkBtn} ${s.disabled}`} aria-disabled="true">
              {t('rep.open')}
            </span>
          )}
        </div>
      </section>

      <section className={s.card} aria-labelledby="r-log">
        <h2 id="r-log">
          <History size={20} aria-hidden="true" /> {t('rep.log.title')}
        </h2>
        <p>{t('rep.log.desc')}</p>
        <div className={s.actions}>
          <Link className={`${s.linkBtn} ${s.linkPrimary}`} to="/reports/log">
            {t('rep.open')}
          </Link>
        </div>
      </section>

      <section className={`${s.card} ${s.disabled}`} aria-labelledby="r-period">
        <h2 id="r-period">
          <CalendarRange size={20} aria-hidden="true" /> {t('rep.period.title')}
        </h2>
        <p>{t('rep.period.desc')}</p>
      </section>

      <section className={s.card} aria-labelledby="r-xlsx">
        <h2 id="r-xlsx">
          <FileSpreadsheet size={20} aria-hidden="true" /> {t('rep.excel.title')}
        </h2>
        <p>{t('rep.excel.desc')}</p>
        <select className={f.input} value={scn} onChange={(e) => setScn(e.target.value)} aria-label={t('rep.excel.scenario')}>
          <option value="">{t('rep.excel.noScenario')}</option>
          {scenarios
            .filter((x) => x.status !== 'archived')
            .map((x) => (
              <option key={x.id} value={x.id}>
                {t('rep.excel.withScenario', { name: x.name })}
              </option>
            ))}
        </select>
        <div className={s.actions}>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void run(() => exportExcel(name, scenarios.find((x) => x.id === scn) ?? null))}
          >
            <FileSpreadsheet size={16} aria-hidden="true" /> Excel
          </Button>
          <Button disabled={busy} onClick={() => void run(() => exportCsv(name))}>
            <FileText size={16} aria-hidden="true" /> CSV
          </Button>
          <Button disabled={busy} onClick={() => void run(exportTemplate)}>
            {t('rep.excel.template')}
          </Button>
        </div>
      </section>

      {canEdit && (
        <section className={s.card} aria-labelledby="r-import">
          <h2 id="r-import">
            <Upload size={20} aria-hidden="true" /> {t('imp.title')}
          </h2>
          <p>{t('imp.desc')}</p>
          <div className={s.actions}>
            <Link className={`${s.linkBtn} ${s.linkPrimary}`} to="/reports/import">
              {t('imp.start')}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
