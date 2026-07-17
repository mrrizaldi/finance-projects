import { MoreMenu } from '@/components/layout/MoreMenu';
import { useTranslation } from 'react-i18next';

export default function MorePage() {
  const { t } = useTranslation();
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">{t('nav.more')}</h1>
      <MoreMenu />
    </div>
  );
}
