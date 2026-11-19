import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';
import { Button } from '../../components/Button';
import { matches } from '../../../shared/search';
import { dayKey, formatDate, formatTime } from '../../lib/dates';
import f from '../../components/Form.module.css';
import s from './LogPage.module.css';

const PAGE = 100;

/**
 * Jurnal (SPEC §6.9) — Mərhələ 3 versiyası: lokal jurnal (son 2000 qeyd), filtrlər (əməliyyat, istifadəçi, axtarış),
 * günlərə görə qruplaşdırma ("Bu gün / Dünən"), tapşırığa keçid. Server səhifələməsi — sonrakı mərhələ.
 */
export function LogPage() {
  const { t } = useI18n();
  const log = useData((st) => st.data.log);
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE);
  const action = params.get('action') ?? '';
  const user = params.get('user') ?? '';
  const q = params.get('q') ?? '';
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  const options = useMemo(
    () => ({
      action: [...new Set(log.map((l) => l.action).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az')),
      user: [...new Set(log.map((l) => l.user ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az')),
    }),
    [log],
  );
  const rows = useMemo(
    () =>
      log
        .filter(
          (l) =>
            (!action || l.action === action) &&
            (!user || l.user === user) &&
            matches(`${l.action} ${l.task_label} ${l.from} ${l.to} ${l.comment} ${l.user} ${l.task_id}`, q),
        )
        .slice()
        .reverse(),
    [log, action, user, q],
  );
  const shown = rows.slice(0, limit);
  const [now] = useState(() => Date.now());
  const today = dayKey(new Date(now).toISOString());
  const yesterday = dayKey(new Date(now - 864e5).toISOString());
  const groups: { key: string; items: typeof shown }[] = [];
  for (const r of shown) {
    const k = dayKey(r.ts);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(r);
    else groups.push({ key: k, items: [r] });
  }

  return (
    <>
      <div className={s.toolbar}>
        <input
          type="search"
          className={f.input}
          placeholder={t('log.searchPh')}
          aria-label={t('top.search')}
          value={q}
          onChange={(e) => set('q', e.target.value)}
          data-page-search
        />
        <select className={f.input} aria-label={t('log.action')} value={action} onChange={(e) => set('action', e.target.value)}>
          <option value="">{t('log.action')}</option>
          {options.action.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select className={f.input} aria-label={t('log.user')} value={user} onChange={(e) => set('user', e.target.value)}>
          <option value="">{t('log.user')}</option>
          {options.user.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      {!rows.length && <p className={f.hint}>{t('log.empty')}</p>}
      {groups.map((g) => (
        <section key={g.key} aria-label={g.key}>
          <h2 className={s.day}>
            {g.key === today ? t('log.today') : g.key === yesterday ? t('log.yesterday') : formatDate(g.items[0].ts)}
          </h2>
          <ul className={s.list}>
            {g.items.map((l) => (
              <li key={l.id ?? `${l.ts}-${l.task_id}`} className={s.item}>
                <span className={s.time}>{formatTime(l.ts)}</span>
                <span className={s.action}>{l.action}</span>
                <span className={s.label}>
                  {l.task_id ? <Link to={`/tasks?task=${encodeURIComponent(l.task_id)}`}>{l.task_label}</Link> : l.task_label}
                  {(l.from || l.to) && (
                    <span className={s.sub}> · {l.from && l.to ? `${l.from} → ${l.to}` : l.from || l.to}</span>
                  )}
                  {l.comment && <span className={s.sub}> · “{l.comment}”</span>}
                </span>
                <span className={s.user}>{l.user}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {rows.length > limit && (
        <div className={s.more}>
          <Button onClick={() => setLimit((n) => n + PAGE)}>{t('log.more', { n: rows.length - limit })}</Button>
        </div>
      )}
    </>
  );
}
