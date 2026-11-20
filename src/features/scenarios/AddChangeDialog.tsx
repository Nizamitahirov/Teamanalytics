import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { newTaskId } from '../../store/actions';
import { computeMetrics, effHours } from '../../../shared/metrics';
import { curOwner, taskLabel } from '../../../shared/model';
import { ACT_ADMIN, ACT_PROJECT } from '../../../shared/constants';
import { fmtHours, fmtPct } from '../../../shared/format';
import type { Snapshot } from '../../../shared/apply';
import {
  addEmployeeChange,
  automateChange,
  cancelChange,
  fteChange,
  hoursChange,
  leaveTemplate,
  newTaskChange,
  normChange,
  removeEmployeeChange,
  transferChange,
  type ChangeKind,
  type ScenarioChange,
} from '../../../shared/scenario';
import type { MessageKey } from '../../../shared/i18n/az';
import f from '../../components/Form.module.css';
import s from './Scenarios.module.css';

const KINDS: ChangeKind[] = ['transfer', 'cancel', 'hours', 'task_new', 'emp_add', 'emp_remove', 'fte', 'norm', 'automate'];
const num = (v: string) => Number(v.replace(',', '.'));

/** Ssenariyə dəyişiklik əlavə etmə (SPEC §6.5): ötür, ləğv et, saat dəyiş, yeni iş, əməkdaş əlavə et/çıxar, ştat, norma. */
export function AddChangeDialog({
  live,
  scen,
  onAdd,
  onClose,
}: {
  live: Snapshot;
  scen: Snapshot;
  onAdd: (c: ScenarioChange[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<ChangeKind>('transfer');
  const m = useMemo(() => computeMetrics(scen), [scen]);
  const loadOf = (name: string) => m.loads.find((l) => l.name === name);
  const people = useMemo(
    () =>
      scen.employees
        .filter((e) => e.active && !e.is_group)
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'az')),
    [scen.employees],
  );
  const owners = useMemo(
    () =>
      [
        ...new Set(
          scen.tasks
            .filter((x) => !x.is_cancelled)
            .map(curOwner)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, 'az')),
    [scen.tasks],
  );
  const processes = useMemo(
    () =>
      [
        ...new Set(
          scen.tasks
            .filter((x) => !x.is_cancelled)
            .map((x) => x.process)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, 'az')),
    [scen.tasks],
  );
  const companies = useMemo(() => [...new Set(scen.tasks.map((x) => x.company).filter(Boolean))].sort(), [scen.tasks]);

  // Ümumi sahələr
  const [from, setFrom] = useState(owners[0] ?? '');
  const [picked, setPicked] = useState<string[]>([]);
  const [to, setTo] = useState('');
  const [taskId, setTaskId] = useState('');
  const [value, setValue] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState(companies[0] ?? 'Birbank');
  const [activity, setActivity] = useState<string>(ACT_ADMIN);
  const [process, setProcess] = useState(processes[0] ?? '');
  const [taskName, setTaskName] = useState('');
  const [redistribute, setRedistribute] = useState(true);

  const fromTasks = useMemo(
    () => scen.tasks.filter((x) => !x.is_cancelled && curOwner(x) === from).sort((a, b) => effHours(b) - effHours(a)),
    [scen.tasks, from],
  );
  const pickedH = fromTasks.filter((x) => picked.includes(x.id)).reduce((a, x) => a + effHours(x), 0);
  const ctx = { scen, live };

  const build = (): ScenarioChange[] => {
    const one = (c: ScenarioChange | null) => (c ? [c] : []);
    switch (kind) {
      case 'transfer':
        return one(transferChange(ctx, picked, to));
      case 'cancel':
        return one(cancelChange(ctx, picked));
      case 'hours':
        return one(hoursChange(ctx, taskId, num(value)));
      case 'task_new':
        return one(
          newTaskChange(ctx, { id: newTaskId(), company, process: process, task: taskName, hours: num(value), owner: to }),
        );
      case 'emp_add':
        return one(addEmployeeChange(ctx, { name, company, activity, fte: num(value || '1') }));
      case 'emp_remove':
        return redistribute ? leaveTemplate(ctx, name).changes : one(removeEmployeeChange(ctx, name));
      case 'fte':
        return one(fteChange(ctx, name, num(value)));
      case 'norm':
        return one(normChange(ctx, num(value)));
      case 'automate':
        return one(automateChange(ctx, process, num(value)));
      default:
        return [];
    }
  };
  const result = build();
  const submit = () => {
    if (!result.length) return;
    onAdd(result);
    onClose();
  };

  const personLabel = (n: string) => {
    const l = loadOf(n);
    return l ? `${n} · ${fmtPct(l.load)}` : n;
  };
  const sel = (id: string, label: string, val: string, set: (v: string) => void, opts: [string, string][], empty?: string) => (
    <div className={f.field}>
      <label className={f.label} htmlFor={id}>
        {label}
      </label>
      <select id={id} className={f.input} value={val} onChange={(e) => set(e.target.value)}>
        {empty !== undefined && <option value="">{empty}</option>}
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
  const input = (
    id: string,
    label: string,
    val: string,
    set: (v: string) => void,
    opts: { decimal?: boolean; hint?: string } = {},
  ) => (
    <div className={f.field}>
      <label className={f.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={f.input}
        value={val}
        onChange={(e) => set(e.target.value)}
        inputMode={opts.decimal ? 'decimal' : undefined}
      />
      {opts.hint && <span className={f.hint}>{opts.hint}</span>}
    </div>
  );
  const taskChecklist = (
    <div className={f.full}>
      <p className={f.label} id="ac-tasks">
        {t('scen.pickTasks', { n: picked.length, h: fmtHours(pickedH) })}
      </p>
      <ul className={s.checkList} aria-labelledby="ac-tasks">
        {fromTasks.map((x) => (
          <li key={x.id}>
            <label>
              <input
                type="checkbox"
                checked={picked.includes(x.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, x.id] : p.filter((y) => y !== x.id)))}
              />
              <span>{taskLabel(x)}</span>
              <span className={s.sub}>{fmtHours(effHours(x))}</span>
            </label>
          </li>
        ))}
        {!fromTasks.length && <li className={s.sub}>{t('emp.noTasks')}</li>}
      </ul>
    </div>
  );

  return (
    <Modal
      title={t('scen.addChange')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={!result.length}>
            <Plus size={16} aria-hidden="true" /> {result.length > 1 ? t('scen.addN', { n: result.length }) : t('scen.add')}
          </Button>
        </>
      }
    >
      <div className={f.grid}>
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="ac-kind">
            {t('scen.kind')}
          </label>
          <select
            id="ac-kind"
            data-autofocus
            className={f.input}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ChangeKind);
              setValue('');
              setPicked([]);
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`scen.k.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>

        {(kind === 'transfer' || kind === 'cancel') && (
          <>
            {sel(
              'ac-from',
              t('scen.fromEmp'),
              from,
              (v) => {
                setFrom(v);
                setPicked([]);
              },
              owners.map((o) => [o, personLabel(o)]),
            )}
            {kind === 'transfer' &&
              sel(
                'ac-to',
                t('transfer.to'),
                to,
                setTo,
                people.filter((p) => p !== from).map((p) => [p, personLabel(p)]),
                t('transfer.pick'),
              )}
            {taskChecklist}
          </>
        )}
        {kind === 'hours' && (
          <>
            {sel(
              'ac-from',
              t('scen.fromEmp'),
              from,
              (v) => {
                setFrom(v);
                setTaskId('');
              },
              owners.map((o) => [o, o]),
            )}
            {sel(
              'ac-task',
              t('field.task'),
              taskId,
              setTaskId,
              fromTasks.map((x) => [x.id, `${taskLabel(x)} (${fmtHours(x.hours)})`]),
              '—',
            )}
            {input('ac-val', t('scen.newHours'), value, setValue, { decimal: true })}
          </>
        )}
        {kind === 'task_new' && (
          <>
            {sel(
              'ac-company',
              t('field.company'),
              company,
              setCompany,
              companies.map((c) => [c, c]),
            )}
            <div className={f.field}>
              <label className={f.label} htmlFor="ac-proc">
                {t('field.process')}
              </label>
              <input
                id="ac-proc"
                className={f.input}
                list="ac-procs"
                value={process}
                onChange={(e) => setProcess(e.target.value)}
              />
              <datalist id="ac-procs">
                {processes.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            {input('ac-tname', t('field.task'), taskName, setTaskName)}
            {input('ac-val', t('field.hours'), value, setValue, { decimal: true })}
            {sel(
              'ac-to',
              t('scen.owner'),
              to,
              setTo,
              people.map((p) => [p, personLabel(p)]),
              '—',
            )}
          </>
        )}
        {kind === 'emp_add' && (
          <>
            {input('ac-name', t('field.name'), name, setName)}
            {sel(
              'ac-company',
              t('field.company'),
              company,
              setCompany,
              companies.map((c) => [c, c]),
            )}
            {sel('ac-act', t('field.activity'), activity, setActivity, [
              [ACT_ADMIN, ACT_ADMIN],
              [ACT_PROJECT, ACT_PROJECT],
            ])}
            {input('ac-val', t('field.fte'), value, setValue, { decimal: true, hint: t('scen.fteDefault') })}
          </>
        )}
        {(kind === 'emp_remove' || kind === 'fte') && (
          <>
            {sel(
              'ac-name',
              t('field.name'),
              name,
              setName,
              people.map((p) => [p, personLabel(p)]),
              '—',
            )}
            {kind === 'fte' && input('ac-val', t('scen.newFte'), value, setValue, { decimal: true })}
            {kind === 'emp_remove' && (
              <label className={`${f.check} ${f.full}`}>
                <input type="checkbox" checked={redistribute} onChange={(e) => setRedistribute(e.target.checked)} />{' '}
                {t('scen.redistribute')}
              </label>
            )}
          </>
        )}
        {kind === 'norm' &&
          input('ac-val', t('set.norm'), value, setValue, { decimal: true, hint: t('scen.normNow', { n: scen.settings.norm }) })}
        {kind === 'automate' && (
          <>
            {sel(
              'ac-proc',
              t('field.process'),
              process,
              setProcess,
              processes.map((p) => [p, p]),
            )}
            {input('ac-val', t('scen.pct'), value, setValue, { decimal: true })}
          </>
        )}
      </div>
      <p className={s.note} aria-live="polite" style={{ marginTop: 16 }}>
        {result.length
          ? result
              .map((c) => c.label)
              .slice(0, 4)
              .join(' · ') + (result.length > 4 ? ` · +${result.length - 4}` : '')
          : t('scen.fillForm')}
      </p>
    </Modal>
  );
}
