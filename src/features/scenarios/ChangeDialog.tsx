import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { EmployeePicker } from '../../components/EmployeePicker';
import { TaskPicker } from '../../components/TaskPicker';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { scenarioActions } from '../../store';
import { ACT_ADMIN, ACT_PROJECT } from '../../../shared/constants';
import { CHANGE_KINDS, type ChangeKind, type Scenario } from '../../../shared/schema';
import {
  addEmployeeIn,
  automateIn,
  cancelIn,
  fteIn,
  hoursIn,
  makeChange,
  newTaskIn,
  normIn,
  rebalanceIn,
  removeEmployeeIn,
  scenarioState,
  transferIn,
} from '../../../shared/scenario';
import { rebalance } from '../../../shared/rebalance';
import { newTaskId } from '../../store/actions';
import { fmtHours, fmtPct } from '../../../shared/format';
import f from '../../components/Form.module.css';
import s from './Scenarios.module.css';

const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : NaN;
};

/** Ssenariyə dəyişiklik əlavə etmək (SPEC §6.5): ötür, ləğv et, saat dəyiş, yeni iş, əməkdaş, ştat, norma, avtomatlaşdırma, balans. */
export function ChangeDialog({ sc, initialKind, onClose }: { sc: Scenario; initialKind?: ChangeKind; onClose: () => void }) {
  const { t } = useI18n();
  const before = useMemo(() => scenarioState(scenarioActions.live(), sc.changes), [sc.changes]);
  const [kind, setKind] = useState<ChangeKind>(initialKind ?? 'transfer');
  const [ids, setIds] = useState<string[]>([]);
  const [who, setWho] = useState('');
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [name, setName] = useState('');
  const [process, setProcess] = useState('');
  const [company, setCompany] = useState('Birbank');
  const [activity, setActivity] = useState(ACT_ADMIN);
  const [theta, setTheta] = useState('1');
  const [sameCompany, setSameCompany] = useState(true);
  const [sameActivity, setSameActivity] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => before.tasks.filter((x) => !x.is_cancelled), [before]);
  const cancelled = useMemo(() => before.tasks.filter((x) => x.is_cancelled), [before]);
  const people = useMemo(
    () => before.employees.filter((e) => e.active && !e.is_group).sort((a, b) => a.name.localeCompare(b.name, 'az')),
    [before],
  );
  const processes = useMemo(() => [...new Set(before.tasks.map((x) => x.process).filter(Boolean))].sort(), [before]);
  const companies = useMemo(() => [...new Set(before.employees.map((e) => e.company))].sort(), [before]);
  const rb = useMemo(
    () => (kind === 'rebalance' ? rebalance(before, { threshold: Number(theta), sameCompany, sameActivity }) : null),
    [kind, before, theta, sameCompany, sameActivity],
  );

  const reset = (k: ChangeKind) => {
    setKind(k);
    setIds([]);
    setValue(k === 'norm' ? String(before.settings.norm) : '');
    setWho('');
    setTo('');
  };

  /** Seçilmiş növ üçün yeni vəziyyət və etiket; forma tam deyilsə null. */
  const build = (): { after: typeof before; label: string } | null => {
    const n = num(value);
    switch (kind) {
      case 'transfer':
        return ids.length && to.trim()
          ? { after: transferIn(before, ids, to.trim()), label: t('chg.l.transfer', { n: ids.length, to: to.trim() }) }
          : null;
      case 'cancel':
      case 'restore':
        return ids.length
          ? { after: cancelIn(before, ids, kind === 'cancel'), label: t(`chg.l.${kind}`, { n: ids.length }) }
          : null;
      case 'hours': {
        const task = before.tasks.find((x) => x.id === ids[0]);
        return task && n >= 0
          ? {
              after: hoursIn(before, task.id, n),
              label: t('chg.l.hours', { task: task.task, from: fmtHours(task.hours), to: fmtHours(n) }),
            }
          : null;
      }
      case 'new_task':
        return name.trim() && process.trim() && n >= 0 && to.trim()
          ? {
              after: newTaskIn(
                before,
                { id: newTaskId(), company, process: process.trim(), task: name.trim(), hours: n },
                to.trim(),
              ),
              label: t('chg.l.new_task', { task: name.trim(), h: fmtHours(n), to: to.trim() }),
            }
          : null;
      case 'add_employee':
        return name.trim() && n >= 0 && !before.employees.some((e) => e.name === name.trim())
          ? {
              after: addEmployeeIn(before, { name: name.trim(), company, activity, fte: n, is_group: false, active: true }),
              label: t('chg.l.add_employee', { name: name.trim(), fte: n }),
            }
          : null;
      case 'remove_employee':
        return who && to.trim() !== who
          ? {
              after: removeEmployeeIn(before, who, to.trim()),
              label: to.trim() ? t('chg.l.remove_to', { name: who, to: to.trim() }) : t('chg.l.remove_auto', { name: who }),
            }
          : null;
      case 'fte':
        return who && n >= 0 ? { after: fteIn(before, who, n), label: t('chg.l.fte', { name: who, fte: n }) } : null;
      case 'norm':
        return n > 0 ? { after: normIn(before, n), label: t('chg.l.norm', { n }) } : null;
      case 'automate':
        return process && n > 0 && n <= 100
          ? { after: automateIn(before, process, n, company || undefined), label: t('chg.l.automate', { process, pct: n }) }
          : null;
      case 'rebalance':
        return rb && rb.moves.length
          ? {
              after: rebalanceIn(before, rb),
              label: t('chg.l.rebalance', { n: rb.moves.length, theta: fmtPct(Number(theta)) }),
            }
          : null;
    }
  };
  const built = build();

  const submit = async () => {
    if (!built) return;
    const change = makeChange(kind, built.label, before, built.after);
    if (!change) {
      toast(t('chg.noop'));
      return;
    }
    setBusy(true);
    try {
      await scenarioActions.addChange(sc, change);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const numberField = (id: string, label: string, hint?: string) => (
    <div className={f.field}>
      <label className={f.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={f.input} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      {hint && <span className={f.hint}>{hint}</span>}
    </div>
  );
  const employeeSelect = (label: string) => (
    <div className={f.field}>
      <label className={f.label} htmlFor="chg-who">
        {label}
      </label>
      <select
        id="chg-who"
        className={f.input}
        value={who}
        onChange={(e) => {
          setWho(e.target.value);
          if (kind === 'fte') setValue(String(people.find((p) => p.name === e.target.value)?.fte ?? ''));
        }}
      >
        <option value="">—</option>
        {people.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
  const companySelect = (withAll = false) => (
    <div className={f.field}>
      <label className={f.label} htmlFor="chg-company">
        {t('field.company')}
      </label>
      <select id="chg-company" className={f.input} value={company} onChange={(e) => setCompany(e.target.value)}>
        {withAll && <option value="">{t('filter.all')}</option>}
        {companies.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </div>
  );

  return (
    <Modal
      title={t('chg.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!built || busy}>
            <Plus size={16} aria-hidden="true" /> {t('chg.add')}
          </Button>
        </>
      }
    >
      <div className={f.grid}>
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="chg-kind">
            {t('chg.kind')}
          </label>
          <select
            id="chg-kind"
            className={f.input}
            value={kind}
            onChange={(e) => reset(e.target.value as ChangeKind)}
            data-autofocus
          >
            {CHANGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`chg.k.${k}`)}
              </option>
            ))}
          </select>
        </div>

        {(kind === 'transfer' || kind === 'cancel' || kind === 'restore' || kind === 'hours') && (
          <div className={f.full}>
            <TaskPicker
              tasks={kind === 'restore' ? cancelled : active}
              value={ids}
              multi={kind !== 'hours'}
              onChange={(v) => {
                setIds(v);
                if (kind === 'hours') setValue(String(before.tasks.find((x) => x.id === v[0])?.hours ?? ''));
              }}
              label={t('chg.tasks')}
            />
          </div>
        )}
        {kind === 'transfer' && (
          <div className={f.full}>
            <EmployeePicker label={t('transfer.to')} value={to} onChange={setTo} />
          </div>
        )}
        {kind === 'hours' && numberField('chg-hours', t('chg.newHours'))}

        {kind === 'new_task' && (
          <>
            {companySelect()}
            <div className={f.field}>
              <label className={f.label} htmlFor="chg-process">
                {t('field.process')}
              </label>
              <input
                id="chg-process"
                className={f.input}
                list="chg-processes"
                value={process}
                onChange={(e) => setProcess(e.target.value)}
              />
            </div>
            <div className={`${f.field} ${f.full}`}>
              <label className={f.label} htmlFor="chg-name">
                {t('field.task')}
              </label>
              <input id="chg-name" className={f.input} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {numberField('chg-hours', t('chg.yearHours'))}
            <div className={f.field}>
              <EmployeePicker label={t('field.owner')} value={to} onChange={setTo} />
            </div>
          </>
        )}

        {kind === 'add_employee' && (
          <>
            <div className={f.field}>
              <label className={f.label} htmlFor="chg-name">
                {t('field.name')}
              </label>
              <input id="chg-name" className={f.input} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {numberField('chg-fte', t('field.fte'), t('chg.fteHint'))}
            {companySelect()}
            <div className={f.field}>
              <label className={f.label} htmlFor="chg-activity">
                {t('field.activity')}
              </label>
              <select id="chg-activity" className={f.input} value={activity} onChange={(e) => setActivity(e.target.value)}>
                <option>{ACT_ADMIN}</option>
                <option>{ACT_PROJECT}</option>
              </select>
            </div>
          </>
        )}

        {kind === 'remove_employee' && (
          <>
            {employeeSelect(t('chg.leaving'))}
            <div className={f.field}>
              <EmployeePicker label={t('chg.recipient')} value={to} onChange={setTo} exclude={who ? [who] : []} />
              <span className={f.hint}>{t('chg.recipientHint')}</span>
            </div>
          </>
        )}

        {kind === 'fte' && (
          <>
            {employeeSelect(t('field.name'))}
            {numberField('chg-fte', t('field.fte'), t('chg.fteHint'))}
          </>
        )}

        {kind === 'norm' && numberField('chg-norm', t('set.norm'), t('chg.normHint'))}

        {kind === 'automate' && (
          <>
            <div className={f.field}>
              <label className={f.label} htmlFor="chg-process">
                {t('field.process')}
              </label>
              <select id="chg-process" className={f.input} value={process} onChange={(e) => setProcess(e.target.value)}>
                <option value="">—</option>
                {processes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            {companySelect(true)}
            {numberField('chg-pct', t('chg.pct'), t('chg.pctHint'))}
          </>
        )}

        {kind === 'rebalance' && (
          <>
            <div className={f.field}>
              <label className={f.label} htmlFor="chg-theta">
                {t('rb.threshold')}
              </label>
              <select id="chg-theta" className={f.input} value={theta} onChange={(e) => setTheta(e.target.value)}>
                <option value="1">{t('rb.norm')}</option>
                <option value={String(before.settings.warn / 100)}>{t('rb.warn', { pct: before.settings.warn })}</option>
              </select>
            </div>
            <div className={f.field}>
              <label className={f.check}>
                <input type="checkbox" checked={sameCompany} onChange={(e) => setSameCompany(e.target.checked)} />
                {t('rb.sameCompany')}
              </label>
              <label className={f.check}>
                <input type="checkbox" checked={sameActivity} onChange={(e) => setSameActivity(e.target.checked)} />
                {t('rb.sameActivity')}
              </label>
            </div>
            {rb && (
              <div className={`${f.full} ${s.rbBox}`} aria-live="polite">
                {rb.donors.length === 0 ? (
                  <p>{t('rb.nothing')}</p>
                ) : (
                  <>
                    <p>
                      <b>{t('rb.moves', { n: rb.moves.length, h: fmtHours(rb.moves.reduce((a, m) => a + m.hours, 0)) })}</b>
                    </p>
                    <p className={s.muted}>{t('rb.donors', { names: rb.donors.join(', ') })}</p>
                    {rb.shortfalls.map((x) => (
                      <p key={x.name} className={s.shortfall}>
                        {t('rb.shortfall', { name: x.name, h: fmtHours(x.hours), load: fmtPct(x.load) })}
                      </p>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <datalist id="chg-processes">
        {processes.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </Modal>
  );
}
