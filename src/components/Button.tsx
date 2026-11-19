import type { ButtonHTMLAttributes, ReactNode } from 'react';
import s from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md';

export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', extra = '') =>
  [s.btn, s[variant], size === 'sm' ? s.sm : '', extra].filter(Boolean).join(' ');

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...rest} />;
}

/** İkon düyməsi: `label` məcburidir — həm tooltip (title), həm ekran oxuyucu üçün (SPEC §12.3). */
export function IconButton({
  label,
  children,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> & {
  label: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={buttonClass(variant, size, `${s.icon} ${className}`)}
      {...rest}
    >
      {children}
    </button>
  );
}
