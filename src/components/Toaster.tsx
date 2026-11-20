import { X } from 'lucide-react';
import { dismiss, useToasts } from '../lib/toast';
import { useI18n } from '../lib/i18n';
import s from './Toaster.module.css';

export function Toaster() {
  const items = useToasts();
  const { t } = useI18n();
  return (
    <div className={s.wrap} role="status" aria-live="polite" data-print-hide>
      {items.map((it) => (
        <div key={it.id} className={`${s.toast} ${it.kind === 'error' ? s.error : ''}`}>
          <span>{it.text}</span>
          {it.action && (
            <button
              type="button"
              onClick={() => {
                it.action!.fn();
                dismiss(it.id);
              }}
            >
              {it.action.label}
            </button>
          )}
          <button type="button" className={s.x} onClick={() => dismiss(it.id)} aria-label={t('common.close')}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
