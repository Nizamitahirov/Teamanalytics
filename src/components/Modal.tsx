import { useEffect, useRef, type ReactNode } from 'react';
import s from './Modal.module.css';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal (SPEC §12.3): fokus tələsi, açılanda ilk düyməyə fokus, bağlananda əvvəlki elementə qayıdış.
 * `onClose` verilməyibsə Esc və fon klik bağlamır (istifadəçi seçim etməlidir).
 */
export function Modal({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>(`.${s.foot} button`)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className={s.backdrop}
      onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
      role="presentation"
    >
      <div ref={ref} className={s.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className={s.head}>
          <h2 id="modal-title">{title}</h2>
        </div>
        <div className={s.body}>{children}</div>
        <div className={s.foot}>{footer}</div>
      </div>
    </div>
  );
}
