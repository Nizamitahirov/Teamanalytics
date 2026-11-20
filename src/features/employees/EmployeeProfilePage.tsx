import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { RowSelectionState, SortingState } from '@tanstack/react-table';
import { ArrowLeft, ArrowRightLeft, Pencil, Plus, UserX, Users } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';
import { useMetrics } from '../../hooks/useMetrics';
import { useCan } from '../../app/useCan';
import { Button } from '../../components/Button';
import { CompanyBadge, LoadBar, LoadChip } from '../../components/Badges';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { curOwner } from '../../../shared/model';
import { levelOf } from '../../../shared/metrics';
import { fmtFte, fmtHours, fmtPct } from '../../../shared/format';
import { formatDateTime } from '../../lib/dates';
import { TaskTable, DEFAULT_HIDDEN } from '../tasks/TaskTable';
import { TaskDrawer } from '../tasks/TaskDrawer';
import { TransferDialog } from '../tasks/TransferDialog';
import { CancelDialog } from '../tasks/CancelDialog';
import { EmployeeDialog } from './EmployeeDialog';
import s from './EmployeeProfilePage.module.css';

const PALETTE = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'];

/** Əməkdaş profili `/employees/:name` (SPEC §6.3): başlıq, tutum, tapşırıqlar, proses paylanması, tarixçə. */
export function EmployeeProfilePage() {
  const { t } = useI18n();
  const name = decodeURIComponent(useParams().name ?? '');
  const [params, setParams] = useSearchParams();
  const ready = useData((st) => st.ready);
  const employees = useData((st) => st.data.employees);
  const tasks = useData((st) => st.data.tasks);
  const log = useData((st) => st.data.log);
  const { loads, settings } = useMetrics();
  const { canEdit } = useCan();
  const [tab, setTab] = useState<'current' | 'given'>('current');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'hours', desc: true }]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [dialog, setDialog] = useState<null | { kind: 'transfer' | 'cancel' | 'edit'; ids: string[] }>(null);
  const openId = params.get('task');
  const setTask = useCallback(
    (id: string | null) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (id) n.set('task', id);
          else n.delete('task');
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  const emp = employees.find((e) => e.name === name);
  const current = useMemo(() => tasks.filter((x) => curOwner(x) === name), [tasks, name]);
  const given = useMemo(
    () => tasks.filter((x) => x.owner_before === name && x.owner_after && x.owner_after !== name),
    [tasks, name],
  );
  const activeIds = current.filter((x) => !x.is_cancelled).map((x) => x.id);
  const l = loads.get(name);
  const cap = l?.cap ?? settings.norm * (emp?.fte ?? 1);
  const hours = l?.hours ?? 0;
  const load = l?.load ?? 0;

  const byProcess = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of current) if (!x.is_cancelled) m.set(x.process, (m.get(x.process) ?? 0) + x.hours);
    const sorted = [...m].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((a, [, h]) => a + h, 0);
    return rest > 0 ? [...top, [t('common.other'), rest] as [string, number]] : top;
  }, [current, t]);
  const total = byProcess.reduce((a, [, h]) => a + h, 0);

  const history = useMemo(() => {
    const ids = new Set([...current, ...given].map((x) => x.id));
    return log
      .filter((e) => e.from === name || e.to === name || (e.task_id && ids.has(e.task_id)))
      .slice(-50)
      .reverse();
  }, [log, current, given, name]);

  const onTransfer = useCallback((ids: string[]) => setDialog({ kind: 'transfer', ids }), []);
  const onCancel = useCallback((ids: string[]) => setDialog({ kind: 'cancel', ids }), []);

  if (!ready) return <Skeleton height={320} radius={16} />;
  if (!emp && !current.length)
    return (
      <EmptyState
        icon={<UserX size={26} />}
        title={t('emp.notFound', { name })}
        actions={
          <Link to="/employees" className="grad-text" style={{ fontWeight: 700 }}>
            {t('emp.backToList')}
          </Link>
        }
      />
    );

  const rows = tab === 'current' ? current : given;
  return (
    <>
      <Link to="/employees" className={s.back}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('nav.employees')}
      </Link>
      <header className={s.header}>
        <div className={s.avatar} aria-hidden="true">
          {emp?.is_group ? <Users size={26} /> : name.charAt(0)}
        </div>
        <div className={s.who}>
          <h2>{name}</h2>
          <div className={s.tags}>
            {emp && <CompanyBadge company={emp.company} />}
            <span>{emp?.activity}</span>
            {emp && !emp.is_group && <span>· {t('emp.fteValue', { fte: fmtFte(emp.fte, 2) })}</span>}
            {emp?.is_group && <span>· {t('emp.group')}</span>}
            {!emp && <span>· {t('emp.unknown')}</span>}
          </div>
        </div>
        {canEdit && (
          <div className={s.actions}>
            <Button onClick={() => setTask('new')}>
              <Plus size={16} aria-hidden="true" /> {t('task.new')}
            </Button>
            <Button onClick={() => setDialog({ kind: 'transfer', ids: activeIds })} disabled={!activeIds.length}>
              <ArrowRightLeft size={16} aria-hidden="true" /> {t('emp.transferAll')}
            </Button>
            {emp && (
              <Button variant="primary" onClick={() => setDialog({ kind: 'edit', ids: [] })}>
                <Pencil size={16} aria-hidden="true" /> {t('emp.edit')}
              </Button>
            )}
          </div>
        )}
      </header>

      <div className={s.cols}>
        <section className={s.card} aria-labelledby="cap-h">
          <h3 id="cap-h">{t('emp.capacity')}</h3>
          {emp?.is_group ? (
            <p>{t('emp.groupHint')}</p>
          ) : (
            <>
              <div className={s.capRow}>
                <span className={s.big} data-testid="profile-load">
                  {fmtPct(load)}
                </span>
                <LoadChip load={load} level={levelOf(load, settings.warn)} />
              </div>
              <LoadBar load={load} level={levelOf(load, settings.warn)} label={t('emp.loadOf', { name })} />
              <dl className={s.capList}>
                <dt>{t('emp.capFormula', { norm: fmtHours(settings.norm), fte: fmtFte(emp?.fte ?? 1, 2) })}</dt>
                <dd>{fmtHours(cap)}</dd>
                <dt>{t('emp.assigned')}</dt>
                <dd>{fmtHours(hours)}</dd>
                <dt>{hours <= cap ? t('emp.free') : t('emp.overBy')}</dt>
                <dd>{fmtHours(Math.abs(cap - hours))}</dd>
              </dl>
            </>
          )}
        </section>
        <section className={s.card} aria-labelledby="proc-h">
          <h3 id="proc-h">{t('emp.byProcess')}</h3>
          {total > 0 ? (
            <>
              <div className={s.stack} role="img" aria-label={byProcess.map(([p, h]) => `${p}: ${fmtPct(h / total)}`).join(', ')}>
                {byProcess.map(([p, h], i) => (
                  <span
                    key={`${i}-${p}`}
                    style={{ width: `${(h / total) * 100}%`, background: i < 6 ? PALETTE[i] : 'var(--muted)' }}
                  />
                ))}
              </div>
              <ul className={s.legend}>
                {byProcess.map(([p, h], i) => (
                  <li key={`${i}-${p}`}>
                    <i style={{ background: i < 6 ? PALETTE[i] : 'var(--muted)' }} aria-hidden="true" />
                    <span>{p}</span>
                    <span>
                      {fmtHours(h)} {t('unit.hours')} · {fmtPct(h / total)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={s.when}>{t('emp.noTasks')}</p>
          )}
        </section>
      </div>

      <div className={s.tabs} role="tablist" aria-label={t('nav.tasks')}>
        <button type="button" role="tab" className={s.tab} aria-selected={tab === 'current'} onClick={() => setTab('current')}>
          {t('emp.tabCurrent', { n: current.length })}
        </button>
        <button type="button" role="tab" className={s.tab} aria-selected={tab === 'given'} onClick={() => setTab('given')}>
          {t('emp.tabGiven', { n: given.length })}
        </button>
      </div>
      <TaskTable
        readOnly={!canEdit}
        rows={rows}
        sorting={sorting}
        onSortingChange={setSorting}
        selection={selection}
        onSelectionChange={setSelection}
        hidden={[...DEFAULT_HIDDEN, 'company']}
        onOpen={setTask}
        onTransfer={onTransfer}
        onCancel={onCancel}
        height="min(60vh, 560px)"
        empty={t('emp.noTasks')}
      />

      <section className={s.card} style={{ marginTop: 'var(--sp-5)' }} aria-labelledby="hist-h">
        <h3 id="hist-h">{t('emp.history')}</h3>
        {history.length ? (
          <ul className={s.timeline}>
            {history.map((e) => (
              <li key={e.id}>
                <span className={s.when}>{formatDateTime(e.ts)}</span>
                <span>
                  <span className={e.to === name ? s.in : e.from === name ? s.out : undefined}>{e.action}</span> {e.task_label}
                  {e.from && e.to && ` · ${e.from} → ${e.to}`}
                  {e.comment && ` · “${e.comment}”`}
                  {e.user && <span className={s.when}> · {e.user}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.when}>{t('task.noHistory')}</p>
        )}
      </section>

      {openId && (
        <TaskDrawer key={openId} id={openId} preset={{ owner: name, company: emp?.company }} onClose={() => setTask(null)} />
      )}
      {dialog?.kind === 'transfer' && (
        <TransferDialog ids={dialog.ids} onClose={() => setDialog(null)} onDone={() => setSelection({})} />
      )}
      {dialog?.kind === 'cancel' && <CancelDialog ids={dialog.ids} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <EmployeeDialog name={name} onClose={() => setDialog(null)} />}
    </>
  );
}
