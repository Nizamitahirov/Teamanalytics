import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { dataStore } from '../../store';
import { applyLogs, findConflicts, scenarioData, type Scenario } from '../../../shared/scenario';
import type { Snapshot } from '../../../shared/apply';
import { applyScenario } from './logic';
import type { MessageKey } from '../../../shared/i18n/az';
import f from '../../components/Form.module.css';
import s from './Scenarios.module.css';

const FIELD: Record<string, MessageKey> = {
  owner_after: 'field.owner_after',
  owner_before: 'field.owner_before',
  hours: 'field.hours',
  is_cancelled: 'field.is_cancelled',
  active: 'field.active',
  fte: 'field.fte',
};
const show = (v: unknown) => (v === null || v === '' ? '—' : String(v));

/**
 * Tətbiq (SPEC §6.5): önizləmə (nə dəyişəcək) → ziddiyyət yoxlaması (ssenari yaradılandan sonra canlı datada
 * dəyişmiş sənədlər) → hər ziddiyyət üçün seçim → bir commit (tək "Geri al").
 */
export function ApplyDialog({
  sc,
  live,
  onClose,
  approve,
}: {
  sc: Scenario;
  live: Snapshot;
  onClose: () => void;
  approve?: boolean;
}) {
  const { t } = useI18n();
  const conflicts = useMemo(() => findConflicts(live, sc.changes), [live, sc.changes]);
  // Default: ziddiyyətli dəyişikliyi BURAX (canlıdakı başqasının dəyişikliyi qorunsun)
  const [overwrite, setOverwrite] = useState<string[]>([]);
  const skip = useMemo(
    () => new Set(conflicts.filter((c) => !overwrite.includes(c.changeId)).map((c) => c.changeId)),
    [conflicts, overwrite],
  );
  const preview = useMemo(() => {
    const kept = sc.changes.filter((c) => !skip.has(c.id));
    return applyLogs(sc.name, live, scenarioData(live, kept)).slice(1);
  }, [sc, live, skip]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await applyScenario(sc, skip);
      onClose();
      toast(r.saved ? t('scen.applied', { n: r.count }) : t('scen.appliedPending', { n: r.count }), {
        action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
      });
    } catch (e) {
      setBusy(false);
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal
      title={t(approve ? 'scen.approveTitle' : 'scen.applyTitle', { name: sc.name })}
      onClose={busy ? undefined : onClose}
      wide
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={run} disabled={busy || !preview.length}>
            <CheckCircle2 size={16} aria-hidden="true" /> {t(approve ? 'scen.approveApply' : 'scen.apply')}
          </Button>
        </>
      }
    >
      <p className={s.note}>{t('scen.applyHint', { n: preview.length })}</p>
      {conflicts.length > 0 && (
        <div role="group" aria-labelledby="ap-cf" style={{ marginBottom: 16 }}>
          <p id="ap-cf" className={s.noteWarn}>
            <AlertTriangle size={14} aria-hidden="true" /> {t('scen.conflicts', { n: conflicts.length })}
          </p>
          <ul className={s.changes}>
            {conflicts.map((c) => (
              <li key={c.changeId + c.key} className={s.change} data-conflict={c.key}>
                <span>
                  <b>{c.label}</b>
                  <br />
                  <span className={s.sub}>
                    {c.reason === 'deleted'
                      ? t('scen.cf.deleted')
                      : c.reason === 'exists'
                        ? t('scen.cf.exists')
                        : Object.entries(c.fields)
                            .map(([k, [was, now]]) => `${FIELD[k] ? t(FIELD[k]) : k}: ${show(was)} → ${show(now)}`)
                            .join('; ')}
                  </span>
                  <br />
                  <label className={f.check} style={{ marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={overwrite.includes(c.changeId)}
                      disabled={c.reason === 'deleted'}
                      onChange={(e) =>
                        setOverwrite((o) => (e.target.checked ? [...o, c.changeId] : o.filter((x) => x !== c.changeId)))
                      }
                    />{' '}
                    {t('scen.cf.overwrite')}
                  </label>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className={s.checkList} aria-label={t('scen.preview')} style={{ maxHeight: 300 }}>
        {preview.map((l, i) => (
          <li key={i} className={s.proposal}>
            <span>
              <b>{l.action}</b> · {l.task_label}
              {l.from || l.to ? (
                <span className={s.sub}>
                  {' '}
                  {l.from}
                  {l.to ? ` → ${l.to}` : ''}
                </span>
              ) : null}
            </span>
          </li>
        ))}
        {!preview.length && <li className={s.sub}>{t('scen.nothing')}</li>}
      </ul>
    </Modal>
  );
}
