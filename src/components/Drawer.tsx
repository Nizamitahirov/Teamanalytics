import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { IconButton } from './Button';
import s from './Drawer.module.css';

/** Sağ panel (SPEC §6.4 tapşırıq paneli): fokus tələsi, Esc bağlayır. */
export function Drawer({
  title,
  subtitle,
  children,
  footer,
  onClose,
  closeLabel,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  return (
    <>
      <div className={s.backdrop} onClick={onClose} aria-hidden="true" />
      <aside ref={ref} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className={s.head}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="drawer-title">{title}</h2>
            {subtitle && <div className={s.sub}>{subtitle}</div>}
          </div>
          <IconButton label={closeLabel} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>
        <div className={s.body}>{children}</div>
        {footer && <div className={s.foot}>{footer}</div>}
      </aside>
    </>
  );
}
