import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Keyboard, Moon, Plus, Redo2, Undo2, User, UserPlus, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { dataStore, useData } from '../../store';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { NAV } from '../../app/nav';
import { curOwner } from '../../../shared/model';
import { score } from '../../../shared/search';
import type { MessageKey } from '../../../shared/i18n/az';
import s from './CommandPalette.module.css';

type Item = { id: string; group: MessageKey; label: string; hint?: string; icon: LucideIcon; run: () => void; score: number };

/**
 * Komanda paleti (SPEC §5): Ctrl/⌘+K və ya "/". Tapşırıq/əməkdaş axtarışı (ə/e, ı/i... bərabər) və əməliyyatlar.
 */
export function CommandPalette({
  onClose,
  onTheme,
  onShortcuts,
  onNewEmployee,
}: {
  onClose: () => void;
  onTheme: () => void;
  onShortcuts: () => void;
  onNewEmployee: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useFocusTrap(ref, onClose, 'input');

  const items = useMemo(() => {
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    const act = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const commands: Omit<Item, 'score'>[] = [
      { id: 'new-task', group: 'palette.actions', label: t('task.new'), hint: 'N', icon: Plus, run: go('/tasks?task=new') },
      { id: 'new-emp', group: 'palette.actions', label: t('emp.new'), icon: UserPlus, run: act(onNewEmployee) },
      {
        id: 'undo',
        group: 'palette.actions',
        label: t('top.undo'),
        hint: 'Ctrl Z',
        icon: Undo2,
        run: act(() => dataStore.getState().undoLast()),
      },
      {
        id: 'redo',
        group: 'palette.actions',
        label: t('top.redo'),
        hint: 'Ctrl ⇧ Z',
        icon: Redo2,
        run: act(() => dataStore.getState().redoLast()),
      },
      { id: 'theme', group: 'palette.actions', label: t('palette.theme'), icon: Moon, run: act(onTheme) },
      { id: 'keys', group: 'palette.actions', label: t('palette.shortcuts'), hint: '?', icon: Keyboard, run: act(onShortcuts) },
      ...NAV.map((n) => ({
        id: `go-${n.path}`,
        group: 'palette.goto' as MessageKey,
        label: t(n.label),
        icon: n.icon,
        run: go(n.path),
      })),
    ];
    const scored: Item[] = commands.map((c) => ({ ...c, score: score(c.label, q) })).filter((c) => c.score > 0);
    if (q.trim()) {
      const emps = employees
        .map((e) => ({ e, sc: score(e.name, q) }))
        .filter((x) => x.sc > 0)
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 6)
        .map(({ e, sc }): Item => ({
          id: `emp-${e.name}`,
          group: 'palette.employees',
          label: e.name,
          hint: e.company,
          icon: User,
          run: go(`/employees/${encodeURIComponent(e.name)}`),
          score: sc,
        }));
      const ts = tasks
        .map((x) => ({
          x,
          sc: Math.max(
            score(x.task, q),
            score(`${x.process} ${x.task}`, q) - 5,
            x.id.toLowerCase() === q.trim().toLowerCase() ? 100 : 0,
          ),
        }))
        .filter((r) => r.sc > 0)
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 8)
        .map(({ x, sc }): Item => ({
          id: `task-${x.id}`,
          group: 'palette.tasks',
          label: x.task,
          hint: `${x.process} · ${curOwner(x)}`,
          icon: FileText,
          run: go(`/tasks?task=${encodeURIComponent(x.id)}`),
          score: sc,
        }));
      return [...emps, ...ts, ...scored.sort((a, b) => b.score - a.score)];
    }
    return scored;
  }, [q, tasks, employees, t, navigate, onClose, onTheme, onShortcuts, onNewEmployee]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div ref={ref} className={s.panel} role="dialog" aria-modal="true" aria-label={t('palette.title')}>
        <input
          className={s.input}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={items.length ? `pal-${active}` : undefined}
          placeholder={t('palette.placeholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              items[active]?.run();
            }
          }}
        />
        {items.length ? (
          <ul id="palette-list" ref={listRef} className={s.list} role="listbox" aria-label={t('palette.title')}>
            {items.map((it, i) => {
              const header = it.group !== lastGroup ? t(it.group) : null;
              lastGroup = it.group;
              return [
                header && (
                  <li key={`g-${it.group}`} className={s.group} role="presentation">
                    {header}
                  </li>
                ),
                <li
                  key={it.id}
                  id={`pal-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === active}
                  className={s.item}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    it.run();
                  }}
                >
                  <it.icon size={16} aria-hidden="true" />
                  <span className={s.text}>{it.label}</span>
                  {it.hint && <span className={s.hint}>{it.hint}</span>}
                </li>,
              ];
            })}
          </ul>
        ) : (
          <p className={s.empty}>{t('palette.empty')}</p>
        )}
      </div>
    </div>
  );
}

/** Qısayollar siyahısı (SPEC §5). */
export const SHORTCUTS: [string, MessageKey][] = [
  ['Ctrl K · /', 'keys.palette'],
  ['g p', 'keys.gotoDashboard'],
  ['g e', 'keys.gotoEmployees'],
  ['g t', 'keys.gotoTasks'],
  ['g l', 'keys.gotoLog'],
  ['n', 'keys.newTask'],
  ['Ctrl Z', 'top.undo'],
  ['Ctrl ⇧ Z · Ctrl Y', 'top.redo'],
  ['Esc', 'keys.close'],
  ['?', 'keys.help'],
];
