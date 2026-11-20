import { useMemo, useState } from 'react';
import { Lock, LockOpen, Scale } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button, IconButton } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { rebalance } from '../../../shared/rebalance';
import { rebalanceChanges, type ScenarioChange } from '../../../shared/scenario';
import { fmtHours, fmtPct } from '../../../shared/format';
import type { Snapshot } from '../../../shared/apply';
import f from '../../components/Form.module.css';
import s from './Scenarios.module.css';

/**
 * Yükü balansla (SPEC §8): alqoritmin təklifləri — hər sətirdə "çıxar" (işarəni götür) və "kilidlə"
 * (bu iş toxunulmaz, alqoritm yenidən hesablayır). Nəticə ssenariyə dəyişiklik kimi əlavə olunur.
 */
export function RebalanceDialog({
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
  const [theta, setTheta] = useState(1);
  const [sameCompany, setSameCompany] = useState(true);
  const [sameActivity, setSameActivity] = useState(false);
  const [locked, setLocked] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const res = useMemo(
    () => rebalance(scen, { theta, sameCompany, sameActivity, locked }),
    [scen, theta, sameCompany, sameActivity, locked],
  );
  const chosen = res.transfers.filter((x) => !excluded.includes(x.taskId));

  const submit = () => {
    const changes = rebalanceChanges({ scen, live }, { ...res, transfers: chosen });
    if (changes.length) onAdd(changes);
    onClose();
  };

  return (
    <Modal
      title={t('scen.balanceTitle')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={!chosen.length}>
            <Scale size={16} aria-hidden="true" /> {t('scen.addN', { n: chosen.length })}
          </Button>
        </>
      }
    >
      <div className={f.grid}>
        <div className={f.field}>
          <label className={f.label} htmlFor="rb-theta">
            {t('scen.theta')}
          </label>
          <select
            id="rb-theta"
            data-autofocus
            className={f.input}
            value={theta}
            onChange={(e) => setTheta(Number(e.target.value))}
          >
            <option value={1}>100%</option>
            <option value={scen.settings.warn / 100}>{scen.settings.warn}%</option>
          </select>
        </div>
        <div className={f.field} style={{ alignSelf: 'end' }}>
          <label className={f.check}>
            <input type="checkbox" checked={sameCompany} onChange={(e) => setSameCompany(e.target.checked)} />{' '}
            {t('scen.sameCompany')}
          </label>
          <label className={f.check}>
            <input type="checkbox" checked={sameActivity} onChange={(e) => setSameActivity(e.target.checked)} />{' '}
            {t('scen.sameActivity')}
          </label>
        </div>
      </div>
      <p className={s.note} style={{ marginTop: 12 }}>
        {t('scen.balanceHint')}
      </p>
      {res.shortfall.length > 0 && (
        <p className={s.noteWarn} role="status">
          {t('scen.shortfall', { list: res.shortfall.map((x) => `${x.name}: ${fmtHours(x.hours)}`).join(', ') })}
        </p>
      )}
      {!res.transfers.length ? (
        <p className={s.empty}>{t('scen.balanceNone')}</p>
      ) : (
        <ul className={s.checkList} aria-label={t('scen.proposals')} style={{ maxHeight: 340 }}>
          {res.transfers.map((x) => (
            <li key={x.taskId} className={s.proposal}>
              <label>
                <input
                  type="checkbox"
                  checked={!excluded.includes(x.taskId)}
                  onChange={(e) => setExcluded((p) => (e.target.checked ? p.filter((y) => y !== x.taskId) : [...p, x.taskId]))}
                />
                <span>
                  {x.label}
                  <br />
                  <span className={s.sub}>
                    {x.from} → <b>{x.to}</b> · {fmtHours(x.hours)} {t('unit.hours')}
                  </span>
                </span>
              </label>
              <IconButton size="sm" label={t('scen.lock')} onClick={() => setLocked((l) => [...l, x.taskId])}>
                <Lock size={14} aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {locked.length > 0 && (
        <p className={s.sub} style={{ marginTop: 8 }}>
          {t('scen.lockedN', { n: locked.length })}{' '}
          <button
            type="button"
            className={s.name}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setLocked([])}
          >
            <LockOpen size={12} aria-hidden="true" /> {t('scen.unlockAll')}
          </button>
        </p>
      )}
      {res.transfers.length > 0 && (
        <p className={s.sub} style={{ marginTop: 8 }}>
          {Object.entries(res.after)
            .filter(([n]) => res.transfers.some((x) => x.from === n))
            .map(([n, v]) => `${n}: ${fmtPct(res.before[n])} → ${fmtPct(v)}`)
            .join(' · ')}
        </p>
      )}
    </Modal>
  );
}
