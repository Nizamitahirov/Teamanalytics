import { useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import s from './Modal.module.css';

/**
 * Modal (SPEC §12.3): fokus tələsi, açılanda ilk düyməyə fokus, bağlananda əvvəlki elementə qayıdış.
 * `onClose` verilməyibsə Esc və fon klik bağlamır (istifadəçi seçim etməlidir).
 */
export function Modal({
  title,
  children,
  footer,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose, `[data-autofocus], .${s.foot} button:last-child`);
  return (
    <div
      className={s.backdrop}
      onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
      role="presentation"
    >
      <div ref={ref} className={`${s.modal} ${wide ? s.wide : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className={s.head}>
          <h2 id="modal-title">{title}</h2>
        </div>
        <div className={s.body}>{children}</div>
        <div className={s.foot}>{footer}</div>
      </div>
    </div>
  );
}
