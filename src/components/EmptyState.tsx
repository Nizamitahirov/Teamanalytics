import type { ReactNode } from 'react';
import s from './EmptyState.module.css';

/** Boş/xəta vəziyyəti: izah + əsas əməliyyat (SPEC §5). */
export function EmptyState({
  icon,
  title,
  children,
  actions,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={s.wrap} aria-labelledby="empty-title">
      <div className={s.icon} aria-hidden="true">
        {icon}
      </div>
      <h2 id="empty-title" className={s.title}>
        {title}
      </h2>
      {children && <p className={s.body}>{children}</p>}
      {actions && <div className={s.actions}>{actions}</div>}
    </section>
  );
}
