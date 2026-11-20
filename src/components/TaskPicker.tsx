import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { matches } from '../../shared/search';
import { curOwner, type TaskDoc } from '../../shared/model';
import { fmtHours } from '../../shared/format';
import f from './Form.module.css';
import s from './TaskPicker.module.css';

const LIMIT = 60;

/** Tapşırıq seçimi (axtarış + siyahı). `multi` — çoxlu seçim (checkbox), əks halda tək (radio). */
export function TaskPicker({
  tasks,
  value,
  onChange,
  label,
  multi = true,
}: {
  tasks: readonly TaskDoc[];
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
  multi?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      tasks
        .filter((x) => matches(`${x.id} ${x.process} ${x.task} ${curOwner(x)}`, q))
        .sort((a, b) => Number(value.includes(b.id)) - Number(value.includes(a.id)) || b.hours - a.hours),
    [tasks, q, value],
  );
  const toggle = (tid: string) =>
    onChange(multi ? (value.includes(tid) ? value.filter((x) => x !== tid) : [...value, tid]) : [tid]);
  return (
    <div className={f.field}>
      <label className={f.label} htmlFor={id}>
        {label}
      </label>
      <div className={s.search}>
        <Search size={16} aria-hidden="true" />
        <input
          id={id}
          className={f.input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('picker.taskSearch')}
        />
      </div>
      <ul className={s.list} aria-label={label}>
        {list.slice(0, LIMIT).map((x) => (
          <li key={x.id}>
            <label className={s.item}>
              <input type={multi ? 'checkbox' : 'radio'} name={id} checked={value.includes(x.id)} onChange={() => toggle(x.id)} />
              <span className={s.text}>
                <b>{x.task}</b>
                <small>
                  {x.process} · {curOwner(x) || '—'} · {x.id}
                </small>
              </span>
              <span className={s.hours}>{fmtHours(x.hours)}</span>
            </label>
          </li>
        ))}
        {list.length > LIMIT && <li className={s.more}>{t('picker.more', { n: list.length - LIMIT })}</li>}
        {!list.length && <li className={s.more}>{t('picker.none')}</li>}
      </ul>
      {multi && <span className={f.hint}>{t('picker.selected', { n: value.length })}</span>}
    </div>
  );
}
