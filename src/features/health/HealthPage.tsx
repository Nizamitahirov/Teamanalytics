import { useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowRightLeft, Check, CheckCircle2, Copy, Hash, Merge, Timer, UserX, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { actions, dataStore, useData } from '../../store';
import { useCan } from '../../app/useCan';
import { useHealth } from '../../hooks/useHealth';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { TransferDialog } from '../tasks/TransferDialog';
import { EmployeeDialog } from '../employees/EmployeeDialog';
import { HEALTH_KINDS, type Finding, type HealthKind } from '../../../shared/health';
import { fmtHours, formatNumber } from '../../../shared/format';
import f from '../../components/Form.module.css';
import s from './Health.module.css';

const ICON: Record<HealthKind, LucideIcon> = {
  name_dup: Users,
  task_dup: Copy,
  hours_mismatch: Timer,
  bad_id: Hash,
  orphan: UserX,
  departed: UserX,
  no_capacity: AlertTriangle,
};
const undo = (t: (k: 'top.undo') => string) => ({ label: t('top.undo'), fn: () => dataStore.getState().undoLast() });

/** Data sağlamlığı (SPEC §6.8): avtomatik yoxlamalar və düzəliş əməliyyatları (düzəlişlər — admin, SPEC §2). */
export function HealthPage() {
  const { t } = useI18n();
  const ready = useData((st) => st.ready);
  const findings = useHealth();
  const { isAdmin } = useCan();
  const [transfer, setTransfer] = useState<string[] | null>(null);
  const [emp, setEmp] = useState<string | null>(null);
  const [merge, setMerge] = useState<Finding | null>(null);
  const [del, setDel] = useState<{ f: Finding; ids: string[] } | null>(null);

  if (!ready) return <Skeleton height={320} radius={16} />;
  if (!findings.length)
    return (
      <EmptyState icon={<CheckCircle2 size={26} />} title={t('health.clean')}>
        {t('health.cleanBody')}
      </EmptyState>
    );

  const ignore = (x: Finding) => {
    actions.ignoreFinding(x);
    toast(t('health.ignored'), { action: undo(t) });
  };
  const fmt = (n: string | number) => (typeof n === 'number' ? formatNumber(n, n % 1 ? 2 : 0) : n);

  const body = (x: Finding) => {
    const d = Object.fromEntries(Object.entries(x.data).map(([k, v]) => [k, fmt(v)]));
    switch (x.kind) {
      case 'name_dup':
        return t('health.d.name_dup', d);
      case 'task_dup':
        return t('health.d.task_dup', d);
      case 'hours_mismatch':
        return t('health.d.hours_mismatch', d);
      case 'bad_id':
        return x.data.reason === 'empty'
          ? t('health.d.bad_id_empty', d)
          : x.data.twin
            ? t('health.d.bad_id_twin', d)
            : t('health.d.bad_id', d);
      case 'orphan':
        return t('health.d.orphan', { ...d, hours: fmtHours(Number(x.data.hours)) });
      case 'departed':
        return t('health.d.departed', { ...d, hours: fmtHours(Number(x.data.hours)) });
      case 'no_capacity':
        return t('health.d.no_capacity', d);
    }
  };

  const fixes = (x: Finding) => {
    const keep = isAdmin && (
      <Button size="sm" variant="ghost" onClick={() => ignore(x)}>
        <Check size={14} aria-hidden="true" />{' '}
        {x.kind === 'name_dup' || x.kind === 'task_dup' ? t('health.differ') : t('health.keep')}
      </Button>
    );
    if (!isAdmin) return null;
    switch (x.kind) {
      case 'name_dup':
        return (
          <>
            <Button size="sm" variant="primary" onClick={() => setMerge(x)}>
              <Merge size={14} aria-hidden="true" /> {t('health.merge')}
            </Button>
            {keep}
          </>
        );
      case 'task_dup':
        return (
          <>
            <Button size="sm" variant="primary" onClick={() => setDel({ f: x, ids: x.tasks.slice(1) })}>
              {t('health.deleteDup')}
            </Button>
            {keep}
          </>
        );
      case 'hours_mismatch':
        return (
          <>
            <Button
              size="sm"
              variant="primary"
              onClick={() => actions.useCalculatedHours(x.tasks[0]) && toast(t('health.fixed'), { action: undo(t) })}
            >
              {t('health.useCalc', { h: fmt(x.data.calc) })}
            </Button>
            {keep}
          </>
        );
      case 'bad_id':
        return (
          <>
            {x.data.twin && (
              <Button size="sm" variant="primary" onClick={() => setDel({ f: x, ids: [x.tasks[0]] })}>
                {t('health.deleteId', { id: x.data.id })}
              </Button>
            )}
            {x.data.suggest && (
              <Button
                size="sm"
                onClick={() =>
                  actions.renameTask(x.tasks[0], String(x.data.suggest)) && toast(t('health.fixed'), { action: undo(t) })
                }
              >
                {t('health.renameId', { id: x.data.suggest })}
              </Button>
            )}
            <Link className={s.link} to={`/tasks?task=${encodeURIComponent(x.tasks[0])}`}>
              {t('health.open')}
            </Link>
            {keep}
          </>
        );
      case 'orphan':
      case 'departed':
        return (
          <>
            <Button size="sm" variant="primary" onClick={() => setTransfer(x.tasks)}>
              <ArrowRightLeft size={14} aria-hidden="true" />{' '}
              {x.kind === 'departed' ? t('emp.transferAll') : t('health.transfer')}
            </Button>
            {keep}
          </>
        );
      case 'no_capacity':
        return (
          <>
            <Button size="sm" variant="primary" onClick={() => setEmp(String(x.data.owner))}>
              {t('health.setFte')}
            </Button>
            {keep}
          </>
        );
    }
  };

  return (
    <>
      <p className={s.intro}>{t('health.intro', { n: findings.length })}</p>
      {!isAdmin && <p className={s.note}>{t('health.adminOnly')}</p>}
      {HEALTH_KINDS.map((kind) => {
        const list = findings.filter((x) => x.kind === kind);
        if (!list.length) return null;
        const Icon = ICON[kind];
        return (
          <section key={kind} className={s.group} aria-labelledby={`h-${kind}`}>
            <h2 id={`h-${kind}`}>
              <Icon size={18} aria-hidden="true" /> {t(`health.k.${kind}`)} <span className={s.count}>{list.length}</span>
            </h2>
            <p className={s.rule}>{t(`health.r.${kind}`)}</p>
            <ul className={s.list}>
              {list.map((x) => (
                <li key={x.key} className={s.item} data-finding={x.key}>
                  <p>{body(x)}</p>
                  <div className={s.actions}>{fixes(x)}</div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {transfer && <TransferDialog ids={transfer} onClose={() => setTransfer(null)} />}
      {emp && <EmployeeDialog name={emp} onClose={() => setEmp(null)} />}
      {merge && <MergeDialog f={merge} onClose={() => setMerge(null)} />}
      {del && (
        <Modal
          title={t('health.deleteTitle')}
          onClose={() => setDel(null)}
          footer={
            <>
              <Button onClick={() => setDel(null)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  actions.deleteTasks(del.ids);
                  setDel(null);
                  toast(t('health.fixed'), { action: undo(t) });
                }}
              >
                {t('health.deleteConfirm', { n: del.ids.length })}
              </Button>
            </>
          }
        >
          <p>
            {t('health.deleteBody', { ids: del.ids.join(', '), keep: del.f.tasks.find((id) => !del.ids.includes(id)) ?? '' })}
          </p>
        </Modal>
      )}
    </>
  );
}

/** Ad dublikatı → birləşdirmə önizləməsi: hansı ad qalır, neçə iş keçir. */
function MergeDialog({ f: x, onClose }: { f: Finding; onClose: () => void }) {
  const { t } = useI18n();
  const employees = useData((st) => st.data.employees);
  const tasks = useData((st) => st.data.tasks);
  const [a, b] = x.employees;
  const [keep, setKeep] = useState(Number(x.data.aTasks) >= Number(x.data.bTasks) ? a : b);
  const drop = keep === a ? b : a;
  const moving = tasks.filter((y) => y.owner_before === drop || y.owner_after === drop).length;
  const submit = () => {
    const target = employees.find((e) => e.name === keep);
    if (!target) return;
    const { _v, ...rest } = target;
    void _v;
    actions.saveEmployee(drop, rest);
    onClose();
    toast(t('health.merged', { from: drop, to: keep }), { action: undo(t) });
  };
  return (
    <Modal
      title={t('health.mergeTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit}>
            <Merge size={16} aria-hidden="true" /> {t('health.merge')}
          </Button>
        </>
      }
    >
      <fieldset className={s.fieldset}>
        <legend className={f.label}>{t('health.keepName')}</legend>
        {[a, b].map((n) => {
          const e = employees.find((y) => y.name === n);
          return (
            <label key={n} className={f.check}>
              <input type="radio" name="keep" checked={keep === n} onChange={() => setKeep(n)} />
              <b>{n}</b>
              <span className={s.muted}>
                {e?.company} · {n === a ? x.data.aTasks : x.data.bTasks} {t('emp.tasks')}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className={s.preview} aria-live="polite">
        {t('health.mergePreview', { from: drop, to: keep, n: moving })}
      </p>
    </Modal>
  );
}
