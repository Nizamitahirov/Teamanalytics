import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';

// Saat Bakı vaxtı ilə (SPEC §12.4)
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baku' });

/** Sinxron statusu: Sinxron · 14:05 / Saxlanır… / Offline — 3 dəyişiklik gözləyir / Yazılmadı (SPEC §4.3, §5). */
export function SyncPill({ className }: { className?: string }) {
  const { t } = useI18n();
  const status = useData((s) => s.status);
  const pending = useData((s) => s.queue.reduce((n, b) => n + b.filter((op) => op.t !== 'log').length, 0));
  const syncedAt = useData((s) => s.syncedAt);
  const error = useData((s) => s.error);
  const text =
    status === 'offline'
      ? pending
        ? t('sync.offline', { n: pending })
        : t('sync.offlineEmpty')
      : status === 'saving'
        ? t('sync.saving', { n: pending })
        : status === 'error'
          ? t('sync.error')
          : status === 'idle'
            ? t('sync.idle', { time: syncedAt ? timeFmt.format(new Date(syncedAt)) : '—' })
            : t('sync.loading');
  return (
    <div
      className={className}
      role="status"
      data-status={status}
      title={status === 'error' && error ? error : text}
      data-testid="sync-pill"
    >
      <i aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
