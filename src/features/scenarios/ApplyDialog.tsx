import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Undo2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { dataStore, scenarioActions } from '../../store';
import type { Scenario } from '../../../shared/schema';
import type { ConflictChoice, ScenarioDocChange } from '../../store/scenarioActions';
import f from '../../components/Form.module.css';
import s from './Scenarios.module.css';

const SHOW = 100;
const val = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? '✓' : '✗') : String(v);

function DocTable({ docs }: { docs: ScenarioDocChange[] }) {
  const { t } = useI18n();
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">{t('apply.doc')}</th>
            <th scope="col">{t('apply.what')}</th>
          </tr>
        </thead>
        <tbody>
          {docs.slice(0, SHOW).map((d) => (
            <tr key={d.id}>
              <td>
                <b>{d.label}</b>
                <small className={s.muted}> · {t(`apply.k.${d.kind}`)}</small>
              </td>
              <td>
                {d.fields.map((x) => (
                  <div key={x.field} className={s.fieldChange}>
                    <span className={s.muted}>{x.field}:</span> {val(x.from)} → <b>{val(x.to)}</b>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {docs.length > SHOW && <p className={s.muted}>{t('picker.more', { n: docs.length - SHOW })}</p>}
    </div>
  );
}

/**
 * Tətbiq / geri alma önizləməsi (SPEC §6.5): hansı sənədlər dəyişəcək, ssenari yaradılandan sonra dəyişmiş
 * sənədlər (ziddiyyət) və hər biri üçün seçim. Tətbiq bir undo addımıdır və bir jurnal qrupu yaradır.
 */
export function ApplyDialog({ sc, mode, onClose }: { sc: Scenario; mode: 'apply' | 'revert'; onClose: () => void }) {
  const { t } = useI18n();
  const pv = useMemo(() => (mode === 'apply' ? scenarioActions.preview(sc) : null), [sc, mode]);
  const rv = useMemo(() => (mode === 'revert' ? scenarioActions.revertPreview(sc) : null), [sc, mode]);
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const [busy, setBusy] = useState(false);
  const docs = pv?.docs ?? rv?.docs ?? [];
  const labelOf = (id: string) => docs.find((d) => d.id === id)?.label ?? id;

  const run = async () => {
    setBusy(true);
    try {
      if (mode === 'apply') {
        const r = await scenarioActions.apply(sc, choices);
        toast(r.skipped ? t('apply.doneSkipped', { n: r.skipped }) : t('apply.done', { name: sc.name }), {
          action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
        });
      } else {
        await scenarioActions.revert(sc);
        toast(t('apply.reverted', { name: sc.name }));
      }
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={mode === 'apply' ? t('apply.title', { name: sc.name }) : t('apply.revertTitle', { name: sc.name })}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy || !docs.length}>
            {mode === 'apply' ? <CheckCircle2 size={16} aria-hidden="true" /> : <Undo2 size={16} aria-hidden="true" />}{' '}
            {mode === 'apply' ? t('apply.submit') : t('apply.revertSubmit')}
          </Button>
        </>
      }
    >
      <p className={s.lead}>
        {mode === 'apply' ? t('apply.lead', { n: docs.length }) : t('apply.revertLead', { n: docs.length })}
      </p>

      {pv && pv.conflicts.length > 0 && (
        <div className={s.conflicts} role="group" aria-label={t('apply.conflicts')}>
          <h3>
            <AlertTriangle size={16} aria-hidden="true" /> {t('apply.conflictsN', { n: pv.conflicts.length })}
          </h3>
          <p className={s.muted}>{t('apply.conflictsHint')}</p>
          {pv.conflicts.map((c) => {
            const id = `${c.table}/${c.key}`;
            const choice = choices[id] ?? 'skip';
            return (
              <fieldset key={id} className={s.conflict}>
                <legend>
                  <b>{labelOf(id)}</b> <span className={s.muted}>{c.by ? t('apply.changedBy', { by: c.by }) : ''}</span>
                </legend>
                <label className={f.check}>
                  <input
                    type="radio"
                    name={id}
                    checked={choice === 'skip'}
                    onChange={() => setChoices((x) => ({ ...x, [id]: 'skip' }))}
                  />
                  {t('apply.keepTheirs')}
                </label>
                <label className={f.check}>
                  <input
                    type="radio"
                    name={id}
                    checked={choice === 'scenario'}
                    onChange={() => setChoices((x) => ({ ...x, [id]: 'scenario' }))}
                  />
                  {t('apply.useScenario')}
                </label>
              </fieldset>
            );
          })}
        </div>
      )}
      {rv && rv.stale.length > 0 && (
        <div className={s.conflicts} role="note">
          <h3>
            <AlertTriangle size={16} aria-hidden="true" /> {t('apply.staleN', { n: rv.stale.length })}
          </h3>
          <p className={s.muted}>{rv.stale.map(labelOf).join(', ')}</p>
        </div>
      )}
      <DocTable docs={docs} />
    </Modal>
  );
}
