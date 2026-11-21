import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { dataStore, useData } from '../../store';
import { useCan } from '../../app/useCan';
import { Button } from '../../components/Button';
import { curOwner } from '../../../shared/model';
import f from '../../components/Form.module.css';
import s from './SettingsPage.module.css';

const BASE = ['Birbank', 'Pashapay', 'Birmarket'];

/**
 * Əməkdaşların şirkəti — hər əməkdaşın əsl (ştat üzrə) şirkəti. Başqa şirkətin işi ötürülmüş əməkdaş o şirkətin
 * işçisi sayılmır: şirkət filtrində "mövcud ştat"a yalnız profil şirkəti uyğun gələnlər düşür (shared/metrics.ts).
 */
export function StaffCompanyTab() {
  const { t } = useI18n();
  const { canEdit } = useCan();
  const employees = useData((st) => st.data.employees);
  const tasks = useData((st) => st.data.tasks);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const companies = useMemo(
    () => [...new Set([...BASE, ...employees.map((e) => e.company), ...tasks.map((x) => x.company)])].filter(Boolean),
    [employees, tasks],
  );
  // Hər əməkdaşın aktiv işlərinin şirkətlər üzrə sayı (ipucu)
  const workBy = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const x of tasks) {
      if (x.is_cancelled) continue;
      const o = curOwner(x);
      const c = m.get(o) ?? new Map<string, number>();
      c.set(x.company, (c.get(x.company) ?? 0) + 1);
      m.set(o, c);
    }
    return m;
  }, [tasks]);
  const rows = useMemo(
    () => employees.filter((e) => !e.is_group).sort((a, b) => a.name.localeCompare(b.name, 'az')),
    [employees],
  );
  const changed = rows.filter((e) => draft[e.name] != null && draft[e.name] !== e.company);

  const save = () => {
    if (!changed.length) return;
    const list = changed.map((e) => ({ name: e.name, from: e.company, to: draft[e.name] }));
    dataStore.getState().commit(
      t('staffCo.logLabel', { n: list.length }),
      (d) => {
        for (const x of list) {
          const e = d.employees.find((y) => y.name === x.name);
          if (e) e.company = x.to;
        }
      },
      list.map((x) => ({
        action: 'Əməkdaş',
        task_label: t('staffCo.logRow', { name: x.name, from: x.from, to: x.to }),
        from: x.from,
        to: x.to,
      })),
    );
    setDraft({});
    toast(t('set.saved'), { action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() } });
  };

  return (
    <section className={s.card} aria-labelledby="staffco-h">
      <div className={s.head}>
        <h2 id="staffco-h">{t('set.tab.staff')}</h2>
        {canEdit && (
          <Button variant="primary" disabled={!changed.length} onClick={save}>
            <Save size={16} aria-hidden="true" /> {changed.length ? t('staffCo.saveN', { n: changed.length }) : t('common.save')}
          </Button>
        )}
      </div>
      <p className={f.hint}>{t('staffCo.hint')}</p>
      <div className={s.tableWrap}>
        <table className={s.table} data-testid="staff-company">
          <thead>
            <tr>
              <th scope="col">{t('field.name')}</th>
              <th scope="col">{t('field.company')}</th>
              <th scope="col">{t('staffCo.work')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const val = draft[e.name] ?? e.company;
              const work = [...(workBy.get(e.name) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]);
              const foreign = work.filter(([c]) => c !== val);
              return (
                <tr key={e.name} data-emp={e.name}>
                  <th scope="row">{e.name}</th>
                  <td>
                    <select
                      className={`${f.input} ${s.roleSel}`}
                      aria-label={t('staffCo.companyOf', { name: e.name })}
                      value={val}
                      disabled={!canEdit}
                      onChange={(ev) => setDraft((d) => ({ ...d, [e.name]: ev.target.value }))}
                    >
                      {companies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {work.length ? work.map(([c, n]) => `${c}: ${n}`).join(' · ') : '—'}
                    {foreign.length > 0 && <span className={s.me}> · {t('staffCo.helps')}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
