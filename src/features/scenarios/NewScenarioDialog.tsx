import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { FlaskConical } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { scenStore } from '../../store/scenarios';
import { ACT_ADMIN, ACT_PROJECT } from '../../../shared/constants';
import { curOwner } from '../../../shared/model';
import type { MessageKey } from '../../../shared/i18n/az';
import { templateChanges, useLive, type Template } from './logic';
import f from '../../components/Form.module.css';
import s from './Scenarios.module.css';

const TEMPLATES = ['empty', 'leave', 'hire', 'automate', 'balance', 'norm'] as const;
type TplKind = (typeof TEMPLATES)[number];
const num = (v: string) => Number(v.replace(',', '.'));

/** Yeni ssenari: ad + şablon (SPEC §6.5): boş, əməkdaş ayrılır, yeni əməkdaş, prosesi avtomatlaşdır, yükü balansla, norma. */
export function NewScenarioDialog({ onClose, initial = 'empty' }: { onClose: () => void; initial?: TplKind }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const live = useLive();
  const [kind, setKind] = useState<TplKind>(initial);
  const [name, setName] = useState('');
  const people = useMemo(
    () =>
      live.employees
        .filter((e) => e.active && !e.is_group)
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'az')),
    [live.employees],
  );
  const processes = useMemo(
    () =>
      [...new Set(live.tasks.filter((x) => !x.is_cancelled).map((x) => x.process))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'az')),
    [live.tasks],
  );
  const companies = useMemo(() => [...new Set(live.tasks.map((x) => x.company))].filter(Boolean).sort(), [live.tasks]);
  const busiest = useMemo(() => {
    const h = new Map<string, number>();
    for (const x of live.tasks) if (!x.is_cancelled) h.set(curOwner(x), (h.get(curOwner(x)) ?? 0) + x.hours);
    return [...people].sort((a, b) => (h.get(b) ?? 0) - (h.get(a) ?? 0))[0] ?? '';
  }, [live.tasks, people]);
  const [who, setWho] = useState(busiest);
  const [newName, setNewName] = useState('');
  const [company, setCompany] = useState(companies[0] ?? 'Birbank');
  const [activity, setActivity] = useState<string>(ACT_ADMIN);
  const [fte, setFte] = useState('1');
  const [process, setProcess] = useState(processes[0] ?? '');
  const [pct, setPct] = useState('30');
  const [norm, setNorm] = useState(String(live.settings.norm));
  const [busy, setBusy] = useState(false);

  const tpl = (): Template | null => {
    switch (kind) {
      case 'empty':
        return { kind };
      case 'leave':
        return who ? { kind, name: who } : null;
      case 'hire':
        return newName.trim() && num(fte) > 0 ? { kind, emp: { name: newName.trim(), company, activity, fte: num(fte) } } : null;
      case 'automate':
        return process && num(pct) > 0 && num(pct) <= 100 ? { kind, process, pct: num(pct) } : null;
      case 'balance':
        return { kind };
      case 'norm':
        return num(norm) > 0 ? { kind, norm: num(norm) } : null;
    }
  };
  const defaultName = () => {
    const tp = tpl();
    if (!tp) return '';
    if (tp.kind === 'leave') return t('scen.tplName.leave', { name: tp.name });
    if (tp.kind === 'hire') return t('scen.tplName.hire', { name: tp.emp.name });
    if (tp.kind === 'automate') return t('scen.tplName.automate', { p: tp.process, pct: tp.pct });
    if (tp.kind === 'norm') return t('scen.tplName.norm', { n: tp.norm });
    if (tp.kind === 'balance') return t('scen.tplName.balance');
    return t('scen.untitled');
  };
  const valid = !!tpl() && !busy;

  const submit = async () => {
    const tp = tpl();
    if (!tp) return;
    setBusy(true);
    try {
      const changes = templateChanges(live, tp);
      const id = await scenStore.getState().create({ name: name.trim() || defaultName(), changes });
      onClose();
      navigate(`/scenarios/${id}`);
    } catch (e) {
      setBusy(false);
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  const field = (id: string, label: string, el: ReactNode, hint?: string) => (
    <div className={f.field}>
      <label className={f.label} htmlFor={id}>
        {label}
      </label>
      {el}
      {hint && <span className={f.hint}>{hint}</span>}
    </div>
  );

  return (
    <Modal
      title={t('scen.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            <FlaskConical size={16} aria-hidden="true" /> {t('scen.create')}
          </Button>
        </>
      }
    >
      <div className={f.grid}>
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="ns-tpl">
            {t('scen.template')}
          </label>
          <select
            id="ns-tpl"
            data-autofocus
            className={f.input}
            value={kind}
            onChange={(e) => setKind(e.target.value as TplKind)}
          >
            {TEMPLATES.map((k) => (
              <option key={k} value={k}>
                {t(`scen.tpl.${k}` as MessageKey)}
              </option>
            ))}
          </select>
          <span className={f.hint}>{t(`scen.tplHint.${kind}` as MessageKey)}</span>
        </div>
        {kind === 'leave' &&
          field(
            'ns-who',
            t('field.name'),
            <select id="ns-who" className={f.input} value={who} onChange={(e) => setWho(e.target.value)}>
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>,
          )}
        {kind === 'hire' && (
          <>
            {field(
              'ns-new',
              t('field.name'),
              <input id="ns-new" className={f.input} value={newName} onChange={(e) => setNewName(e.target.value)} />,
            )}
            {field(
              'ns-fte',
              t('field.fte'),
              <input id="ns-fte" className={f.input} inputMode="decimal" value={fte} onChange={(e) => setFte(e.target.value)} />,
            )}
            {field(
              'ns-co',
              t('field.company'),
              <select id="ns-co" className={f.input} value={company} onChange={(e) => setCompany(e.target.value)}>
                {companies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>,
            )}
            {field(
              'ns-act',
              t('field.activity'),
              <select id="ns-act" className={f.input} value={activity} onChange={(e) => setActivity(e.target.value)}>
                <option>{ACT_ADMIN}</option>
                <option>{ACT_PROJECT}</option>
              </select>,
            )}
          </>
        )}
        {kind === 'automate' && (
          <>
            {field(
              'ns-proc',
              t('field.process'),
              <select id="ns-proc" className={f.input} value={process} onChange={(e) => setProcess(e.target.value)}>
                {processes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>,
            )}
            {field(
              'ns-pct',
              t('scen.pct'),
              <input id="ns-pct" className={f.input} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />,
            )}
          </>
        )}
        {kind === 'norm' &&
          field(
            'ns-norm',
            t('set.norm'),
            <input id="ns-norm" className={f.input} inputMode="decimal" value={norm} onChange={(e) => setNorm(e.target.value)} />,
            t('scen.normNow', { n: live.settings.norm }),
          )}
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="ns-name">
            {t('scen.name')}
          </label>
          <input
            id="ns-name"
            className={f.input}
            value={name}
            placeholder={defaultName()}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      <p className={s.note} style={{ marginTop: 12 }}>
        {t('scen.safe')}
      </p>
    </Modal>
  );
}
