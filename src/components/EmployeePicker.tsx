import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useData } from '../store';
import { useMetrics } from '../hooks/useMetrics';
import { fold, score } from '../../shared/search';
import { levelOf } from '../../shared/metrics';
import { LoadChip } from './Badges';
import f from './Form.module.css';
import s from './EmployeePicker.module.css';

/**
 * İcraçı seçimi (SPEC §12.3 Combobox): ad + yük çipi, ə/e bərabər axtarış, klaviatura (↑ ↓ Enter Esc).
 * Siyahıda olmayan ad yazılarsa "+ Yeni əməkdaş" seçimi (v1 kimi — ötürmədə avtomatik yaranır).
 */
export function EmployeePicker({
  value,
  onChange,
  exclude = [],
  label,
  allowNew = true,
  initialFocus,
}: {
  value: string;
  onChange: (name: string) => void;
  exclude?: string[];
  label: string;
  allowNew?: boolean;
  initialFocus?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const employees = useData((st) => st.data.employees);
  const { loads, settings } = useMetrics();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (initialFocus) inputRef.current?.focus();
  }, [initialFocus]);

  const options = useMemo(() => {
    const list = employees
      .filter((e) => e.active !== false && !exclude.includes(e.name))
      .map((e) => {
        const l = loads.get(e.name);
        const load = l ? l.load : 0;
        return {
          name: e.name,
          company: e.company,
          isGroup: e.is_group,
          load,
          level: levelOf(load, settings.warn),
          sc: score(e.name, text),
        };
      })
      .filter((o) => o.sc > 0 || !text.trim())
      .sort((a, b) => b.sc - a.sc || a.load - b.load || a.name.localeCompare(b.name, 'az'));
    const exact = list.some((o) => fold(o.name) === fold(text));
    return { list, canCreate: allowNew && !!text.trim() && !exact && !exclude.includes(text.trim()) };
  }, [employees, exclude, loads, settings.warn, text, allowNew]);

  const total = options.list.length + (options.canCreate ? 1 : 0);
  const choose = (i: number) => {
    const name = i < options.list.length ? options.list[i].name : text.trim();
    if (!name) return;
    setText(name);
    onChange(name);
    setOpen(false);
  };

  return (
    <div className={`${f.field} ${s.wrap}`}>
      <label className={f.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={f.input}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && total ? `${id}-o${active}` : undefined}
        autoComplete="off"
        value={text}
        data-autofocus={initialFocus ? '' : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (!e.target.value.trim()) onChange('');
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(total - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && open && total) {
            e.preventDefault();
            choose(active);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && total > 0 && (
        <ul id={`${id}-list`} role="listbox" className={s.list} aria-label={label}>
          {options.list.map((o, i) => (
            <li
              key={o.name}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              className={s.opt}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={s.name}>{o.name}</span>
              <span className={s.meta}>{o.company}</span>
              {o.isGroup ? <span className={s.meta}>{t('emp.group')}</span> : <LoadChip load={o.load} level={o.level} />}
            </li>
          ))}
          {options.canCreate && (
            <li
              id={`${id}-o${options.list.length}`}
              role="option"
              aria-selected={active === options.list.length}
              className={`${s.opt} ${s.new}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(options.list.length);
              }}
            >
              <UserPlus size={16} aria-hidden="true" /> {t('emp.newNamed', { name: text.trim() })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
