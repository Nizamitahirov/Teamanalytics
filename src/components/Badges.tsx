import { AlertCircle, AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import type { Status } from '../../shared/model';
import type { LoadLevel } from '../../shared/metrics';
import { fmtPct } from '../../shared/format';
import s from './Badges.module.css';

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`${s.badge} ${s[status]}`}>{status}</span>;
}

/** Şirkət rəngi varlığa bağlıdır (SPEC §12.1): Birbank qırmızı, Pashapay = kateqoriya 1. */
export function CompanyBadge({ company }: { company: string }) {
  const color = company === 'Birbank' ? 'var(--company-birbank)' : company === 'Pashapay' ? 'var(--cat-1)' : 'var(--muted)';
  return (
    <span className={s.company}>
      <i style={{ background: color }} aria-hidden="true" />
      {company}
    </span>
  );
}

const ICON = { critical: AlertCircle, warning: AlertTriangle, good: CheckCircle2, idle: MinusCircle };

/** Yük faizi: rəng + ikon (rəng tək məna daşıyıcısı deyil — SPEC §12.2). */
export function LoadChip({ load, level, title }: { load: number; level: LoadLevel; title?: string }) {
  const Icon = ICON[level];
  return (
    <span className={`${s.level} ${s[level]}`} title={title}>
      <Icon size={14} aria-hidden="true" />
      {fmtPct(load)}
    </span>
  );
}

/** Yük zolağı 0–150%; 100% xətti. */
export function LoadBar({ load, level, label }: { load: number; level: LoadLevel; label: string }) {
  const w = Math.min(1.5, Number.isFinite(load) ? load : 1.5) / 1.5;
  return (
    <div
      className={s.bar}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={150}
      aria-valuenow={Math.round(load * 100)}
      aria-label={label}
    >
      <span className={s[`fill${level}`]} style={{ width: `${w * 100}%` }} />
      <i className={s.mark} style={{ left: `${(1 / 1.5) * 100}%` }} aria-hidden="true" />
    </div>
  );
}
