import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { buttonClass } from '../../components/Button';
import { useI18n } from '../../lib/i18n';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<Compass size={26} />}
      title={t('page.notFound')}
      actions={
        <Link className={buttonClass('primary')} to="/">
          {t('notFound.home')}
        </Link>
      }
    >
      {t('notFound.body')}
    </EmptyState>
  );
}
